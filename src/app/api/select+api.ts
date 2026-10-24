// POST /api/select — Claude looks at one scene and scores every photo. Runs on the Expo dev server,
// so the API key (ANTHROPIC_API_KEY in .env) never ships in the app.
// Picking keepers and learning happen in the app (src/lib/taste.ts), not here.
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DIMENSIONS } from '@/lib/taste';

const MODEL = 'claude-opus-5-5';
const CACHE_DIR = path.join(process.cwd(), '.picky-cache');

const client = new Anthropic();

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

interface ClaudePhoto {
  ref: string;
  person: boolean;
  gated: boolean;
  scores: Record<string, number>;
}

export async function POST(request: Request) {
  const body = (await request.json()) as { sceneId: string; photos: { id: string; imageBase64: string }[] };
  const photos = body.photos ?? [];
  if (photos.length === 0) return Response.json({ error: 'no photos' }, { status: 400 });

  // same photos → same scores, so cache by photo ids (saves money and makes the demo work offline)
  const key = createHash('sha1')
    .update(MODEL + photos.map((p) => p.id).sort().join('|'))
    .digest('hex');
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  const cached = await readFile(cacheFile, 'utf8').catch(() => null);
  if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json' } });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY is missing in .env (restart npx expo start after adding it)' }, { status: 500 });
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  photos.forEach((p, i) => {
    content.push({ type: 'text', text: `Photo p${i + 1}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.imageBase64 } });
  });
  content.push({
    type: 'text',
    text: `Score all ${photos.length} photos (p1–p${photos.length}). Dimensions:\n${DIMENSIONS.map(
      (d) => `- ${d.key}: ${d.definition}`,
    ).join('\n')}`,
  });

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema() } },
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') {
      return Response.json({ error: 'Claude declined to score these photos' }, { status: 502 });
    }
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return Response.json({ error: 'empty response' }, { status: 502 });
    const parsed = JSON.parse(text.text) as { label: string; photos: ClaudePhoto[] };

    const result = {
      label: parsed.label,
      photos: parsed.photos
        .map((p) => {
          const index = Number(p.ref.replace(/\D/g, '')) - 1;
          const original = photos[index];
          if (!original) return null;
          const scores = Object.fromEntries(
            DIMENSIONS.map((d) => [d.key, Math.min(5, Math.max(1, Math.round(p.scores[d.key] ?? 3)))]),
          );
          return { id: original.id, person: p.person, gated: p.gated, scores };
        })
        .filter(Boolean),
    };
    const json = JSON.stringify(result);
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile, json);
    return new Response(json, { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: 'Invalid ANTHROPIC_API_KEY' }, { status: 500 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return Response.json({ error: 'Rate limited by Claude — try again in a moment' }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return Response.json({ error: `Claude API error ${e.status}: ${e.message}` }, { status: 502 });
    }
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
