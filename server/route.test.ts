import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../src/app/api/select+api';
import { readJSON, RequestError } from './http';
import { KEYS } from '../src/lib/personalization/features';
test('request parser rejects missing/invalid JSON and enforces byte limits', async () => {
  await assert.rejects(readJSON(new Request('http://localhost/')), RequestError);
  await assert.rejects(readJSON(new Request('http://localhost/', { method: 'POST', body: 'oops' })), /Invalid JSON/);
  await assert.rejects(readJSON(new Request('http://localhost/', { method: 'POST', body: '{"abc":1}' }), 4), (e: unknown) => e instanceof RequestError && e.status === 413);
});
test('phone route preserves main scoring format and fails on incomplete provider responses', async (t) => {
  const oldFetch = globalThis.fetch;
  const names = ['LLM_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'USE_CACHE', 'MAX_VLM_CALLS'] as const;
  const env = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => { globalThis.fetch = oldFetch; for (const name of names) { if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name]; } });
  const post = (body: unknown) => POST(new Request('http://localhost/api/select', { method: 'POST', body: JSON.stringify(body) }));
  delete process.env.LLM_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await post({ photos: [] })).status, 400);
  assert.equal((await post({ photos: [{ id: 'p', imageBase64: '/9j/' }] })).status, 503);
  process.env.LLM_API_KEY = 'fixture-key'; process.env.ANTHROPIC_MODEL = 'fixture-model'; process.env.USE_CACHE = '0'; process.env.MAX_VLM_CALLS = '5';
  let mode = 'ok'; let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(String(init?.body)).output_config.effort, 'low');
    const scores = Object.fromEntries(KEYS.map((k) => [k, 3]));
    return Response.json({ stop_reason: mode === 'truncated' ? 'max_tokens' : 'end_turn', content: [{ type: 'text', text: JSON.stringify({
      label: 'fixture', photos: [{ ref: 'p1', person: true, gated: false, scores }, { ref: 'p2', person: false, gated: false, scores }] }) }] });
  };
  const response = await post({ photos: [{ id: 'p', imageBase64: '/9j/' }, { id: 'scenery', imageBase64: '/9j/AA==' }] });
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.photos[0].scores.face_small, 3); assert.equal(data.photos[0].scores.camera_high, 3);
  assert.equal(data.photos[1].person, false);
  mode = 'truncated';
  const failed = await post({ photos: [{ id: 'different', imageBase64: '/9j/' }] });
  assert.equal(failed.status, 502); assert.match((await failed.json()).error, /incomplete/); assert.equal(calls, 2);
});
