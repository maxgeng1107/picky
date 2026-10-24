/** Pure snapshot encoding and curation initialization, shared by native storage and tests. */
import { FEATURE_VERSION } from './personalization/features';
import { emptyModel, profileFor, restoreModel } from './personalization/taste';
import type { PickyState, TasteProfile } from './types';
export function initialState(profile: TasteProfile = profileFor(emptyModel())): PickyState {
  return { photosById: {}, scenes: [], profile, review: null, busy: false, freedBytes: 0 };
}
export function beginCuration(current: PickyState, loaded: Pick<PickyState, 'photosById' | 'scenes'>): PickyState {
  return { ...initialState(current.profile), ...loaded, photosById: { ...loaded.photosById }, scenes: [...loaded.scenes], profile: current.profile, freedBytes: current.freedBytes, busy: true };
}
export function encodePreferences(profile: TasteProfile, lastCuratedAt: number, processedIds: string[] = []): string {
  return JSON.stringify({ snapshotVersion: 1, featureVersion: FEATURE_VERSION, model: profile.preference ?? emptyModel(), lastCuratedAt, processedIds: processedIds.slice(-600) });
}
export function decodePreferences(text: string): { profile: TasteProfile; lastCuratedAt: number; processedIds: string[] } {
  const data = JSON.parse(text);
  if (!data || data.snapshotVersion !== 1 || data.featureVersion !== FEATURE_VERSION || data.model?.version !== FEATURE_VERSION || !Array.isArray(data.model.history))
    throw new Error('Saved preference version is incompatible.');
  const profile = profileFor(restoreModel(data.model));
  return { profile, lastCuratedAt: typeof data.lastCuratedAt === 'number' && Number.isFinite(data.lastCuratedAt) && data.lastCuratedAt >= 0 ? data.lastCuratedAt : 0,
    processedIds: Array.isArray(data.processedIds) ? data.processedIds.filter((id: unknown) => typeof id === 'string').slice(-600) : [] };
}
export function recoverPreferences(primary?: string, backup?: string) {
  for (const [index, text] of [primary, backup].entries()) {
    if (!text) continue;
    try { return { ...decodePreferences(text), recovered: index === 1 }; } catch { /* Try the previous valid snapshot. */ }
  }
  throw new Error('No compatible preference snapshot could be read.');
}
