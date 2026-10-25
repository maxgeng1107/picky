// Fake usePicky() for building the UI before the real lib/ is ready.
// Same shape as the real hook: const { state, actions } = usePicky().
// The scores are hand-made so the demo story plays out:
//   scene 1: side face wins twice  → "face looks smaller" ↑, "facing the camera" ↓
//   scene 2: frontal face wins     → "facing the camera" becomes "doesn't care"
//   scene 3: no question needed    → generic app and Picky keep different photos
// Each scene keeps 1–3 photos: everything scoring close to the best one (see pickKeepers).
import * as Notifications from 'expo-notifications';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import type {
  Answer,
  Criterion,
  CriterionStatus,
  Photo,
  PhotoId,
  PickyActions,
  PickyContextValue,
  PickyState,
  Scene,
  Scores,
  TasteProfile,
} from '@/lib/types';
import { withHistory } from '@/lib/taste';

const DIFF_MIN = 2;
const MAX_KEEP = 3; // keep 1–3 photos per scene
const KEEP_MARGIN = 2; // keep photos whose score is within 2 of the best one
const NEAR_DUPLICATE_DIFF = 1; // total score difference at or below this = same shot
const MB = 1024 * 1024;

const SEED_CRITERIA: Pick<Criterion, 'key' | 'name' | 'kind'>[] = [
  { key: 'face_small', name: 'face looks smaller', kind: 'beauty' },
  { key: 'jawline', name: 'clean jawline', kind: 'beauty' },
  { key: 'big_eyes', name: 'eyes look bigger', kind: 'beauty' },
  { key: 'facing_camera', name: 'facing the camera', kind: 'style' },
  { key: 'smile_teeth', name: 'big smile with teeth', kind: 'style' },
  { key: 'camera_high', name: 'shot from slightly above', kind: 'style' },
];

// [face_small, jawline, big_eyes, facing_camera, smile_teeth, camera_high]; null = gated photo
type Row = [id: string, scores: number[] | null, mb: number];

const MOCK_SCENES: { id: string; label: string; askCount: number; pool: PhotoId[]; rows: Row[] }[] = [
  {
    id: 's1',
    label: 'Under the tree',
    askCount: 2,
    pool: ['p2', 'p3'],
    rows: [
      ['p1', [2, 3, 4, 5, 5, 3], 3.4],
      ['p2', [5, 4, 3, 2, 2, 3], 3.1],
      ['p3', [3, 3, 3, 4, 4, 3], 3.6],
      ['p4', null, 3.2],
      ['p5', [2, 2, 3, 5, 3, 2], 3.8],
      ['p6', [3, 3, 2, 3, 1, 3], 3.3],
    ],
  },
  {
    id: 's2',
    label: 'Against the wall',
    askCount: 1,
    pool: ['p7', 'p8'],
    rows: [
      ['p7', [5, 4, 4, 5, 3, 5], 3.9],
      ['p8', [3, 3, 3, 1, 2, 3], 3.5],
      ['p9', [2, 2, 4, 5, 5, 2], 4.1],
      ['p10', [3, 3, 3, 2, 2, 1], 3.0],
      ['p11', null, 3.7],
    ],
  },
  {
    id: 's3',
    label: 'At the venue',
    askCount: 0,
    pool: [],
    rows: [
      ['p12', [2, 3, 4, 5, 5, 3], 4.2],
      ['p13', [5, 5, 4, 3, 3, 4], 3.8],
      ['p14', [4, 3, 3, 4, 4, 3], 3.4],
      ['p15', null, 3.6],
    ],
  },
];

const TOTAL_QUESTIONS = MOCK_SCENES.reduce((n, s) => n + s.askCount, 0);

