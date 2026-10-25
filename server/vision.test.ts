import assert from 'node:assert/strict';
import test from 'node:test';
import { KEYS } from '../src/lib/personalization/features';
import { observePhotos } from './vision';

test('vision transport uses real image payloads, caches validated features, and fails closed', async (t) => {
  const previous = { model: process.env.ANTHROPIC_MODEL, key: process.env.LLM_API_KEY, alternateKey: process.env.ANTHROPIC_API_KEY, limit: process.env.MAX_VLM_CALLS, cache: process.env.USE_CACHE };
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({ ANTHROPIC_MODEL: previous.model, LLM_API_KEY: previous.key, ANTHROPIC_API_KEY: previous.alternateKey, MAX_VLM_CALLS: previous.limit, USE_CACHE: previous.cache })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  delete process.env.LLM_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(observePhotos([{ id: 'p', imageBase64: '/9j/' }]), /Set ANTHROPIC_API_KEY/);
  process.env.ANTHROPIC_MODEL = 'fixture-model'; process.env.LLM_API_KEY = 'fixture-not-a-secret'; process.env.MAX_VLM_CALLS = '4'; process.env.USE_CACHE = '0';
  let calls = 0; let mode = 'ok';
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    assert.equal(body.model, 'fixture-model');
    assert.equal(body.messages[0].content[1].source.data, '/9j/');
    assert.ok(!('preference' in body));
    if (mode === 'error') return new Response('', { status: 429 });
    return Response.json({ stop_reason: mode === 'truncated' ? 'max_tokens' : 'end_turn', content: [{ type: 'text', text:
      JSON.stringify({ label: 'fixture', people: { p: true }, gated: [], scores: { p: Object.fromEntries(KEYS.map((k) => [k, 3])) } }) }] });
  };
  const photo = { id: 'p', imageBase64: '/9j/' };
  const first = await observePhotos([photo]);
  assert.deepEqual(await observePhotos([photo]), first); assert.equal(calls, 1);
  mode = 'truncated';
  await assert.rejects(observePhotos([{ ...photo, id: 'truncated' }]), /incomplete/);
  mode = 'error';
  await assert.rejects(observePhotos([{ ...photo, id: 'error' }]), /429/);
  await assert.rejects(observePhotos([{ ...photo, id: 'error' }]), /429/);
  assert.equal(calls, 4); // Failed attempts count toward the budget and are not cached.
  await assert.rejects(observePhotos([{ ...photo, id: 'budget' }]), /budget/);
  assert.deepEqual(await observePhotos([photo]), first); // Cached results require no spend.
  assert.equal(calls, 4);
});
