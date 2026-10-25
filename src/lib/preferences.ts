/** Pure snapshot encoding and curation initialization, shared by native storage and tests. */
import { FEATURE_VERSION } from './personalization/features';
import { emptyModel, profileFor, restoreModel } from './personalization/taste';
import type { PickyState, TasteProfile } from './types';
import { emptyProfile, statusOf } from './taste';
export function initialState(profile: TasteProfile = emptyProfile()): PickyState {
  return { photosById: {}, scenes: [], profile, review: null, busy: false, freedBytes: 0 };
}
export function beginCuration(current: PickyState, loaded: Pick<PickyState, 'photosById' | 'scenes'>): PickyState {
  // Scene numbers can change when new photos arrive; carry a mark only by photo membership.
  const markedIds = new Set(Object.values(current.myPicks ?? {}));
  const myPicks: Record<string, string> = {};
  for (const scene of loaded.scenes) {
    const matches = scene.photoIds.filter((id) => markedIds.has(id));
    if (matches.length === 1) myPicks[scene.id] = matches[0];
  }
  return { ...initialState(current.profile), ...loaded, photosById: { ...loaded.photosById }, scenes: [...loaded.scenes], profile: current.profile, freedBytes: current.freedBytes, myPicks, busy: true };
}
export function encodePreferences(profile: TasteProfile, lastCuratedAt: number, processedIds: string[] = []): string {
  if (!profile.preference) return JSON.stringify({ snapshotVersion: 1, featureVersion: 'counter-scene-v1',
    criteria: profile.criteria.map(({ key, support, against }) => ({ key, support, against })), lastCuratedAt, processedIds: processedIds.slice(-600) });
  return JSON.stringify({ snapshotVersion: 1, featureVersion: FEATURE_VERSION, model: profile.preference ?? emptyModel(), lastCuratedAt, processedIds: processedIds.slice(-600) });
}
export function decodePreferences(text: string): { profile: TasteProfile; lastCuratedAt: number; processedIds: string[] } {
  const data = JSON.parse(text);
  if (data?.snapshotVersion === 1 && data.featureVersion === 'counter-scene-v1') {
    const profile = emptyProfile();
    if (!Array.isArray(data.criteria) || data.criteria.length !== profile.criteria.length) throw new Error('Invalid saved counters.');
    const keys = new Set<string>();
    for (const row of data.criteria) {
      if (!row || typeof row.key !== 'string' || keys.has(row.key) || !profile.criteria.some((c) => c.key === row.key) ||
        ![row.support, row.against].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000)) throw new Error('Invalid saved counters.');
      keys.add(row.key);
    }
    profile.criteria = profile.criteria.map((c) => { const row = data.criteria.find((r: { key: string }) => r.key === c.key)!;
      return { ...c, support: row.support, against: row.against, status: statusOf(row.support, row.against) }; });
    return { profile, lastCuratedAt: typeof data.lastCuratedAt === 'number' && Number.isFinite(data.lastCuratedAt) && data.lastCuratedAt >= 0 ? data.lastCuratedAt : 0,
      processedIds: Array.isArray(data.processedIds) ? data.processedIds.filter((id: unknown) => typeof id === 'string').slice(-600) : [] };
  }
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
