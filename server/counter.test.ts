import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyProfile, learn, tasteScore, advance, applyAnswer, evaluate, withHistory } from '../src/lib/taste';
import * as baseline from './baseline';
import { beginCuration, initialState, encodePreferences, recoverPreferences } from '../src/lib/preferences';
import { KEYS } from '../src/lib/personalization/features';
test('default counter matches main@23f2b9f on identical feedback and held-out scores', () => {
  let current = emptyProfile(); let old = baseline.emptyProfile(); let seed = 31;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const row = () => Object.fromEntries(KEYS.map((k) => [k, 1 + Math.floor(random() * 5)]));
  for (let i = 0; i < 100; i++) {
    const a = row(); const b = row(); current = learn(current, a, b); old = baseline.learn(old, a, b);
    assert.deepEqual(current.criteria, old.criteria);
    const probe = row(); assert.equal(tasteScore(probe, current), baseline.tasteScore(probe, old));
  }
  assert.equal(current.preference, undefined);
});
test('counter choices survive another curation and a damaged-primary restart', () => {
  const a = Object.fromEntries(KEYS.map((k) => [k, 5])); const b = Object.fromEntries(KEYS.map((k) => [k, 1]));
  const profile = learn(emptyProfile(), a, b);
  const saved = encodePreferences(profile, 123, ['photo']);
  const restored = recoverPreferences('truncated', saved);
  assert.deepEqual(restored.profile.criteria.map((c) => [c.key, c.support, c.against, c.status]), profile.criteria.map((c) => [c.key, c.support, c.against, c.status]));
  assert.equal(restored.profile.preference, undefined);
  assert.deepEqual(beginCuration(initialState(restored.profile), { scenes: [], photosById: {} }).profile, restored.profile);
});
test('default engine rejects a stale answer without updating another pair', () => {
  const scene = { id: 's', photoIds: ['a', 'b', 'c'], keptIds: [], genericKeptIds: [], uncertainIds: [], reviewed: false };
  const photosById = Object.fromEntries(['a', 'b', 'c'].map((id, i) => [id, { id, sceneId: 's', uri: '', takenAt: 0, status: 'kept' as const, scores: Object.fromEntries(KEYS.map((k) => [k, i * 2 + 1])) }]));
  const state = advance(beginCuration(initialState(), { photosById, scenes: [scene] }), 0);
  assert.ok(state.review);
  const next = applyAnswer(state, 'keepA', state.review);
  assert.equal(applyAnswer(next, 'replace', state.review), next);
});
test('practice history counts only changed evidence and excludes unavailable marked picks', () => {
  const profile = emptyProfile();
  const before = initialState(profile);
  const unchanged = { ...before, profile: { ...profile, criteria: profile.criteria.map((c) => ({ ...c })) } };
  assert.equal(withHistory(before, unchanged).profileHistory, undefined);
  const after = { ...before, profile: learn(profile, { smile_teeth: 5 }, { smile_teeth: 1 }) };
  assert.deepEqual(withHistory(before, after).profileHistory, [profile, after.profile]);
  const scores = Object.fromEntries(KEYS.map((k) => [k, 3]));
  const photo = { id: 'a', uri: '', takenAt: 0, sceneId: 's', status: 'kept' as const, scores };
  const state = { ...before, scenes: [{ id: 's', photoIds: ['a', 'b'], keptIds: [], genericKeptIds: [], uncertainIds: [], reviewed: false }],
    photosById: { a: photo, b: { ...photo, id: 'b', gated: true } } };
  assert.deepEqual(evaluate(state, profile, { s: 'a' }), { picky: 1, generic: 1, total: 1 });
  assert.equal(evaluate(state, profile, { s: 'b' }).total, 0);
  assert.equal(evaluate(state, profile, { s: 'missing' }).total, 0);
});
test('rerunning curation carries practice marks by photo ID when scene numbers change', () => {
  const scene = (id: string, photoIds: string[]) => ({ id, photoIds, keptIds: [], genericKeptIds: [], uncertainIds: [], reviewed: false });
  const state = { ...initialState(), myPicks: { oldScene: 'my-photo' } };
  const rerun = beginCuration(state, { photosById: {}, scenes: [scene('oldScene', ['different-photo']), scene('newScene', ['my-photo'])] });
  assert.deepEqual(rerun.myPicks, { newScene: 'my-photo' });
  assert.equal(rerun.profile, state.profile);
});