function makeInitialState(): PickyState {
  const photosById: Record<PhotoId, Photo> = {};
  const start = Date.now() - 6 * 60 * 60 * 1000;
  const scenes: Scene[] = MOCK_SCENES.map((s, si) => {
    s.rows.forEach(([id, scores, mb], pi) => {
      photosById[id] = {
        id,
        uri: `https://picsum.photos/seed/picky-${id}/600/800`,
        takenAt: start + si * 40 * 60 * 1000 + pi * 20 * 1000,
        sizeBytes: Math.round(mb * MB),
        sceneId: s.id,
        status: 'kept',
        gated: scores === null,
        scores: scores
          ? Object.fromEntries(SEED_CRITERIA.map((c, i) => [c.key, scores[i]]))
          : undefined,
      };
    });
    return {
      id: s.id,
      label: s.label,
      photoIds: s.rows.map(([id]) => id),
      keptIds: [],
      genericKeptIds: [],
      uncertainIds: [],
      reviewed: false,
    };
  });
  return {
    photosById,
    scenes,
    profile: {
      criteria: SEED_CRITERIA.map((c) => ({ ...c, support: 0, against: 0, status: 'unknown' })),
    },
    review: null,
    busy: false,
    freedBytes: 0,
  };
}

// ---- taste logic (mirrors plan §9.4 / §9.5; the real version lives in lib/taste.ts) ----

function statusOf(support: number, against: number): CriterionStatus {
  const total = support + against;
  if (total === 0) return 'unknown';
  if (total >= 3 && Math.abs(support - against) <= 1) return 'doesnt_care';
  if (support - against >= 2) return 'confident';
  if (against - support >= 2) return 'avoid';
  return 'leaning';
}

function summarize(criteria: Criterion[]): string | undefined {
  const cares = criteria.filter((c) => c.status === 'confident').map((c) => c.name);
  const avoids = criteria.filter((c) => c.status === 'avoid').map((c) => c.name);
  const ignores = criteria.filter((c) => c.status === 'doesnt_care').map((c) => c.name);
  const parts: string[] = [];
  if (cares.length) parts.push(`You care about ${cares.join(' and ')}.`);
  if (ignores.length) parts.push(`You don't care about ${ignores.join(' or ')}.`);
  if (avoids.length) parts.push(`You avoid ${avoids.join(' and ')}.`);
  return parts.length ? parts.join(' ') : undefined;
}

function learn(profile: TasteProfile, winner?: Scores, loser?: Scores): TasteProfile {
  if (!winner || !loser) return profile;
  const criteria = profile.criteria.map((c) => {
    const w = winner[c.key];
    const l = loser[c.key];
    const next: Criterion = { ...c, lastChange: undefined };
    if (w == null || l == null) return next;
    const diff = w - l;
    if (diff >= DIFF_MIN) {
      next.support += 1;
      next.lastChange = 'up';
    } else if (diff <= -DIFF_MIN) {
      next.against += 1;
      next.lastChange = 'down';
    }
    next.status = statusOf(next.support, next.against);
    return next;
  });
  return { criteria, summary: summarize(criteria) };
}

const WEIGHT: Record<CriterionStatus, number> = {
  confident: 2,
  leaning: 1,
  avoid: -2,
  doesnt_care: 0,
  unknown: 0,
};

function tasteScore(scores: Scores, profile: TasteProfile): number {
  return profile.criteria.reduce((sum, c) => {
    const s = scores[c.key];
    if (s == null) return sum;
    // a "leaning" criterion can lean either way
    const w = c.status === 'leaning' ? Math.sign(c.support - c.against) : WEIGHT[c.status];
    return sum + w * (s - 3);
  }, 0);
}

function genericScore(scores: Scores): number {
  return (scores.facing_camera ?? 0) + (scores.smile_teeth ?? 0) + (scores.big_eyes ?? 0);
}

function hasEvidence(profile: TasteProfile) {
  return profile.criteria.some((c) => c.support + c.against > 0);
}

function reasonFor(kept: Photo, others: Photo[], profile: TasteProfile): string {
  if (!hasEvidence(profile)) return 'Kept: sharpest, biggest smile — what any photo app would pick';
  let best: { c: Criterion; k: number; o: number } | null = null;
  for (const c of profile.criteria) {
    if (c.status !== 'confident' && !(c.status === 'leaning' && c.support > c.against)) continue;
    const k = kept.scores?.[c.key];
    const scored = others.map((p) => p.scores?.[c.key]).filter((v): v is number => v != null);
    if (k == null || scored.length === 0) continue;
    const o = Math.max(...scored);
    if (!best || k - o > best.k - best.o) best = { c, k, o };
  }
  if (!best) return 'Kept: best match for your taste so far';
  if (best.k <= best.o) return 'Kept: almost as good as the top pick, different shot';
  return `Kept: ${best.c.name} (${best.k} vs ${best.o})`;
}

