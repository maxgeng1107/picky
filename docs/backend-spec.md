# Picky — backend spec (Lingge: `src/lib/` + `server/`)

Picky keeps the photos *you* would keep from each scene of the day, moves the rest to a Google Drive "Cloud Bin", and frees space on the phone. When unsure it asks one A vs B question; from the answers it learns which criteria you actually care about (e.g. "face looks smaller", not "facing the camera").

**Rule of thumb: the LLM scores, code counts.** The LLM only gates and scores photos. Picking, learning and statuses are plain code.

## Architecture

```
iPhone (Expo Go)                         Lingge's laptop (same hotspot)
expo-media-library  ── base64 JPEGs ──▶  server/ (Node + Express, port 3001)
expo-image-manipulator                     POST /api/select  → LLM (gates + scores + picks)
src/lib (state, learning)  ◀── JSON ────   POST /api/upload  → Google Drive
src/app (UI, Max)                          GET  /health
```

- The app only knows `EXPO_PUBLIC_API_URL=http://<laptop-hotspot-IP>:3001` (root `.env`).
- Secrets live only in `server/.env`: `LLM_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`. Never commit them (already in `.gitignore`).
- `express.json({ limit: "25mb" })` — the default limit breaks base64 uploads with 413.
- LLM: current vision model of the provider whose key we use, temperature 0, JSON only, strip code fences before `JSON.parse`, fallback on parse failure.
- Resize each photo to ~512 px wide JPEG (quality ~0.7) before sending.
- `USE_CACHE=1`: server returns the saved `/api/select` response for a known scene (key = sorted photo ids + profile statuses), stored in `server/cache/`. The demo must survive bad Wi-Fi.

## Contract

`src/lib/types.ts` is the shared contract (Lingge owns it; tell Max before changing a field).
The UI reads everything through `usePicky()` from `src/hooks/use-picky.ts`. At integration, point that file at the real implementation:

```ts
export { PickyProvider, usePicky } from '@/lib/use-picky';
```

`src/lib/use-picky.tsx` must export a `PickyProvider` component and a `usePicky()` hook returning `{ state: PickyState, actions: PickyActions }` — same shape as `src/mock/picky-mock.tsx`. **Read the mock first: its learning, ranking and review flow are the reference behavior.** `review.index` is 0-based.

## Server API

**POST `/api/select`**
Request: `{ sceneId, photos: [{ id, imageBase64 }], profile: TasteProfile, dimensions: [{ key, definition }], keep: 1 }`
Response: `{ label, noPerson: [id], gated: [id], scores: { [id]: Scores }, tasteKeep: [id], genericKeep: [id], ranking: [id], uncertain: [id], reasons: { [id]: string } }`
(`noPerson` = no person in the photo → drop it from the scene entirely; `gated` = person but a bad shot → binned.)

**POST `/api/upload`** (multipart: `file`, `name`) → `{ driveFileId }` only after Drive confirms.

**GET `/health`** → `{ ok: true }` (first thing to test from the phone: open `http://<IP>:3001/health` in iPhone Safari).

## Dimensions (seed criteria, all start at 0)

| key | name | kind | 5 = | 1 = |
|---|---|---|---|---|
| `face_small` | face looks smaller | beauty | far away / 2×–3× lens, ¾ angle, face small in frame | close-up 1× wide lens, face fills frame, shot from below |
| `jawline` | clean jawline | beauty | clean jawline, camera at/above eye level | double chin, chin tucked, shot from below |
| `big_eyes` | eyes look bigger | beauty | eyes fully open, catchlight | squinting, eyes shrink when smiling |
| `facing_camera` | facing the camera | style | fully frontal | full profile |
| `smile_teeth` | big smile with teeth | style | big smile with teeth | closed mouth, no smile |
| `camera_high` | shot from slightly above | style | clearly from above | clearly from below (3 = eye level) |

Also scored but not shown in the panel: `lighting` (face well lit, soft), `expression` (relaxed, natural).
Style dimensions measure how strongly the feature is present, not whether it is good.
Quality gates (not taste): closed eyes, blurry face, face not visible, mid-word mouth → `gated`.

## Algorithms

