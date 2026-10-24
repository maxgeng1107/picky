// Public engine entry point. VLM features remain fixed; choices fit a personal ranker.
import { DIMENSIONS as ATTRIBUTES } from './personalization/features';
import { prepare, answerReview } from './personalization/engine';
import { emptyModel, profileFor, genericScore, score } from './personalization/taste';
import type { Photo, PickyState, Scores, TasteProfile } from './types';

export const DIMENSIONS = ATTRIBUTES.map((d, i) => ({ ...d, shown: i < 6 }));
export const emptyProfile = () => profileFor(emptyModel());
export const hasEvidence = (profile: TasteProfile) => Boolean(profile.preference?.history.length);
export const tasteScore = (scores: Scores, profile: TasteProfile) => score(profile.preference ?? emptyModel(), scores);
export { genericScore };
export const advance = prepare;
export const applyAnswer = answerReview;
export function reasonFor(_kept: Photo, _others: Photo[], profile: TasteProfile): string {
  return hasEvidence(profile) ? 'Suggested from your choices so far; this estimate is provisional.' : 'Suggested before learning your preferences.';
}
export function applyRescue(state: PickyState, id: string): PickyState {
  const photo = state.photosById[id];
  if (!photo || photo.deleted) return state;
  if (state.review?.bId === id) {
    const next = answerReview(state, 'keepBoth');
    return { ...next, photosById: { ...next.photosById, [id]: { ...next.photosById[id], rescued: true } } };
  }
  return { ...state,
    scenes: state.scenes.map((s) => s.id === photo.sceneId ? { ...s, keptIds: [...new Set([...s.keptIds, id])], uncertainIds: s.uncertainIds.filter((p) => p !== id) } : s),
    photosById: { ...state.photosById, [id]: { ...photo, status: 'kept', rescued: true, reason: 'You kept this photo; no relative preference inferred.' } } };
}
