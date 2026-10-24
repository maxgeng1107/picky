import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluate, type EvaluationData } from './evaluate';
import { FEATURE_VERSION, KEYS } from '../src/lib/personalization/features';
const scores = (v: number) => Object.fromEntries(KEYS.map((k) => [k, k === 'face_small' ? v : 3]));
const pair = (id: string) => ({ id, sceneId: id, aId: `${id}a`, bId: `${id}b`, a: scores(5), b: scores(1), target: 1 as const });
test('offline evaluation holds labels out and rejects session/photo leakage', () => {
  const data: EvaluationData = { featureVersion: FEATURE_VERSION, train: [pair('train')], test: [pair('test')] };
  assert.equal(evaluate(data).pairwiseAccuracy, 1);
  assert.equal(evaluate({ ...data, test: [{ ...pair('test'), target: 0 }] }).pairwiseAccuracy, 0);
  assert.throws(() => evaluate({ ...data, test: [{ ...pair('test'), sceneId: 'train' }] }), /leakage/);
  assert.throws(() => evaluate({ ...data, test: [{ ...pair('test'), aId: 'traina' }] }), /multiple scenes/);
  assert.throws(() => evaluate({ ...data, test: [pair('test'), pair('test')] }), /Duplicate/);
});