**Which photos (today-only, people-only).** Picky only ever touches **photos of a person taken today**. Everything else — scenery, food, screenshots, older photos — is never scored, never put in the Cloud Bin, never uploaded, never deleted.
- **Today-only (code, `src/lib`):** keep assets with `creationTime >= start of today (local midnight)`. Constant `TODAY_ONLY = true`; set it to `false` only if the demo photos weren't shot today.
- **People-only (Claude):** `/api/select` returns `noPerson: [id]` for photos without one clearly visible person. `src/lib` removes those ids from the scene and from `photosById` entirely (not `binned`).
- Demo source: album **"Picky Demo"** with single-person photos only (iOS doesn't give third-party apps "is this the user" face recognition; group photos are out of scope).

**Scenes.** Sort by `creationTime`. New scene when the gap to the previous photo > `SCENE_GAP_MIN` minutes (demo: 5, constant). Ask for **full** photo access.

**Select prompt (system):**
> You are Picky, a photo curator. You get numbered photos of the same person taken in one scene, a list of scoring dimensions with definitions, and the user's taste profile (criteria with status). 0) noPerson: ids of photos that do not show one clearly visible person (scenery, food, screenshots, objects) — do not score them. 1) gated: ids of photos with closed eyes, heavy blur, no visible face, or a mid-word mouth. 2) scores: for every other photo, score each dimension from 1 to 5 RELATIVE to the other photos in this scene (best in this scene = 5, worst = 1; spread the scores; use null if a body dimension is not visible). Style dimensions measure how strongly the feature is present, not whether it is good. 3) tasteKeep: choose exactly {keep} photo id(s) that best match the profile — strongly favor "confident" criteria, avoid "avoid" ones (for style criteria "avoid" means the user prefers the opposite), mildly favor "leaning", ignore "unknown" and "doesnt_care". If the profile is empty, choose like a generic photo app. 4) genericKeep: what a generic photo app would keep (sharpest, eyes open, biggest smile, facing the camera). 5) uncertain: up to 3 runner-up ids closest to your tasteKeep pick. 6) reasons: one short sentence per kept id naming the criterion. 7) label: a 2–4 word scene name. Reply with JSON only: {"label":"","noPerson":[],"gated":[],"scores":{"<id>":{"<dimension>":3}},"tasteKeep":[],"genericKeep":[],"ranking":[],"uncertain":[],"reasons":{}}

**Picking keepers (code, 1–3 per scene).** People usually keep several photos from one scene, so Picky keeps more than one. Once a scene has scores, picking is plain code and is re-run after every answer — no new LLM call (`curateScene` / `pickKeepers` in the mock are the reference):
- Score for this user: `tasteScore = Σ weight(status) × (score − 3)` with weights confident +2 · leaning ±1 (sign of support − against) · avoid −2 · doesnt_care / unknown 0. With no evidence yet, use the generic score `facing_camera + smile_teeth + big_eyes`.
- Sort by that score. Keep every photo within `KEEP_MARGIN = 2` of the best one, **at least 1, at most `MAX_KEEP = 3`**.
- Skip near-duplicates: if a photo's scores differ from an already-kept photo by a total of ≤ `NEAR_DUPLICATE_DIFF = 1` across all dimensions, it's the same shot — don't keep both.
- `uncertain` (A vs B challengers) = the best non-kept runner-ups. In the review, A = the scene's first kept photo.
- COULD: if the user often answers "Keep both", raise `MAX_KEEP` for them.
- Claude's own `tasteKeep` is only a fallback (e.g. if code ranking fails).

**Learning (code, no LLM).** For winner W and loser L, for each criterion key `d` with both scores non-null: `diff = score[W][d] − score[L][d]`; `diff >= DIFF_MIN` → `support += 1`, `lastChange = "up"`; `diff <= −DIFF_MIN` → `against += 1`, `lastChange = "down"`; else no evidence. `DIFF_MIN = 2` (tune on real scene-1 photos). Clear `lastChange` on all criteria before each update.

**Status.** `total = support + against`. `total == 0` → unknown · `total >= 3 && |support − against| <= 1` → doesnt_care · `support − against >= 2` → confident · `against − support >= 2` → avoid · else leaning.

**Answers.** `keepA` → winner A, loser B. `replace` → winner B, loser A, swap kept/binned. `keepBoth` → B becomes kept, no learning. `skip` → next challenger. After a scene's questions end, re-curate the remaining scenes with the updated profile.

**Free up space.** For each binned, not-yet-uploaded photo: `POST /api/upload` → store `driveFileId`. Then `MediaLibrary.deleteAssetsAsync(ids with driveFileId)` → Apple's confirmation dialog → mark `deleted`, add to `freedBytes`. A photo whose upload failed is never deleted.

**Simulated night.** `simulateNight()` = curate all scenes, then schedule a local notification 5 s later with `expo-notifications` (title "Picky tidied N photos", body "K need your call · Free up X MB"). The tap → Review navigation is already wired in `src/app/_layout.tsx`.

## Google Drive (server)

`googleapis` OAuth2 client with the refresh token from `server/.env`; scope `drive.file`; create folder **"Picky Cloud Bin"** on first upload; set `appProperties.expiresAt` = now + 30 days on each file.

## Checkpoints

- **14:45 A** phone reaches server (`/health`), album reads, `/api/select` gives sensible scores + pick
- **15:40 B** swap mock → real hook
- **16:15 C** learning story works end to end on the phone
- **16:45 feature freeze** · 18:10 submit
