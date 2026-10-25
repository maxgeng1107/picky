import { createServer } from 'node:http';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Study, type Choice, type Split } from './study';
import { observePhotos, PROMPT, validatePhotos, visionModel, type InputPhoto, type Observation } from './vision';
import { KEYS } from '../src/lib/personalization/features';

/** Fetch-style handler lets fixture tests cover the entire protocol without a paid API call. */
export function createStudyApp(options: {
  vision?: (photos: InputPhoto[], options?: { bypassCache?: boolean }) => Promise<Observation>;
  persist?: (id: string, snapshot: unknown) => Promise<void>;
} = {}) {
  let study: Study | undefined; let runId = ''; let busy = false;
  let lastReport: unknown; const repeatability: unknown[] = [];
  const vision = options.vision ?? observePhotos;
  const persist = options.persist ?? (async (id, snapshot) => {
    await mkdir('server/runs', { recursive: true });
    const name = `server/runs/${id}.json`;
    await writeFile(`${name}.tmp`, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    await rename(`${name}.tmp`, name);
  });
  const snapshot = () => ({ ...study!.dataset(), runId, participant: study!.participant, purpose: study!.purpose,
    model: visionModel(), featurePromptSHA256: createHash('sha256').update(PROMPT).digest('hex'),
    savedAt: new Date().toISOString(), scenes: study!.scenes, questions: study!.questions, choices: study!.choices,
    repeatability, report: lastReport });
  const state = () => ({ question: study?.next ?? null, answered: study?.choices.length ?? 0, total: study?.questions.length ?? 0 });
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url); const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'Use this study on the same localhost origin.' }, 403);
    if (request.method === 'GET' && url.pathname === '/') return new Response(await readFile(new URL('./study.html', import.meta.url)), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    if (request.method === 'GET' && url.pathname === '/api/config') return json({
      keyConfigured: Boolean(process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY), model: visionModel() ?? null });
    if (request.method === 'GET' && url.pathname === '/api/download' && study) {
      return new Response(JSON.stringify(snapshot(), null, 2), { headers: { 'content-type': 'application/json',
        'content-disposition': `attachment; filename="${runId}.json"`, 'cache-control': 'no-store' } });
    }
    if (request.method !== 'POST') return json({ error: 'Not found' }, 404);
    if (busy) return json({ error: 'A VLM request is running; wait for it to finish.' }, 429);
    let input;
    try { input = await request.json(); if (!input || typeof input !== 'object') throw new Error(); }
    catch { return json({ error: 'Invalid JSON object.' }, 400); }
    try {
      if (url.pathname === '/api/begin') {
        if (typeof input.participant !== 'string' || !input.participant.trim() || input.participant.length > 80 ||
          typeof input.purpose !== 'string' || !input.purpose.trim() || input.purpose.length > 200)
          return json({ error: 'Enter a participant alias and one clear photo-selection purpose.' }, 400);
        study = new Study(input.participant.trim(), input.purpose.trim(), randomBytes(4).readUInt32LE());
        lastReport = undefined; repeatability.length = 0;
        runId = `study-${randomUUID()}`;
        await persist(runId, snapshot()); return json({ runId });
      }
      if (!study) return json({ error: 'Start a study first.' }, 400);
      if (url.pathname === '/api/scene') {
        const photos = validatePhotos(input.photos);
        if (typeof input.sceneId !== 'string') throw new Error('Missing capture-session name.');
        for (const p of photos) {
          const hash = createHash('sha256').update(Buffer.from(p.imageBase64, 'base64')).digest('hex');
          if (p.id !== hash) throw new Error('Photo ID must be the SHA256 of the encoded JPEG bytes.');
        }
        study.validateScene(input.sceneId, input.split as Split, photos.map((p) => p.id));
        busy = true;
        try {
          const observation = await vision(photos);
          study.addScene({ id: input.sceneId, split: input.split, photoIds: photos.map((p) => p.id), observation });
          if (input.checkStability === true) {
            try {
              const repeated = await vision([...photos].reverse(), { bypassCache: true });
              const differences: number[] = []; let nullDisagreements = 0;
              for (const p of photos) for (const k of KEYS) {
                const a = observation.scores[p.id][k]; const b = repeated.scores[p.id][k];
                if (a === null || b === null) { if (a !== b) nullDisagreements++; }
                else differences.push(Math.abs(a - b));
              }
              repeatability.push({ sceneId: input.sceneId, kind: 'fresh-call-with-reversed-image-order',
                measuredAttributes: differences.length, meanAbsoluteDifference: differences.length ? differences.reduce((s, x) => s + x, 0) / differences.length : null,
                maxAbsoluteDifference: differences.length ? Math.max(...differences) : null, nullDisagreements,
                gateFlips: photos.filter((p) => observation.gated.includes(p.id) !== repeated.gated.includes(p.id)).length,
                repeatedObservation: repeated });
            } catch (e) { repeatability.push({ sceneId: input.sceneId, error: e instanceof Error ? e.message : 'Repeat request failed' }); }
          }
          await persist(runId, snapshot());
          // Do not reveal features or rankings before the participant finishes.
          return json({ scoredPhotos: photos.length, scoredSessions: study.scenes.length });
        } catch (e) { return json({ error: e instanceof Error ? e.message : 'VLM request failed.' }, 502); }
        finally { busy = false; }
      }
      if (url.pathname === '/api/start') { study.start(); await persist(runId, snapshot()); return json(state()); }
      if (url.pathname === '/api/choice') {
        study.answer(input as Choice); await persist(runId, snapshot()); return json(state());
      }
      if (url.pathname === '/api/report') {
        const report = { ...study.report(), model: visionModel(), runId, repeatability };
        lastReport = report;
        await persist(runId, { ...snapshot(), report }); return json(report);
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) { return json({ error: e instanceof Error ? e.message : 'Study request failed.' }, 400); }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of ['.env', 'server/.env']) { try { process.loadEnvFile(file); } catch { /* optional local env files */ } }
  const app = createStudyApp(); const port = Number(process.env.STUDY_PORT ?? 3002);
  const server = createServer(async (req, res) => {
    // Loopback only, with a Host allowlist to reject DNS-rebinding requests.
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) { res.writeHead(403); res.end(); return; }
    try {
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 40 * 1024 * 1024) { res.writeHead(413); res.end('Request too large'); return; }
        chunks.push(chunk);
      }
      const response = await app(new Request(`http://${req.headers.host}${req.url}`, { method: req.method,
        headers: req.headers as Record<string, string>, body: chunks.length ? Buffer.concat(chunks) : undefined }));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { if (!res.headersSent) res.writeHead(500); res.end('Study server error'); }
  });
  server.requestTimeout = 150_000;
  server.listen(port, '127.0.0.1', () => console.log(`Picky real-user study: http://127.0.0.1:${port}`));
}
