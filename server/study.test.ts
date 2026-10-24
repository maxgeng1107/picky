import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Study, type StudyScene } from './study';
import { createStudyApp } from './real-experiment';
import { KEYS } from '../src/lib/experimental/features';

const row = (value: number) => Object.fromEntries(KEYS.map((k) => [k, k === 'face_small' ? value : 3]));
function scene(id: string, split: 'train' | 'test'): StudyScene {
  const photoIds = [`${id}a`, `${id}b`, `${id}c`];
  return { id, split, photoIds, observation: { label: id, gated: [], scores: Object.fromEntries(photoIds.map((p, i) => [p, row(1 + 2 * i)])) } };
}
test('study freezes scores, holds out scenes, and excludes repeats/skips from training', () => {
  const study = new Study('p01', 'natural portraits', 42);
  for (const [id, split] of [['s1', 'train'], ['s2', 'train'], ['s3', 'test'], ['s4', 'test']] as const) study.addScene(scene(id, split));
  assert.throws(() => study.addScene(scene('s1', 'test')), /unique/);
  const duplicate = scene('s5', 'test'); duplicate.photoIds[0] = 's1a';
  assert.throws(() => study.addScene(duplicate), /Duplicate image/);
  study.start(); assert.equal(study.questions.length, 13);
  assert.throws(() => study.addScene(scene('s6', 'test')), /locked/);
  assert.throws(() => study.report(), /Finish blind/);
  const first = study.next!; study.answer({ id: first.id, target: null });
  study.answer({ id: first.id, target: null }); assert.equal(study.choices.length, 1);
  assert.throws(() => study.answer({ id: first.id, target: 1 }), /current/);
  while (study.next) {
    const q = study.next;
    const target = q.repeatOf ? null : study.scenes.find((s) => s.id === q.sceneId)!.observation.scores[q.aId].face_small! >
      study.scenes.find((s) => s.id === q.sceneId)!.observation.scores[q.bId].face_small! ? 1 : 0;
    study.answer({ id: q.id, target });
  }
  assert.equal(study.dataset().train.length, 5); assert.equal(study.dataset().test.length, 6);
  const report = study.report();
  assert.equal(report.curve.at(-1)!.pairwiseAccuracy, 1);
  assert.equal(report.curve.at(-1)!.sceneBootstrap95CI, null); // Only two independent test scenes.
  const testIds = new Set(study.dataset().test.map((c) => c.id));
  for (const c of study.choices) if (testIds.has(c.id) && c.target !== 0.5 && c.target !== null) c.target = c.target === 1 ? 0 : 1;
  assert.equal(study.report().curve.at(-1)!.pairwiseAccuracy, 0); // Test labels cannot train the model.
});
test('study repeated pairs measure left/right-corrected label consistency', () => {
  const study = new Study('p02', 'portraits', 20);
  for (const [id, split] of [['s1', 'train'], ['s2', 'train'], ['s3', 'test'], ['s4', 'test']] as const) study.addScene(scene(id, split));
  study.start();
  while (study.next) study.answer({ id: study.next.id, target: study.next.repeatOf ? 0 : 1 });
  assert.equal(study.report().repeatedChoiceAgreement, 1);
});
test('HTTP protocol hides predictions, validates image hashes, and records real labels without image bytes', async () => {
  let calls = 0; const saves: string[] = []; const cacheBypasses: boolean[] = [];
  const app = createStudyApp({ persist: async (_id, data) => { saves.push(JSON.stringify(data)); }, vision: async (photos, options) => {
    cacheBypasses.push(Boolean(options?.bypassCache));
    calls++; return { label: 'fixture', gated: [], scores: Object.fromEntries(photos.map((p, i) => [p.id, row(i ? 5 : 1)])) };
  } });
  const post = async (path: string, body: unknown, origin = 'http://localhost:3002') => {
    const response = await app(new Request(`http://localhost:3002${path}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await post('/api/begin', { participant: 'p', purpose: 'portraits' }, 'https://foreign.test')).status, 403);
  assert.equal((await post('/api/begin', { participant: 'p', purpose: 'portraits' })).status, 200);
  const photos = (offset: number) => [0, 1].map((i) => { const bytes = Buffer.from([255, 216, 255, offset, i]); return {
    id: createHash('sha256').update(bytes).digest('hex'), imageBase64: bytes.toString('base64') }; });
  const a = photos(0); const b = photos(1);
  assert.equal((await post('/api/scene', { sceneId: 's1', split: 'train', photos: [{ ...a[0], id: 'wrong' }, a[1]] })).status, 400);
  assert.equal(calls, 0);
  assert.equal((await post('/api/scene', { sceneId: 's1', split: 'train', photos: a, checkStability: true })).status, 200);
  assert.equal((await post('/api/scene', { sceneId: 's2', split: 'test', photos: a })).status, 400);
  assert.equal((await post('/api/scene', { sceneId: 's2', split: 'test', photos: b })).status, 200);
  assert.equal(calls, 3); assert.deepEqual(cacheBypasses, [false, true, false]);
  assert.equal((await post('/api/report', {})).status, 400);
  let state = (await post('/api/start', {})).data;
  assert.ok(!JSON.stringify(state).includes('scores'));
  assert.equal(state.question.split, 'train');
  const choice = { id: state.question.id, target: state.question.aId === a[1].id ? 1 : 0 };
  state = (await post('/api/choice', choice)).data;
  assert.equal((await post('/api/choice', choice)).data.answered, 1);
  assert.equal(state.question.split, 'test');
  const wrong = { id: state.question.id, target: state.question.aId === b[1].id ? 0 : 1 };
  assert.equal((await post('/api/choice', wrong)).data.question, null);
  const report = await post('/api/report', {});
  assert.equal(report.status, 200); assert.equal(report.data.curve.at(-1).pairwiseAccuracy, 0);
  assert.equal(report.data.repeatability[0].maxAbsoluteDifference, 4);
  assert.equal(report.data.repeatability[0].meanAbsoluteDifference, 0.5);
  assert.ok(saves.every((s) => !s.includes('imageBase64') && !s.includes(a[0].imageBase64)));
  const exportResponse = await app(new Request('http://localhost:3002/api/download'));
  const exported = await exportResponse.json(); assert.equal(exported.train.length, 1); assert.equal(exported.test.length, 1);
  assert.equal(exported.report.curve.at(-1).pairwiseAccuracy, 0);
});
test('a provider failure is explicit and creates no scored scene or synthetic features', async () => {
  const app = createStudyApp({ persist: async () => {}, vision: async () => { throw new Error('fixture provider 429'); } });
  const request = (path: string, body: unknown) => app(new Request('http://localhost:3002'+path, { method: 'POST', body: JSON.stringify(body) }));
  await request('/api/begin', { participant: 'p', purpose: 'portraits' });
  const photos = [0, 1].map((i) => { const bytes = Buffer.from([255, 216, 255, i]); return { id: createHash('sha256').update(bytes).digest('hex'), imageBase64: bytes.toString('base64') }; });
  const response = await request('/api/scene', { sceneId: 's1', split: 'train', photos });
  assert.equal(response.status, 502); assert.match((await response.json()).error, /429/);
  const exported = await (await app(new Request('http://localhost:3002/api/download'))).json();
  assert.deepEqual(exported.scenes, []);
});
