// Frozen counter baseline from main@23f2b9f. Never use the new model here.
// Picky's engine: pure functions over PickyState. Claude only scores photos;
// everything here — picking keepers, choosing questions, learning — is plain code.
import type {
  Criterion,
  CriterionStatus,
  Scores,
  TasteProfile,
} from '../src/lib/types';

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

