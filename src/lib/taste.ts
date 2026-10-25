// Picky's engine: pure functions over PickyState. Claude only scores photos;
// everything here — picking keepers, choosing questions, learning — is plain code.
import type {
  Answer,
  Criterion,
  CriterionStatus,
  Photo,
  PickyState,
  Scene,
  Scores,
  TasteProfile,
} from '@/lib/types';

export const DIFF_MIN = 2; // score gap that counts as evidence
export const MAX_KEEP = 3; // keep 1–3 photos per scene
export const KEEP_MARGIN = 2; // keep photos whose score is within 2 of the best one
export const NEAR_DUPLICATE_DIFF = 1; // total score difference at or below this = same shot
export const FIRST_SCENE_QUESTIONS = 2; // with no evidence yet, ask a bit more
export const LATER_SCENE_QUESTIONS = 1;
export const UNCERTAIN_MARGIN = 4; // later scenes only ask when a runner-up is this close

export const DIMENSIONS: { key: string; name: string; kind: Criterion['kind']; definition: string; shown: boolean }[] = [
  {
    key: 'face_small',
    name: 'face looks smaller',
    kind: 'beauty',
    shown: true,
    definition:
      '5 = face looks small and slim (shot from further away / 2×–3× lens, slight ¾ angle, face small in frame); 1 = face looks big (close-up with wide 1× lens, face fills the frame, shot from below)',
  },
  {
    key: 'jawline',
    name: 'clean jawline',
    kind: 'beauty',
    shown: true,
    definition: '5 = clean, defined jawline, no double chin; 1 = double chin, chin tucked in, shot from below',
  },
  {
    key: 'big_eyes',
    name: 'eyes look bigger',
    kind: 'beauty',
    shown: true,
    definition: '5 = eyes fully open, bright, catchlight; 1 = squinting or eyes shrunk by smiling',
  },
  {
    key: 'facing_camera',
    name: 'facing the camera',
    kind: 'style',
    shown: true,
    definition: 'how frontal the face is: 5 = fully frontal; 3 = ¾ angle; 1 = full profile',
  },
  {
    key: 'smile_teeth',
    name: 'big smile with teeth',
    kind: 'style',
    shown: true,
    definition: 'how big the smile is: 5 = big smile showing teeth; 3 = closed-mouth smile; 1 = no smile',
  },
  {
    key: 'camera_high',
    name: 'shot from slightly above',
    kind: 'style',
    shown: true,
    definition: 'camera height: 5 = clearly shot from above; 3 = eye level; 1 = clearly shot from below',
  },
  {
    key: 'lighting',
    name: 'flattering light',
    kind: 'beauty',
    shown: false,
    definition: '5 = face evenly and softly lit; 1 = face dark (backlit), harsh shadows or strong color cast',
  },
  {
    key: 'expression',
    name: 'natural expression',
    kind: 'beauty',
    shown: false,
    definition: '5 = relaxed, natural expression; 1 = stiff, forced or awkward expression',
  },
];

export function emptyProfile(): TasteProfile {
  return {
    criteria: DIMENSIONS.filter((d) => d.shown).map(({ key, name, kind }) => ({
      key,
      name,
      kind,
      support: 0,
      against: 0,
      status: 'unknown' as const,
    })),
  };
}

