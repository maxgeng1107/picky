import assert from 'node:assert/strict';
import test from 'node:test';
import { beginCuration, decodePreferences, encodePreferences, initialState, recoverPreferences } from '../src/lib/preferences';
import { acceptSceneScores, parseSelection } from '../src/lib/scoring';
import { prepare as advance, answerReview as applyAnswer } from '../src/lib/personalization/engine';
import { applyRescue } from '../src/lib/taste';
import { emptyModel, observe, profileFor, probability } from '../src/lib/personalization/taste';
import { KEYS } from '../src/lib/personalization/features';
import { learn as baselineLearn, emptyProfile as baselineProfile } from './baseline';
import type { Photo, Scene } from '../src/lib/types';

const row = (value: number) => Object.fromEntries(KEYS.map((k) => [k, k === 'face_small' ? value : 3]));
const photos = (): Photo[] => [1, 2, 3].map((i) => ({ id: `p${i}`, sceneId: 's', takenAt: 100, uri: '', status: 'kept', scores: row(i + 1) }));
const scene = (): Scene => ({ id: 's', photoIds: ['p1', 'p2', 'p3'], keptIds: [], genericKeptIds: [], uncertainIds: [], reviewed: false });
test('experimental ranker learns fine differences, retains choices across curation and snapshot reload', () => {
  const loaded = { photosById: Object.fromEntries(photos().map((p) => [p.id, p])), scenes: [scene()] };
  const state = advance(beginCuration(initialState(profileFor(emptyModel())), loaded), 0);
  assert.ok(state.review);
  const learned = applyAnswer(state, 'replace');
  assert.equal(learned.profile.preference!.history.length, 1);
  const resumed = decodePreferences(encodePreferences(learned.profile, 100, ['p1', 'p2', 'p3']));
  assert.deepEqual(resumed.profile.preference, learned.profile.preference);
  assert.equal(resumed.lastCuratedAt, 100); assert.deepEqual(resumed.processedIds, ['p1', 'p2', 'p3']);
  const next = beginCuration(initialState(resumed.profile), loaded);
  assert.deepEqual(next.profile.preference, learned.profile.preference);
  assert.equal(next.review, null); // Reinitialize scene data, preserving the personal model.
  const pair = learned.profile.preference!.history[0];
  assert.ok(probability(resumed.profile.preference!, pair.a, pair.b) < 0.5);
  assert.ok(learned.profile.criteria.every((c) => c.status !== 'confident' && c.status !== 'doesnt_care'));
});
test('same image pair across regenerated scene IDs cannot inflate evidence', () => {
  const c = { id: 'choice', sceneId: 's', aId: 'a', bId: 'b', a: row(4), b: row(3), target: 1 as const };
  const first = observe(emptyModel(), c);
  const second = observe(first, { ...c, id: 'other', sceneId: 'new-scene' });
  assert.equal(second.history.length, 1); assert.deepEqual(second.weights, first.weights);
});
test('a second tap from the previous question cannot label the next photo pair', () => {
  const loaded = { photosById: Object.fromEntries(photos().map((p) => [p.id, p])), scenes: [scene()] };
  const state = advance(beginCuration(initialState(profileFor(emptyModel())), loaded), 0);
  const expected = state.review!;
  const next = applyAnswer(state, 'replace', expected);
  assert.ok(next.review); assert.notEqual(next.review.bId, expected.bId);
  assert.equal(applyAnswer(next, 'replace', expected), next);
  assert.equal(next.profile.preference!.history.length, 1);
});
test('snapshot version guards and corrupted data cannot silently load wrong feature weights', () => {
  assert.throws(() => decodePreferences('bad json'));
  assert.throws(() => decodePreferences(JSON.stringify({ snapshotVersion: 1, featureVersion: 'old', model: emptyModel() })));
  assert.throws(() => decodePreferences(JSON.stringify({ snapshotVersion: 1, featureVersion: emptyModel().version, model: { version: 'old', history: [] } })));
  const text = encodePreferences(profileFor(emptyModel()), Infinity);
  assert.equal(decodePreferences(text).lastCuratedAt, 0);
  const backup = encodePreferences(profileFor(emptyModel()), 500, ['a']);
  assert.equal(recoverPreferences('truncated JSON', backup).lastCuratedAt, 500);
  assert.ok(recoverPreferences('truncated JSON', backup).recovered);
  assert.equal(recoverPreferences(backup, 'bad').recovered, false);
  assert.throws(() => recoverPreferences('bad', 'bad'));
});
test('scoring preserves source metadata/checkpoints and filters non-person photos immutably', () => {
  const loaded = { photosById: Object.fromEntries(photos().map((p) => [p.id, p])), scenes: [scene()] };
  const state = beginCuration(initialState(profileFor(emptyModel())), loaded);
  const result = { label: 'portrait', photos: photos().map((p) => ({ id: p.id, person: p.id !== 'p1', gated: false, scores: p.scores! })) };
  const next = acceptSceneScores(state, 's', result);
  assert.ok(!next.photosById.p1); assert.ok(state.photosById.p1); assert.ok(loaded.photosById.p1);
  assert.deepEqual(loaded.scenes[0].photoIds, ['p1', 'p2', 'p3']);
  assert.equal(Math.max(...Object.values(loaded.photosById).map((p) => p.takenAt)), 100);
  assert.throws(() => parseSelection({ ...result, photos: result.photos.slice(1) }, scene().photoIds));
  assert.throws(() => parseSelection({ ...result, photos: [result.photos[0], result.photos[0], result.photos[2]] }, scene().photoIds));
});
test('rescuing a suggestion preserves it without inferring a winner or restoring deleted assets', () => {
  const loaded = { photosById: Object.fromEntries(photos().map((p) => [p.id, p])), scenes: [scene()] };
  const state = advance(beginCuration(initialState(profileFor(emptyModel())), loaded), 0); const bId = state.review!.bId;
  const rescued = applyRescue(state, bId);
  assert.equal(rescued.profile.preference!.history.length, 0);
  assert.ok(rescued.scenes[0].keptIds.includes(bId)); assert.ok(rescued.photosById[bId].rescued);
  assert.equal(applyRescue({ ...state, photosById: { ...state.photosById, [bId]: { ...state.photosById[bId], deleted: true } } }, bId).photosById[bId].deleted, true);
});
test('the frozen counter baseline remains distinct from the new personal model', () => {
  const baseline = baselineLearn(baselineProfile(), row(4), row(3));
  assert.equal(baseline.criteria[0].support, 0);
  const model = observe(emptyModel(), { id: 'x', sceneId: 's', aId: 'a', bId: 'b', a: row(4), b: row(3), target: 1 });
  assert.equal(model.history.length, 1); assert.ok(model.weights[0] > 0);
});
