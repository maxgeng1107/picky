import { KEYS } from './personalization/features';
import { validScores } from './personalization/selection';
import type { PickyState, Scores } from './types';
export interface ScoredPhoto { id: string; person: boolean; gated: boolean; scores: Scores }
export interface SelectResponse { label: string; photos: ScoredPhoto[] }
export function parseSelection(raw: unknown, ids: string[]): SelectResponse {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid scoring response.');
  const value = raw as SelectResponse;
  if (typeof value.label !== 'string' || !Array.isArray(value.photos) || value.photos.length !== ids.length)
    throw new Error('Scoring response is missing photos.');
  const seen = new Set<string>();
  for (const p of value.photos) {
    if (!p || typeof p.id !== 'string' || !ids.includes(p.id) || seen.has(p.id) || typeof p.person !== 'boolean' ||
      typeof p.gated !== 'boolean' || !validScores(p.scores) || KEYS.some((k) => !(k in p.scores)))
      throw new Error('Invalid or duplicate photo attributes.');
    seen.add(p.id);
  }
  return value;
}
export function acceptSceneScores(state: PickyState, sceneId: string, result: SelectResponse): PickyState {
  const scene = state.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error('Unknown photo scene.');
  parseSelection(result, scene.photoIds);
  const byId = new Map(result.photos.map((p) => [p.id, p]));
  const photosById = { ...state.photosById }; const photoIds: string[] = [];
  for (const id of scene.photoIds) {
    const p = byId.get(id)!;
    if (!p.person) { delete photosById[id]; continue; }
    photoIds.push(id); photosById[id] = { ...photosById[id], scores: p.scores, gated: p.gated };
  }
  return { ...state, photosById, scenes: state.scenes.map((s) => s.id === sceneId ? { ...s, label: result.label, photoIds } : s) };
}
