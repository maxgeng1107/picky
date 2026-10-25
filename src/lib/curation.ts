import { acceptSceneScores, type SelectResponse } from './scoring';
import type { PickyState, Scene } from './types';

// Bounded, sequential work: one failed scene cannot discard every successful scene.
export async function scoreCurationScenes(state: PickyState, dependencies: {
  observe: (scene: Scene) => Promise<SelectResponse>;
  isCurrent: () => boolean;
  progress?: (done: number, total: number) => void;
}) {
  let next = state; let successful = 0; let lastError: unknown;
  const failed = new Set<string>(); const processedIds: string[] = [];
  for (const scene of state.scenes) {
    if (!dependencies.isCurrent()) return { state, processedIds: [], failedCount: 0, cancelled: true };
    let scored = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await dependencies.observe(scene);
        if (!dependencies.isCurrent()) return { state, processedIds: [], failedCount: 0, cancelled: true };
        next = acceptSceneScores(next, scene.id, result);
        scored = true; successful++; processedIds.push(...scene.photoIds);
        break;
      } catch (error) { lastError = error; if (!dependencies.isCurrent()) break; }
    }
    if (!scored) failed.add(scene.id);
    dependencies.progress?.(successful + failed.size, state.scenes.length);
  }
  if (!dependencies.isCurrent()) return { state, processedIds: [], failedCount: 0, cancelled: true };
  if (state.scenes.length && !successful) throw lastError ?? new Error('Scoring failed for every scene.');
  const photosById = { ...next.photosById };
  for (const scene of state.scenes) if (failed.has(scene.id)) for (const id of scene.photoIds) delete photosById[id];
  next = { ...next, photosById, scenes: next.scenes.filter((s) => !failed.has(s.id)) };
  return { state: next, processedIds, failedCount: failed.size, cancelled: false };
}
