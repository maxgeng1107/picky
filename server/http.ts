export class RequestError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export async function readJSON(request: Request, maxBytes = 40 * 1024 * 1024): Promise<unknown> {
  if (!request.body) throw new RequestError('A JSON request body is required.');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RequestError('Request too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestError('Invalid JSON.'); }
}