// Rank one unreviewed scene with the current profile. The real app can do the same:
// the LLM only scores photos, and the pick can be re-ranked locally after every answer.
function curateScene(state: PickyState, sceneId: string): PickyState {
  const sceneIdx = state.scenes.findIndex((s) => s.id === sceneId);
  const scene = state.scenes[sceneIdx];
  const mock = MOCK_SCENES.find((s) => s.id === sceneId)!;
  const photos = scene.photoIds.map((id) => state.photosById[id]);
  const candidates = photos.filter((p) => !p.gated && p.scores);
  if (candidates.length === 0) return state;
  const useTaste = hasEvidence(state.profile);
  const score = (p: Photo) => (useTaste ? tasteScore(p.scores!, state.profile) : genericScore(p.scores!));
  const byGeneric = [...candidates].sort((a, b) => genericScore(b.scores!) - genericScore(a.scores!));
  const ranked = [...candidates].sort((a, b) => score(b) - score(a));
  const kept = pickKeepers(ranked, score);
  const keptIds = kept.map((p) => p.id);
  const generic = byGeneric[0];
  const others = candidates.filter((c) => !keptIds.includes(c.id));

  const photosById = { ...state.photosById };
  for (const p of photos) {
    const isKept = keptIds.includes(p.id);
    photosById[p.id] = {
      ...p,
      status: isKept ? 'kept' : 'binned',
      isGenericPick: p.id === generic.id,
      reason: isKept ? reasonFor(p, others, state.profile) : undefined,
    };
  }
  const scenes = [...state.scenes];
  scenes[sceneIdx] = {
    ...scene,
    keptIds,
    genericKeptIds: [generic.id],
    uncertainIds: mock.pool.filter((id) => !keptIds.includes(id)).slice(0, mock.askCount),
  };
  return { ...state, photosById, scenes };
}

// Keep every photo that scores close to the best one (1 to MAX_KEEP photos),
// skipping near-identical shots so the keepers are actually different.
function pickKeepers(ranked: Photo[], score: (p: Photo) => number): Photo[] {
  const best = score(ranked[0]);
  const kept: Photo[] = [];
  for (const p of ranked) {
    if (kept.length >= MAX_KEEP) break;
    if (kept.length > 0 && best - score(p) > KEEP_MARGIN) break;
    if (kept.some((k) => isNearDuplicate(k, p))) continue;
    kept.push(p);
  }
  return kept;
}

function isNearDuplicate(a: Photo, b: Photo): boolean {
  if (!a.scores || !b.scores) return false;
  const diff = Object.keys(a.scores).reduce(
    (sum, k) => sum + Math.abs((a.scores![k] ?? 0) - (b.scores![k] ?? 0)),
    0,
  );
  return diff <= NEAR_DUPLICATE_DIFF;
}

// Re-rank every scene that hasn't been reviewed, then point `review` at the next question.
function advance(state: PickyState, index: number): PickyState {
  let next = state;
  for (const s of state.scenes) if (!s.reviewed) next = curateScene(next, s.id);
  const scene = next.scenes.find((s) => !s.reviewed && s.uncertainIds.length > 0);
  if (!scene) {
    const scenes = next.scenes.map((s) => ({ ...s, reviewed: true }));
    return { ...next, scenes, review: null };
  }
  return {
    ...next,
    review: { sceneId: scene.id, aId: scene.keptIds[0], bId: scene.uncertainIds[0], index, total: TOTAL_QUESTIONS },
  };
}