export function statusOf(support: number, against: number): CriterionStatus {
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

export function learn(profile: TasteProfile, winner?: Scores, loser?: Scores): TasteProfile {
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

const WEIGHT: Record<CriterionStatus, number> = { confident: 2, leaning: 1, avoid: -2, doesnt_care: 0, unknown: 0 };

export function tasteScore(scores: Scores, profile: TasteProfile): number {
  return profile.criteria.reduce((sum, c) => {
    const s = scores[c.key];
    if (s == null) return sum;
    const w = c.status === 'leaning' ? Math.sign(c.support - c.against) : WEIGHT[c.status];
    return sum + w * (s - 3);
  }, 0);
}

// What a generic photo app keeps: frontal, big smile, eyes open, decent light.
export function genericScore(scores: Scores): number {
  return (
    (scores.facing_camera ?? 0) + (scores.smile_teeth ?? 0) + (scores.big_eyes ?? 0) + (scores.lighting ?? 0) * 0.5
  );
}

export function hasEvidence(profile: TasteProfile) {
  return profile.criteria.some((c) => c.support + c.against > 0);
}

function isNearDuplicate(a: Photo, b: Photo): boolean {
  if (!a.scores || !b.scores) return false;
  const diff = Object.keys(a.scores).reduce(
    (sum, k) => sum + Math.abs((a.scores![k] ?? 0) - (b.scores![k] ?? 0)),
    0,
  );
  return diff <= NEAR_DUPLICATE_DIFF;
}

// Keep every photo that scores close to the best one (1 to MAX_KEEP), skipping near-identical shots.
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

function totalDiff(a: Scores, b: Scores) {
  return Object.keys(a).reduce((sum, k) => sum + Math.abs((a[k] ?? 3) - (b[k] ?? 3)), 0);
}

// Which runner-ups to ask about. With no evidence yet, ask about the photos that differ most
// from the keeper (each answer teaches the most). Later, only ask when a runner-up is close.
function pickChallengers(
  kept: Photo[],
  others: Photo[],
  score: (p: Photo) => number,
  useTaste: boolean,
  asked: number,
): Photo[] {
  if (others.length === 0) return [];
  if (!useTaste) {
    const a = kept[0].scores!;
    return [...others]
      .sort((x, y) => totalDiff(y.scores!, a) - totalDiff(x.scores!, a))
      .slice(0, asked === 0 ? FIRST_SCENE_QUESTIONS : LATER_SCENE_QUESTIONS);
  }
  const worstKept = Math.min(...kept.map(score));
  return [...others]
    .sort((x, y) => score(y) - score(x))
    .filter((p) => worstKept - score(p) <= UNCERTAIN_MARGIN)
    .slice(0, LATER_SCENE_QUESTIONS);
}

export function reasonFor(kept: Photo, others: Photo[], profile: TasteProfile): string {
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

// Rank one unreviewed, scored scene with the current profile and set its keepers + questions.
export function curateScene(state: PickyState, sceneId: string, asked: number): PickyState {
  const sceneIdx = state.scenes.findIndex((s) => s.id === sceneId);
  const scene = state.scenes[sceneIdx];
  const photos = scene.photoIds.map((id) => state.photosById[id]);
  const candidates = photos.filter((p) => !p.gated && p.scores);
  if (candidates.length === 0) {
    // nothing usable (all blurry / eyes closed): keep the first photo, never delete without a choice
    const first = photos[0];
    if (!first) return state;
    const scenes = [...state.scenes];
    scenes[sceneIdx] = { ...scene, keptIds: [first.id], genericKeptIds: [first.id], uncertainIds: [] };
    return { ...state, scenes };
  }
  const useTaste = hasEvidence(state.profile);
  const score = (p: Photo) => (useTaste ? tasteScore(p.scores!, state.profile) : genericScore(p.scores!));
  const byGeneric = [...candidates].sort((a, b) => genericScore(b.scores!) - genericScore(a.scores!));
  const ranked = [...candidates].sort((a, b) => score(b) - score(a));
  const kept = pickKeepers(ranked, score);
  const keptIds = kept.map((p) => p.id);
  const others = candidates.filter((c) => !keptIds.includes(c.id));
  const challengers = pickChallengers(kept, others, score, useTaste, asked);

  const photosById = { ...state.photosById };
  for (const p of photos) {
    const isKept = keptIds.includes(p.id);
    photosById[p.id] = {
      ...p,
      status: isKept ? 'kept' : 'binned',
      isGenericPick: p.id === byGeneric[0].id,
      reason: isKept ? reasonFor(p, others, state.profile) : undefined,
    };
  }
  const scenes = [...state.scenes];
  scenes[sceneIdx] = {
    ...scene,
    keptIds,
    genericKeptIds: [byGeneric[0].id],
    uncertainIds: challengers.map((p) => p.id),
  };
  return { ...state, photosById, scenes };
}

function remainingQuestions(scenes: Scene[]) {
  return scenes.filter((s) => !s.reviewed).reduce((n, s) => n + s.uncertainIds.length, 0);
}

// Re-rank every unreviewed scene, then point `review` at the next question (index is 0-based).
export function advance(state: PickyState, index: number): PickyState {
  let next = state;
  for (const s of state.scenes) if (!s.reviewed) next = curateScene(next, s.id, index);
  const scene = next.scenes.find((s) => !s.reviewed && s.uncertainIds.length > 0);
  if (!scene) {
    return { ...next, scenes: next.scenes.map((s) => ({ ...s, reviewed: true })), review: null };
  }
  return {
    ...next,
    review: {
      sceneId: scene.id,
      aId: scene.keptIds[0],
      bId: scene.uncertainIds[0],
      index,
      total: index + remainingQuestions(next.scenes),
    },
  };
}

export function applyAnswer(state: PickyState, a: Answer): PickyState {
  const review = state.review;
  if (!review) return state;
  const { sceneId, aId, bId } = review;
  const A = state.photosById[aId];
  const B = state.photosById[bId];
  let profile = state.profile;
  let photosById = state.photosById;
  const sceneIdx = state.scenes.findIndex((s) => s.id === sceneId);
  let scene = state.scenes[sceneIdx];

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

  const remaining = scene.uncertainIds.slice(scene.uncertainIds.indexOf(bId) + 1);
  scene = { ...scene, reviewed: remaining.length === 0 };
  const scenes = [...state.scenes];
  scenes[sceneIdx] = scene;
  const next: PickyState = { ...state, profile, photosById, scenes };

  if (remaining.length > 0) {
    return { ...next, review: { ...review, aId: scene.keptIds[0], bId: remaining[0], index: review.index + 1 } };
  }
  return advance(next, review.index + 1);
}

// Remember the profile after every answer that taught something (for the accuracy curve).
export function withHistory(prev: PickyState, next: PickyState): PickyState {
  if (next.profile === prev.profile) return next;
  return { ...next, profileHistory: [...(prev.profileHistory ?? [prev.profile]), next.profile] };
}

// Accuracy test: re-pick every marked scene from scratch with `profile` and count how often the
// keepers include your pick. A generic app (no taste) is scored with the same 1–3 keeper rule.
export function evaluate(state: PickyState, profile: TasteProfile, picks: Record<string, string>) {
  let picky = 0;
  let generic = 0;
  let total = 0;
  const useTaste = hasEvidence(profile);
  const tasteOrGeneric = (p: Photo) => (useTaste ? tasteScore(p.scores!, profile) : genericScore(p.scores!));
  const genericOnly = (p: Photo) => genericScore(p.scores!);
  for (const scene of state.scenes) {
    const pick = picks[scene.id];
    if (!pick) continue;
    const candidates = scene.photoIds.map((id) => state.photosById[id]).filter((p) => p && !p.gated && p.scores);
    if (candidates.length === 0) continue;
    total += 1;
    const byTaste = [...candidates].sort((a, b) => tasteOrGeneric(b) - tasteOrGeneric(a));
    if (pickKeepers(byTaste, tasteOrGeneric).some((p) => p.id === pick)) picky += 1;
    const byGeneric = [...candidates].sort((a, b) => genericOnly(b) - genericOnly(a));
    if (pickKeepers(byGeneric, genericOnly).some((p) => p.id === pick)) generic += 1;
  }
  return { picky, generic, total };
}

export function applyRescue(state: PickyState, id: string): PickyState {
  const photo = state.photosById[id];
  const scene = state.scenes.find((sc) => sc.id === photo.sceneId);
  if (!scene) return state;
  const kept = state.photosById[scene.keptIds[0]];
  const profile = learn(state.profile, photo.scores, kept?.scores);
  return {
    ...state,
    profile,
    scenes: state.scenes.map((sc) => (sc.id === scene.id ? { ...sc, keptIds: [...sc.keptIds, id] } : sc)),
    photosById: { ...state.photosById, [id]: { ...photo, status: 'kept', rescued: true, deleted: false } },
  };
}
