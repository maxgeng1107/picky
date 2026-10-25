import type { Answer, Photo, PickyState, Scene, TasteProfile } from './types';
import { curatedScene } from './selection';
import { emptyModel, observe, profileFor } from './taste';

export function initialState(profile: TasteProfile = profileFor(emptyModel())): PickyState {
  return { photosById: {}, scenes: [], profile, review: null, busy: false, freedBytes: 0 };
}
export function prepare(state: PickyState, index: number): PickyState {
  const model = state.profile.preference ?? emptyModel();
  const scenes = state.scenes.map((s) => s.reviewed ? s : curatedScene(s, state.photosById, model));
  const photosById = { ...state.photosById };
  for (const s of scenes) for (const id of s.photoIds) {
    const p = photosById[id];
    photosById[id] = { ...p, status: s.keptIds.includes(id) ? 'kept' : 'binned',
      isGenericPick: s.genericKeptIds.includes(id),
      reason: s.keptIds.includes(id) ? 'Suggested from visible attributes; originals remain on your phone.' : undefined };
  }
  const scene = scenes.find((s) => !s.reviewed && s.uncertainIds.length);
  const remaining = scenes.filter((s) => !s.reviewed).reduce((n, s) => n + s.uncertainIds.length, 0);
  return { ...state, photosById, scenes, busy: false,
    review: scene ? { sceneId: scene.id, aId: scene.keptIds[0], bId: scene.uncertainIds[0], index, total: index + remaining } : null };
}
export function startReview(photos: Photo[], scenes: Scene[], profile: TasteProfile): PickyState {
  return prepare({ ...initialState(profile), photosById: Object.fromEntries(photos.map((p) => [p.id, p])), scenes }, 0);
}
export function answerReview(state: PickyState, answer: Answer, expected?: NonNullable<PickyState['review']>): PickyState {
  if (!state.review) return state;
  const r = state.review;
  if (expected && (r.sceneId !== expected.sceneId || r.aId !== expected.aId || r.bId !== expected.bId || r.index !== expected.index)) return state;
  const A = state.photosById[r.aId]; const B = state.photosById[r.bId];
  let model = state.profile.preference ?? emptyModel();
  if ((answer === 'keepA' || answer === 'replace') && A.scores && B.scores) {
    model = observe(model, { id: `${r.sceneId}:${r.aId}:${r.bId}`, sceneId: r.sceneId,
      aId: A.id, bId: B.id, a: A.scores, b: B.scores, target: answer === 'keepA' ? 1 : 0 });
  }
  const profile = profileFor(model, state.profile);
  const photosById = { ...state.photosById };
  const scene = { ...state.scenes.find((s) => s.id === r.sceneId)! };
  if (answer === 'replace') {
    scene.keptIds = scene.keptIds.map((id) => id === A.id ? B.id : id);
    photosById[A.id] = { ...A, status: 'binned', reason: undefined };
    photosById[B.id] = { ...B, status: 'kept', reason: 'Kept by your choice.' };
  } else if (answer === 'keepBoth') {
    scene.keptIds = [...new Set([...scene.keptIds, B.id])];
    photosById[B.id] = { ...B, status: 'kept', reason: 'You kept both; no preference inferred.' };
  }
  scene.uncertainIds = scene.uncertainIds.filter((id) => id !== B.id && !scene.keptIds.includes(id));
  scene.reviewed = scene.uncertainIds.length === 0;
  const scenes = state.scenes.map((s) => s.id === scene.id ? scene : s);
  const next = { ...state, profile, photosById, scenes };
  if (scene.reviewed) return prepare(next, r.index + 1);
  return { ...next, review: { ...r, aId: scene.keptIds[0], bId: scene.uncertainIds[0], index: r.index + 1 } };
}
