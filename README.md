<div align="center">

# Picky

### As picky as you are.

**Keep the moments. Get your time back.**

Personalized AI photo curation for the everyday smartphone photographer.

**Invisible Interfaces · Track 4: AI-Powered Consumer Products for 1 Billion People**

[The opportunity](#a-global-habit-a-recurring-problem) · [The experience](#how-picky-works) · [Invisible Interfaces](#built-for-invisible-interfaces) · [Commercial potential](#a-focused-start-with-room-to-grow) · [Run Picky](#run-picky)

</div>

Picky helps smartphone photographers reclaim the time and attention spent choosing between similar photos. It detects new shots, recommends which portraits to keep, and learns personal preferences from quick A/B choices, so people can delegate more of the sorting work.

## A global habit. A recurring problem.

A day out can leave you with dozens of versions of the same moment: a slightly different smile, a different angle, a more natural expression. Taking the photos is easy. Choosing the few you actually want to keep takes attention, repeated comparisons, and decisions you may put off until later.

The work adds up:

- **Time:** opening a camera roll, comparing near-identical shots, and revisiting the same candidates.
- **Mental effort:** deciding which small differences matter to you in each set.
- **Clutter:** leaving the decision unfinished and keeping a growing collection of unwanted alternatives.
- **Personal mismatch:** a technically usable photo can still be one you would never choose.

**Picky's opportunity is to make a repeated personal decision easier to delegate.**

GSMA's *The Mobile Economy 2026* reports **5.8 billion unique mobile subscribers**, around 70% of the world's population.[1] Within that broad mobile ecosystem, Picky targets people who regularly take and compare photos on their phones. This is market context, rather than an estimate of Picky's customers or paying market.

Our starting audience is frequent portrait and selfie photographers who take many shots and share a few. The broader opportunity extends to travelers, families, and creators as the product expands beyond its current portrait focus.

## Give people their time back

Picky is designed to move users from reviewing an entire collection to checking a shortlist and making a few useful choices.

| Work people do today | What Picky takes on |
| --- | --- |
| Sort a day's photos into comparable sets | Group photos into scenes using capture time |
| Inspect each portrait for visible differences | Use a vision model to assess supported attributes and quality issues |
| Decide which candidates fit their taste | Rank candidates using accumulated personal preference evidence |
| Repeat their preferences for every new scene | Save feedback and reuse it in later selections |
| Manually manage unwanted alternatives | Offer optional, verified JPEG backup before confirmed removal |

**A small weekly saving can become meaningful at consumer scale.** If Picky saves someone **10 minutes of active sorting per week**, that is approximately **8.7 hours per year**. Across **1 million users**, the same assumption represents **8.7 million hours returned annually**.

*This is an illustrative calculation, not a measured result or adoption forecast: 10 × 52 ÷ 60 = 8.67 hours per person. Actual time savings and effort reduction remain to be measured in user studies.*

Our success metric is **less active sorting time while keeping the photos people actually want**. We will evaluate that alongside correction rate, repeat use, and recommendation quality on new photo sessions.

## How Picky works

1. **Notice the session.** Picky detects today's new photos when the app is active or returns to the foreground. After a configurable pause in shooting, it can start preparing suggestions.
2. **Find comparable shots.** Photos are grouped by capture time. The current prototype focuses on images containing one clearly visible person; scenery, food, screenshots, and unsupported images stay outside its portrait recommendations.
3. **Prepare a shortlist.** A vision model describes visible attributes. The selection logic recommends one to three keepers per scene using the current preference profile, with a generic starting rule before personal feedback exists.
4. **Learn from your choice.** When the selection rules surface an alternative, a quick A/B choice updates preference evidence. That evidence influences later recommendations and persists across sessions.
5. **Keep control.** Originals remain on the phone until the user explicitly confirms backup and removal. Optional Google Drive backup is verified before a photo becomes eligible for deletion.

The prototype provides three views: **Today** for suggestions, **Your call** for comparisons, and **Your taste** for accumulated preference evidence.

## Built for Invisible Interfaces

**The product direction is ambient curation: photography creates the context, the system does the repetitive work, and the user contributes small corrections when useful.**

Picky applies the challenge's sense–decide–act idea to an everyday consumer task:

| Layer | Picky's approach |
| --- | --- |
| **Sense** | Use photo-library changes and capture times to recognize new shooting activity |
| **Decide** | Combine visual observations with a persistent personal preference profile |
| **Act** | Prepare recommendations, send local reminders, and offer confirmed backup and removal |
| **Adapt** | Let explicit choices change how later photos are ranked |

This makes **Track 4: AI-Powered Consumer Products for 1 Billion People** our primary fit: a broad, recurring need with a path toward less screen-driven interaction. Timeouts, bounded retries, response validation, caching, and a configurable model-call cap also support the challenge's emphasis on systems that know when to stop.

**Today:** recommendations and A/B feedback use screens; detection runs while the app is active or when it returns to the foreground. Background reminders invite the user back. Voice interaction and full background curation are future work. The current prototype is a step toward the invisible experience, rather than a fully screen-free or continuously running agent.

## Personal taste, carried forward

Picky separates visual perception from preference learning.

- **Vision supplies observations:** relative attribute scores for facial presentation, pose, expression, and lighting within a scene.
- **Choices supply preference evidence:** explicit winners and losers update support and opposition counts for visible attributes.
- **Code supplies memory:** those counts determine ranking weights and persist on the device. Updating a preference requires no additional model call.

The default phone flow uses the existing preference counter. A separate experiment evaluates a regularized pairwise ranking model with fixed-anchor visual features. It is available for comparison, and does not replace the phone default until real-user evidence supports that change. Neither approach updates the VLM's weights.

The commercial hypothesis is that a useful personal preference history can make a recurring workflow easier to delegate. Whether it improves recommendations, reduces effort, and earns repeat use is what the pilot must establish.

## A focused start, with room to grow

**Start with a specific, frequent problem:** people taking multiple portraits during outings and choosing a small set to keep or share.

| Potential audience | Recurring need | Product value to validate |
| --- | --- | --- |
| Frequent selfie and portrait photographers | Choose between small changes in pose and expression | Fewer comparisons and recommendations that reflect personal taste |
| Social creators | Produce a usable shortlist after repeated shoots | Less selection work between capture and posting |
| Travelers and families, as the scope expands | Organize larger collections after events and trips | Less accumulated sorting work and easier access to meaningful moments |

**Distribution hypothesis:** begin in campus, photography, and creator communities where people take many photos and can compare Picky's suggestions with their own choices. Validate repeated use before broadening the audience.

**Business model hypothesis:** offer a free entry tier for occasional curation, then test a subscription for frequent use and higher processing allowances. Pricing and willingness to pay are unvalidated; payments are not implemented.

**Cost discipline:** vision analysis runs per uncached scene, with bounded retries. Cached observations can be reused, and preference updates run in code. The aim is to grow useful selections faster than inference cost, with usage limits tied to an eventual service tier.

**Expansion path:** broader photo types, purpose-specific profiles, voice entry points, reliable background scheduling, and integrations with existing photo workflows. These are product opportunities beyond the current single-person portrait prototype.

## Prototype status and validation

| Capability | Status |
| --- | --- |
| Today's photo reading, time-based grouping, foreground detection, and idle-triggered suggestions | Implemented |
| VLM scoring, personalized selection, A/B feedback, and device-local preference persistence | Implemented |
| Local notifications and optional verified Drive JPEG backup with confirmed removal | Implemented |
| New pairwise personal ranker and blind human-label collection workflow | Experimental |
| Voice entry, full background execution, broader photo types, and individual Drive sign-in | Future work |
| Measured time savings, real-user personalization lift, and production-scale economics | To validate |

The integrated codebase includes **39 automated tests** covering preference behavior, persistence, stale answers, partial failures, scoring validation, caching, call limits, and backup verification. Provider tests use fixtures. They establish implementation behavior, not aesthetic accuracy or measured user benefit; real-provider and iPhone end-to-end acceptance remain to be completed.

The evaluation workflow separates training and testing by capture session, hides predictions during labeling, supports ties and skips, and checks repeated-choice consistency. The next evidence to collect is whether personalization improves choices on unseen sessions and saves active review time. See [the experiment guide](server/README.md) and [current experimental findings](server/EXPERIMENTS.md).

## Trust and user control

- Photos submitted for visual analysis are sent to Anthropic. API credentials stay on the server; the preference profile is stored on the device.
- Explicit keep and replace choices provide learning evidence. Keeping both or skipping does not imply a relative preference.
- Removal requires user confirmation and the native deletion flow. Missing Drive configuration or failed verification leaves originals on the phone.
- Drive backup creates full-resolution JPEG copies. Original HEIC format, metadata, and Live Photo motion are not guaranteed to be preserved.
- The demo uses one configured Drive account. Public deployment requires individual authorization and production access controls.

## Run Picky

Use **Node.js 24** and install dependencies:

```bash
npm ci
```

Create a root `.env` file; keep it out of version control:

```dotenv
ANTHROPIC_API_KEY=your_key_here
MAX_VLM_CALLS=60
```

Optionally set `ANTHROPIC_MODEL` to a supported vision model available to your account. Start the development server:

```bash
npx expo start --tunnel
```

Open the project on an iPhone with Expo Go and grant photo access. Prepare a small set of today's single-person portraits for the demo. The current flow reads today's camera roll and synchronizes photos into **Picky Demo**; the reader supports up to 1,000 photos, with at most 12 per scene. The model-call cap may stop scoring before every scene is processed; failed scenes remain untouched.

The demo idle interval defaults to one minute. Set `EXPO_PUBLIC_IDLE_MINUTES=60` for a longer interval. iOS uses the real photo workflow; the web uses sample data. `EXPO_PUBLIC_USE_MOCK=1` enables the sample workflow on the phone.

For optional Drive backup, add the following server-side values to the same `.env`:

```dotenv
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token
```

The [Drive token helper](scripts/google-drive-token.mjs) supports one-time demo authorization. A production install also needs a separately deployed API and configured service origin; the development tunnel is not a production backend.

### Run a real-user study

```bash
npm run experiment:real
```

Open `http://127.0.0.1:3002`. Prepare separate `train` and `test` folders containing independent capture-session folders, each with 3–6 similar portraits. Use one participant and purpose per run. The study supports up to 24 sessions and 120 images. Full instructions, model configuration, output formats, and limitations are in [server/README.md](server/README.md).

### Verify the code

```bash
npm run test:preferences
npm run typecheck
npm run typecheck:backend
npm run lint
npm run lint:backend
```

## Inside the repository

| Area | Responsibility |
| --- | --- |
| [`src/app/`](src/app/) | Today, Your call, Your taste, and Expo API routes |
| [`src/lib/use-picky.tsx`](src/lib/use-picky.tsx) | Photo workflow, persistence, cancellation, and checkpoints |
| [`src/lib/taste.ts`](src/lib/taste.ts) | Default preference counter and selection rules |
| [`server/legacy-vision.ts`](server/legacy-vision.ts) | Default visual scoring, validation, caching, and call limits |
| [`src/lib/personalization/`](src/lib/personalization/) | Experimental pairwise preference model |
| [`server/study.ts`](server/study.ts) | Blind label collection and held-out evaluation |
| [`server/drive.ts`](server/drive.ts) | Verified JPEG backup |

Built with **Expo, React Native, TypeScript, Expo Router, Anthropic vision, and Google Drive**. Implementation decisions are documented in [server/DECISIONS.md](server/DECISIONS.md); the API contract is in [docs/backend-spec.md](docs/backend-spec.md).

---

**Picky's ambition: make personal photo curation useful enough to trust, and effortless enough to fade into everyday life.**

[1]: https://www.gsmaintelligence.com/research/the-mobile-economy-2026 "GSMA Intelligence, The Mobile Economy 2026 (March 2026)"