function applyAnswer(state: PickyState, a: Answer): PickyState {
  const review = state.review;
  if (!review) return state;
  const { sceneId, aId, bId } = review;
  const A = state.photosById[aId];
  const B = state.photosById[bId];
  let profile = state.profile;
  let photosById = state.photosById;
  let scenes = state.scenes;
  const sceneIdx = scenes.findIndex((s) => s.id === sceneId);
  let scene = scenes[sceneIdx];

  if (a === 'keepA') profile = learn(profile, A.scores, B.scores);
  if (a === 'replace') {
    profile = learn(profile, B.scores, A.scores);
    photosById = {
      ...photosById,
      [aId]: { ...A, status: 'binned', reason: undefined },
      [bId]: { ...B, status: 'kept', reason: reasonFor(B, [A], profile) },
    };
    scene = { ...scene, keptIds: scene.keptIds.map((id) => (id === aId ? bId : id)) };
  }
  if (a === 'keepBoth') {
    photosById = { ...photosById, [bId]: { ...B, status: 'kept', reason: 'Kept: you wanted both' } };
    scene = { ...scene, keptIds: [...scene.keptIds, bId] };
  }

  // next challenger in this scene, or finish the scene
  const remaining = scene.uncertainIds.slice(scene.uncertainIds.indexOf(bId) + 1);
  scene = { ...scene, reviewed: remaining.length === 0 };
  scenes = [...scenes];
  scenes[sceneIdx] = scene;
  const next: PickyState = { ...state, profile, photosById, scenes };

  if (remaining.length > 0) {
    return {
      ...next,
      review: { ...review, aId: scene.keptIds[0], bId: remaining[0], index: review.index + 1 },
    };
  }
  return advance(next, review.index + 1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scheduleNightNotification(state: PickyState) {
  if (Platform.OS === 'web') return;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const photos = Object.values(state.photosById);
  const binnedMb = photos
    .filter((p) => p.status === 'binned' && !p.deleted)
    .reduce((n, p) => n + (p.sizeBytes ?? 0), 0) / MB;
  const asks = state.review ? state.review.total - state.review.index : 0;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Picky tidied ${photos.length} photos`,
      body: `${asks} need your call · Free up ${Math.round(binnedMb)} MB`,
      data: { screen: 'review' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
  });
}

const PickyMockContext = createContext<PickyContextValue | null>(null);

export function PickyMockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PickyState>(makeInitialState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const simulateNight = useCallback(async () => {
    setState((s) => ({ ...s, busy: true }));
    await sleep(1200);
    const fresh = makeInitialState();
    const curated = {
      ...advance(fresh, 0),
      freedBytes: stateRef.current.freedBytes,
      profileHistory: [fresh.profile],
      myPicks: stateRef.current.myPicks,
    };
    setState(curated);
    await scheduleNightNotification(curated);
  }, []);

  const freeUpSpace = useCallback(async () => {
    setState((s) => ({ ...s, busy: true }));
    await sleep(1500);
    setState((s) => {
      let freed = 0;
      const photosById = { ...s.photosById };
      for (const p of Object.values(photosById)) {
        if (p.status === 'binned' && !p.deleted) {
          freed += p.sizeBytes ?? 0;
          photosById[p.id] = { ...p, deleted: true, driveFileId: `drive-${p.id}` };
        }
      }
      return { ...s, photosById, freedBytes: s.freedBytes + freed, busy: false };
    });
  }, []);

  const actions = useMemo<PickyActions>(
    () => ({
      loadAlbum: async () => {},
      curateNextScene: async () => {
        setState((s) => {
          const scene = s.scenes.find((sc) => !sc.reviewed && sc.keptIds.length === 0);
          return scene ? curateScene(s, scene.id) : s;
        });
      },
      simulateNight,
      answer: async (a) => setState((s) => withHistory(s, applyAnswer(s, a))),
      setMyPick: (sceneId, photoId) =>
        setState((s) => {
          const myPicks = { ...s.myPicks };
          if (myPicks[sceneId] === photoId) delete myPicks[sceneId];
          else myPicks[sceneId] = photoId;
          return { ...s, myPicks };
        }),
      freeUpSpace,
      rescue: (id) =>
        setState((s) => {
          const photo = s.photosById[id];
          const scene = s.scenes.find((sc) => sc.id === photo.sceneId)!;
          const kept = s.photosById[scene.keptIds[0]];
          const profile = learn(s.profile, photo.scores, kept?.scores);
          const scenes = s.scenes.map((sc) =>
            sc.id === scene.id ? { ...sc, keptIds: [...sc.keptIds, id] } : sc,
          );
          return {
            ...s,
            profile,
            scenes,
            photosById: { ...s.photosById, [id]: { ...photo, status: 'kept', rescued: true, deleted: false } },
          };
        }),
      reset: () => setState(makeInitialState()),
    }),
    [simulateNight, freeUpSpace],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <PickyMockContext.Provider value={value}>{children}</PickyMockContext.Provider>;
}

export function usePickyMock(): PickyContextValue {
  const ctx = useContext(PickyMockContext);
  if (!ctx) throw new Error('usePicky must be used inside <PickyProvider>');
  return ctx;
}
