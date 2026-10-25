import assert from 'node:assert/strict';
import test from 'node:test';
import { DIMENSIONS, KEYS } from '../src/lib/personalization/features';
import { emptyModel, observe, probability, profileFor, restoreModel, difference, type Comparison } from '../src/lib/personalization/taste';
import { answerReview, startReview } from '../src/lib/personalization/engine';
import { challengers, rankPhotos } from '../src/lib/personalization/selection';
import { parseObservation, validatePhotos, PROMPT } from './vision';
import type { Photo, Scores, Scene } from '../src/lib/personalization/types';

const row = (values: Scores = {}): Scores => ({ ...Object.fromEntries(KEYS.map((k) => [k, 3])), ...values });
const comparison = (id: string, a = row({ face_small: 5 }), b = row({ face_small: 1 })): Comparison =>
  ({ id, sceneId: id, aId: `${id}-a`, bId: `${id}-b`, a, b, target: 1 });
test('learning transfers to an unseen pair and reverses for a different user', () => {
  let first = emptyModel(); let second = emptyModel();
  for (let i = 0; i < 8; i++) {
    const c = comparison(String(i)); first = observe(first, c); second = observe(second, { ...c, target: 0 });
  }
  assert.ok(probability(first, row({ face_small: 4 }), row({ face_small: 2 })) > 0.7);
  assert.ok(probability(second, row({ face_small: 4 }), row({ face_small: 2 })) < 0.3);
  assert.equal(probability(emptyModel(), row(), row()), 0.5);
});
test('swapping image order preserves the learned preference', () => {
  const c = comparison('a');
  const a = observe(emptyModel(), c); const b = observe(emptyModel(), { ...c, a: c.b, b: c.a, target: 0 });
  assert.ok(a.weights.every((w, i) => Math.abs(w - b.weights[i]) < 1e-12));
  assert.ok(Math.abs(probability(a, c.a, c.b) + probability(a, c.b, c.a) - 1) < 1e-12);
});
test('identical, missing and near-identical features cannot create evidence', () => {
  for (const c of [comparison('same', row(), row()), comparison('missing', row({ face_small: null }), row()),
    comparison('tiny', row({ face_small: 3.01 }), row())]) assert.equal(observe(emptyModel(), c).history.length, 0);
  assert.equal(difference(row({ jawline: null }), row({ jawline: 5 }))[1], 0);
});
test('duplicate or reversed pair replaces evidence rather than inflating it', () => {
  const c = comparison('x'); const m = observe(emptyModel(), c);
  assert.deepEqual(observe(m, c).weights, m.weights);
  const reversed = observe(m, { ...c, id: 'another', aId: c.bId, bId: c.aId, a: c.b, b: c.a, target: 0 });
  assert.equal(reversed.history.length, 1);
  assert.ok(reversed.weights.every((w, i) => Math.abs(w - m.weights[i]) < 1e-12));
});
test('contradictory evidence shrinks weights without declaring indifference', () => {
  let m = emptyModel();
  for (let i = 0; i < 10; i++) m = observe(m, { ...comparison(String(i)), target: i % 2 ? 1 : 0 });
  assert.ok(Math.abs(m.weights[0]) < 1e-8);
  assert.ok(profileFor(m).criteria.every((c) => c.status !== 'doesnt_care' && c.status !== 'confident'));
});
test('explicit ties, persistence and bad storage are handled', () => {
  const m = observe(emptyModel(), { ...comparison('tie'), target: 0.5 });
  assert.equal(probability(m, row({ face_small: 5 }), row()), 0.5);
  assert.deepEqual(restoreModel(JSON.parse(JSON.stringify(m))), m);
  assert.deepEqual(restoreModel({ version: 'old', history: [] }), emptyModel());
});
const photos = (): Photo[] => [1, 2, 3].map((i) => ({ id: `p${i}`, sceneId: 's', uri: '', takenAt: i, status: 'kept', scores: row({ face_small: i + 1 }) }));
const scene = (): Scene => ({ id: 's', photoIds: ['p1', 'p2', 'p3'], keptIds: [], genericKeptIds: [], uncertainIds: [], reviewed: false });
test('keepBoth and skip do not train, and all choices remain originals', () => {
  for (const answer of ['keepBoth', 'skip'] as const) {
    const s = startReview(photos(), [scene()], profileFor(emptyModel()));
    const r = s.review!; const next = answerReview(s, answer);
    assert.equal(next.profile.preference!.history.length, 0);
    if (answer === 'keepBoth') assert.ok(next.scenes[0].keptIds.includes(r.bId));
    assert.ok(Object.values(next.photosById).every((p) => !p.deleted));
  }
});
test('empty/all-gated scenes are preserved and do not crash', () => {
  const list = photos().map((p) => ({ ...p, gated: true }));
  const s = startReview(list, [scene()], profileFor(emptyModel()));
  assert.equal(s.review, null); assert.equal(s.scenes[0].keptIds.length, 3);
  assert.deepEqual(rankPhotos([], emptyModel()), []);
});
test('gated photos in mixed scenes are preserved without entering comparisons', () => {
  const list = photos(); list[0].gated = true;
  const state = startReview(list, [scene()], profileFor(emptyModel()));
  assert.ok(state.scenes[0].keptIds.includes('p1'));
  assert.ok(!state.scenes[0].uncertainIds.includes('p1'));
});
test('identical candidates do not generate useless questions', () => {
  const list = photos().map((p) => ({ ...p, scores: row() }));
  assert.deepEqual(challengers(list[0], list, emptyModel(), new Set()), []);
  const state = startReview(list, [scene()], profileFor(emptyModel()));
  assert.equal(state.review, null); assert.equal(state.scenes[0].keptIds.length, 3);
});
test('vision parser rejects fabricated IDs and invalid/missing attributes', () => {
  const valid = { label: 'test', people: { p: true }, gated: [], scores: { p: row() } };
  assert.equal(parseObservation(JSON.stringify(valid), ['p']).scores.p.face_small, 3);
  for (const bad of [{ ...valid, gated: ['foreign'] }, { ...valid, scores: { p: { face_small: 5 } } },
    { ...valid, scores: { p: row({ face_small: 10 }) } }]) assert.throws(() => parseObservation(JSON.stringify(bad), ['p']));
  assert.throws(() => validatePhotos([{ id: 'a', imageBase64: 'abcd' }]));
  assert.ok(PROMPT.includes('Never stretch')); assert.equal(DIMENSIONS.length, 8);
});
