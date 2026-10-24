import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { observePhotos, validatePhotos } from './vision';
import { rankPhotos } from '../src/lib/experimental/selection';
import { emptyModel, genericScore, restoreModel } from '../src/lib/experimental/taste';
import type { Photo } from '../src/lib/experimental/types';

let busy = false;
export const server = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const send = (status: number, value: unknown) => { res.writeHead(status); res.end(JSON.stringify(value)); };
  if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, featureOnly: true, deletionEnabled: false });
  // No browser CORS. This is a trusted-LAN demo server, not a public deployment.
  if (req.headers.origin) return send(403, { error: 'Browser origins are not enabled.' });
  if (req.method !== 'POST' || req.url !== '/api/select') return send(404, { error: 'Not found' });
  if (busy) return send(429, { error: 'A scene is already being processed; retry after it finishes.' });
  busy = true;
  try {
    let size = 0; const chunks: Buffer[] = [];
    for await (const part of req) {
      size += part.length;
      if (size > 25 * 1024 * 1024) { send(413, { error: 'Request too large' }); return; }
      chunks.push(part);
    }
    let input; let photos;
    try { input = JSON.parse(Buffer.concat(chunks).toString()); photos = validatePhotos(input.photos); }
    catch { return send(400, { error: 'Invalid request: expected 1–12 uniquely identified JPEG photos.' }); }
    const observed = await observePhotos(photos);
    const model = input.profile?.preference ? restoreModel(input.profile.preference) : emptyModel();
    const candidates: Photo[] = photos.map((p) => ({ id: p.id, uri: '', takenAt: 0, sceneId: '', status: 'kept',
      scores: observed.scores[p.id], gated: observed.gated.includes(p.id) }));
    const ranked = rankPhotos(candidates, model);
    const generic = [...ranked].sort((a, b) => genericScore(b.scores!) - genericScore(a.scores!));
    send(200, { ...observed, tasteKeep: ranked.slice(0, 1).map((p) => p.id), genericKeep: generic.slice(0, 1).map((p) => p.id),
      ranking: ranked.map((p) => p.id), uncertain: ranked.slice(1, 4).map((p) => p.id), reasons: {} });
  } catch (error) { send(502, { error: error instanceof Error ? error.message : 'Vision request failed' }); }
  finally { busy = false; }
});
server.requestTimeout = 90_000;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile('server/.env'); } catch { /* Environment can be supplied by the shell. */ }
  server.listen(Number(process.env.PORT ?? 3001), process.env.HOST ?? '127.0.0.1');
}
