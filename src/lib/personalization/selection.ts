import type { Photo, Scene, Scores } from './types';
import { difference, dot, genericScore, probability, score, type PreferenceModel } from './taste';

export function rankPhotos(photos: Photo[], model: PreferenceModel): Photo[] {
  return photos.filter((p) => !p.gated && p.scores && Object.values(p.scores).some((s) => s != null))
    .sort((a, b) => score(model, b.scores!) - score(model, a.scores!) || a.id.localeCompare(b.id));
}
/** Query near-ranking alternatives ONLY if measurable features actually differ. */
export function challengers(kept: Photo, ranked: Photo[], model: PreferenceModel, seen: Set<string>): Photo[] {
  return ranked.filter((p) => p.id !== kept.id && !seen.has(pairKey(kept.id, p.id)))
    .map((p) => {
      const delta = difference(kept.scores!, p.scores!);
      const info = dot(delta, delta);
      const prob = probability(model, kept.scores!, p.scores!);
      return { p, info, utility: prob * (1 - prob) * info };
    })
    .filter((x) => x.info >= 0.0625)
    .sort((a, b) => b.utility - a.utility || a.p.id.localeCompare(b.p.id))
    .slice(0, 3).map((x) => x.p);
}
export const pairKey = (a: string, b: string) => [a, b].sort().join('\0');
export function curatedScene(scene: Scene, photosById: Record<string, Photo>, model: PreferenceModel) {
  const ranked = rankPhotos(scene.photoIds.map((id) => photosById[id]), model);
  // Even fully gated/unknown scenes keep their originals; no destructive action is inferred.
  if (!ranked.length) return { ...scene, keptIds: [...scene.photoIds], genericKeptIds: [], uncertainIds: [], reviewed: true };
  const generic = [...ranked].sort((a, b) => genericScore(b.scores!) - genericScore(a.scores!))[0];
  // Abstain on visually indistinguishable alternatives instead of hiding an ID tie-break.
  const keptIds = ranked.filter((p) => Math.max(...difference(ranked[0].scores!, p.scores!).map(Math.abs)) < 0.125).map((p) => p.id);
  // No-face, gated and wholly unknown photos stay outside the discard suggestions.
  keptIds.push(...scene.photoIds.filter((id) => !ranked.some((p) => p.id === id)));
  const seen = new Set(model.history.map((h) => pairKey(h.aId, h.bId)));
  const uncertainIds = challengers(ranked[0], ranked, model, seen).filter((p) => !keptIds.includes(p.id)).map((p) => p.id);
  return { ...scene, keptIds, genericKeptIds: [generic.id], uncertainIds, reviewed: !uncertainIds.length };
}
export function validScores(raw: unknown): raw is Scores {
  return !!raw && typeof raw === 'object' && Object.values(raw).every((x) =>
    x === null || typeof x === 'number' && Number.isFinite(x) && x >= 1 && x <= 5);
}
