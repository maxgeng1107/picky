import { createHash } from 'node:crypto';
import { RequestError } from './http';

export interface DriveInput { id: string; filename: string; imageBase64: string }
interface Credentials { clientId: string; clientSecret: string; refreshToken: string }
export function driveConfigured() { return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN); }
export function validateDriveInput(raw: unknown): DriveInput {
  const p = raw as DriveInput;
  if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 200 || typeof p.filename !== 'string' || !p.filename.trim() ||
    p.filename.length > 200 || /[\r\n]/.test(p.filename) || typeof p.imageBase64 !== 'string' || p.imageBase64.length > 28_000_000 ||
    p.imageBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(p.imageBase64)) throw new RequestError('Invalid JPEG backup request.');
  const bytes = Buffer.from(p.imageBase64, 'base64');
  if (bytes.length < 3 || bytes.length > 20 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
    throw new RequestError('Backup supports JPEG copies up to 20 MiB.');
  return p;
}
export function createDriveUploader(options: { credentials?: () => Credentials; fetch?: typeof fetch } = {}) {
  const request = (url: string, init?: RequestInit) => (options.fetch ?? globalThis.fetch)(url, { ...init, signal: AbortSignal.timeout(60_000) });
  let token: { value: string; until: number; identity: string } | undefined;
  let folder: string | undefined;
  return async (input: DriveInput) => {
    validateDriveInput(input);
    const credentials = options.credentials?.() ?? { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, refreshToken: process.env.GOOGLE_REFRESH_TOKEN! };
    if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) throw new RequestError('drive_not_configured', 503);
    const identity = createHash('sha256').update(JSON.stringify(credentials)).digest('hex');
    if (!token || token.identity !== identity || Date.now() >= token.until - 60_000) {
      if (token?.identity !== identity) folder = undefined;
      const response = await request('https://oauth2.googleapis.com/token', { method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
          client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken, grant_type: 'refresh_token' }) });
      if (!response.ok) throw new Error(`Google authorization failed (${response.status}).`);
      const data = await response.json();
      if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error('Invalid Google token response.');
      token = { value: data.access_token, until: Date.now() + data.expires_in * 1000, identity };
    }
    const headers = { Authorization: `Bearer ${token.value}` };
    if (!folder) {
      const q = encodeURIComponent("name='Picky Cloud Bin' and mimeType='application/vnd.google-apps.folder' and trashed=false");
      const response = await request(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, { headers });
      if (!response.ok) throw new Error(`Drive folder lookup failed (${response.status}).`);
      const data = await response.json();
      if (!Array.isArray(data.files)) throw new Error('Invalid Drive folder response.');
      folder = data.files.find((f: { id?: unknown }) => typeof f.id === 'string' && f.id)?.id;
      if (!folder) {
        const created = await request('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Picky Cloud Bin', mimeType: 'application/vnd.google-apps.folder' }) });
        if (!created.ok) throw new Error(`Drive folder creation failed (${created.status}).`);
        const data = await created.json(); if (typeof data.id !== 'string' || !data.id) throw new Error('Missing Drive folder ID.');
        folder = data.id;
      }
    }
    const bytes = Buffer.from(input.imageBase64, 'base64');
    const md5 = createHash('md5').update(bytes).digest('hex');
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const assetHash = createHash('sha256').update(input.id).digest('hex');
    const validFile = (f: { id?: unknown; md5Checksum?: unknown; size?: unknown }) =>
      typeof f?.id === 'string' && f.id.length > 0 && f.md5Checksum === md5 && Number(f.size) === bytes.length;
    const result = (file: { id: string }) => ({ photoId: input.id, driveFileId: file.id, verified: true as const, md5Checksum: md5, size: bytes.length });
    const q = encodeURIComponent(`'${folder}' in parents and trashed=false and appProperties has { key='pickyId' and value='${assetHash}' } and appProperties has { key='sha256' and value='${contentHash}' }`);
    const existing = await request(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,md5Checksum,size)`, { headers });
    if (!existing.ok) throw new Error(`Drive backup lookup failed (${existing.status}).`);
    const existingData = await existing.json();
    if (!Array.isArray(existingData.files)) throw new Error('Invalid Drive backup lookup.');
    const matched = existingData.files.find(validFile);
    if (matched) return result(matched);
    // Resumable upload supports full-resolution JPEGs larger than the multipart recommendation.
    const session = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,md5Checksum,size', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'X-Upload-Content-Type': 'image/jpeg', 'X-Upload-Content-Length': String(bytes.length) },
      body: JSON.stringify({ name: input.filename, mimeType: 'image/jpeg', parents: [folder], appProperties: {
        pickyId: assetHash, sha256: contentHash, expiresAt: String(Date.now() + 30 * 24 * 60 * 60_000) } }) });
    if (!session.ok) throw new Error(`Drive upload initialization failed (${session.status}).`);
    const location = session.headers.get('location');
    if (!location) throw new Error('Missing Drive upload session.');
    const target = new URL(location);
    if (target.protocol !== 'https:' || !['https://www.googleapis.com', 'https://content.googleapis.com'].includes(target.origin) || target.username || target.password ||
      !target.pathname.startsWith('/upload/drive/v3/files')) throw new Error('Invalid Drive upload session URL.');
    const uploaded = await request(target.href, { method: 'PUT', headers: { ...headers, 'content-type': 'image/jpeg', 'content-length': String(bytes.length) }, body: bytes });
    if (!uploaded.ok) throw new Error(`Drive upload failed (${uploaded.status}).`);
    const file = await uploaded.json();
    if (!validFile(file)) throw new Error('Drive did not confirm the complete JPEG checksum and size. Original preserved.');
    return result(file);
  };
}
