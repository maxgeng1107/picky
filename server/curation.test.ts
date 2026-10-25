import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreCurationScenes } from '../src/lib/curation';
import { initialState } from '../src/lib/preferences';
import { KEYS } from '../src/lib/personalization/features';
import type { PickyState, Scene } from '../src/lib/types';
const scene = (id: string): Scene => ({ id, photoIds: [id], keptIds: [], genericKeptIds: [], uncertainIds: [], reviewed: false });
const state = (): PickyState => ({ ...initialState(), scenes: [scene('failed'), scene('success')], photosById: Object.fromEntries(['failed', 'success'].map((id) => [id, { id, sceneId: id, uri: '', takenAt: 0, status: 'kept' as const }])) });
const result = (id: string) => ({ label: id, photos: [{ id, person: true, gated: false, scores: Object.fromEntries(KEYS.map((key) => [key, 3])) }] });
test('partial scoring retries once sequentially and checkpoints only successful scenes', async () => {
  const original = state(); const calls: string[] = []; let active = 0; let maximum = 0;
  const scored = await scoreCurationScenes(original, { isCurrent: () => true, observe: async (s) => {
    active++; maximum = Math.max(active, maximum); calls.push(s.id);
    try { await Promise.resolve(); if (s.id === 'failed' || calls.filter((id) => id === s.id).length === 1) throw new Error('temporary'); return result(s.id); }
    finally { active--; }
  } });
  assert.deepEqual(calls, ['failed', 'failed', 'success', 'success']); assert.equal(maximum, 1);
  assert.deepEqual(scored.processedIds, ['success']); assert.equal(scored.failedCount, 1);
  assert.deepEqual(scored.state.scenes.map((s) => s.id), ['success']);
  assert.deepEqual(Object.keys(scored.state.photosById), ['success']);
  assert.equal(original.photosById.failed.status, 'kept'); assert.equal(original.photosById.success.scores, undefined);
});
test('all scene failures stop after bounded attempts and produce no success checkpoint', async () => {
  let calls = 0;
  await assert.rejects(scoreCurationScenes(state(), { isCurrent: () => true, observe: async () => { calls++; throw new Error('offline'); } }), /offline/);
  assert.equal(calls, 4);
});
test('cancellation ignores a late scoring result and schedules no later scenes', async () => {
  const original = state(); let current = true; let calls = 0;
  const scored = await scoreCurationScenes(original, { isCurrent: () => current, observe: async (s) => { calls++; current = false; return result(s.id); } });
  assert.equal(scored.cancelled, true); assert.equal(scored.state, original);
  assert.deepEqual(scored.processedIds, []); assert.equal(calls, 1);
});
