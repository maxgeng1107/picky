// Preserve the main scoring prompt/rules; harden only transport, validation and caching.
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DIMENSIONS } from '../src/lib/taste';
import { parseSelection, type SelectResponse } from '../src/lib/scoring';
import { VisionError } from './vision';

const SYSTEM = `You are Picky, a photo curator. You get photos of the same person taken in one scene (same place, same session). For each photo:
1. person: false if the photo does not show one clearly visible person (scenery, food, screenshots, objects). Those are left alone.
2. gated: true if the person's eyes are closed, the face is heavily blurred, the face is not visible, or the mouth is caught mid-word.
3. scores: score every dimension from 1 to 5 RELATIVE to the other photos in this scene — the best photo in this scene on a dimension gets 5, the worst gets 1, and you should spread the scores so differences are visible. Style dimensions measure how strongly the feature is present, not whether it is good. Score gated photos too.
4. label: a 2–4 word name for the scene, e.g. "Under the tree".
Be precise about visible differences between the photos; small differences matter.`;

function schema() {
  const scoreProps = Object.fromEntries(
    DIMENSIONS.map((d) => [d.key, { type: 'integer', description: d.definition }]),
  );
  return {
    type: 'object',
    additionalProperties: false,
    required: ['label', 'photos'],
    properties: {
      label: { type: 'string' },
      photos: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'person', 'gated', 'scores'],
          properties: {
            ref: { type: 'string', description: 'the photo reference, e.g. "p1"' },
            person: { type: 'boolean' },
            gated: { type: 'boolean' },
            scores: {
              type: 'object',
              additionalProperties: false,
              required: DIMENSIONS.map((d) => d.key),
              properties: scoreProps,
            },
          },
        },
      },
    },
  };
}

let calls = 0; let active = false;
const pending = new Map<string, Promise<SelectResponse>>();
function checked(value: unknown, ids: string[]): SelectResponse {
  const result = parseSelection(value, ids);
  if (result.photos.some((p) => Object.values(p.scores).some((v) => !Number.isInteger(v)))) throw new Error('Legacy scoring requires integer attributes.');
  return result;
}
export async function observeLegacyPhotos(photos: { id: string; imageBase64: string }[]): Promise<SelectResponse> {
  const key = process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY;
  if (!key) throw new VisionError('Set ANTHROPIC_API_KEY in the local .env.', 503);
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
  const hash = createHash('sha256').update(JSON.stringify(['legacy', model, SYSTEM, DIMENSIONS, photos])).digest('hex');
  if (pending.has(hash)) return pending.get(hash)!;
  const task = async () => {
    const directory = process.env.VISION_CACHE_DIR || path.join(process.cwd(), '.picky-cache');
    const filename = path.join(directory, `${hash}.json`);
    if (process.env.USE_CACHE !== '0') {
      try { return checked(JSON.parse(await readFile(filename, 'utf8')), photos.map((p) => p.id)); } catch { /* Recompute invalid/missing cache. */ }
    }
    const limit = Number(process.env.MAX_VLM_CALLS ?? 60);
    if (!Number.isInteger(limit) || limit < 1 || calls >= limit) throw new VisionError('VLM call budget reached or misconfigured.', 503);
    if (active) throw new VisionError('Vision is busy; wait for the current scene.', 429);
    active = true; calls++;
    try {
      const client = new Anthropic({ apiKey: key, timeout: 60_000, maxRetries: 0, fetch: globalThis.fetch });
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      photos.forEach((p, i) => {
        content.push({ type: 'text', text: `Photo p${i + 1}:` });
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.imageBase64 } });
      });
      content.push({ type: 'text', text: `Score all ${photos.length} photos (p1–p${photos.length}). Dimensions:\n${DIMENSIONS.map((d) => `- ${d.key}: ${d.definition}`).join('\n')}` });
      const response = await client.beta.messages.create({ model, max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', system: SYSTEM,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema() } }, messages: [{ role: 'user', content }] });
      if (response.stop_reason !== 'end_turn') throw new Error('Vision response incomplete.');
      const text = response.content.find((p) => p.type === 'text');
      if (!text || text.type !== 'text') throw new Error('Empty vision response.');
      const parsed = JSON.parse(text.text);
      if (!Array.isArray(parsed.photos) || parsed.photos.length !== photos.length) throw new Error('Missing photo assessments.');
      const result = checked({ label: parsed.label, photos: parsed.photos.map((p: { ref: string; person: boolean; gated: boolean; scores: unknown }) => {
        if (typeof p.ref !== 'string' || !/^p[1-9]\d*$/.test(p.ref)) throw new Error('Invalid photo reference.');
        const original = photos[Number(p.ref.slice(1)) - 1];
        if (!original) throw new Error('Unknown photo reference.');
        return { id: original.id, person: p.person, gated: p.gated, scores: p.scores };
      }) }, photos.map((p) => p.id));
      if (process.env.USE_CACHE !== '0') {
        try { await mkdir(directory, { recursive: true }); await writeFile(filename, JSON.stringify(result), { mode: 0o600 }); } catch { /* Valid scoring can still complete. */ }
      }
      return result;
    } catch (e) {
      if (e instanceof VisionError) throw e;
      if (e instanceof Anthropic.RateLimitError) throw new VisionError('Vision provider rate limited this request.', 429);
      if (e instanceof Anthropic.AuthenticationError) throw new VisionError('Vision credentials were rejected.', 503);
      throw new VisionError(e instanceof Anthropic.APIError ? `Vision provider failed (${e.status}).` : e instanceof Error ? e.message : 'Vision request failed.', 502);
    } finally { active = false; }
  };
  const promise = task(); pending.set(hash, promise);
  try { return await promise; } finally { if (pending.get(hash) === promise) pending.delete(hash); }
}
