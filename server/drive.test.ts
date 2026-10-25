import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createDriveUploader } from './drive';
import { backupThenDelete, type BackupReceipt } from '../src/lib/backup';
import type { Photo } from '../src/lib/types';

const bytes = Buffer.from([255, 216, 255, 0, 1]);
const input = { id: 'asset-a', filename: 'test.jpg', imageBase64: bytes.toString('base64') };
function uploader(mode: 'ok' | 'checksum' | 'existing' | 'malicious' | 'size') {
  let puts = 0; const digest = createHash('md5').update(bytes).digest('hex');
  const file = { id: 'drive-file', size: String(bytes.length + (mode === 'size' ? 1 : 0)), md5Checksum: mode === 'checksum' ? 'wrong' : digest };
  const mock: typeof fetch = async (request, init) => {
    const url = String(request);
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
    if (url.includes('q=') && !url.includes('appProperties')) return Response.json({ files: [{ id: 'folder' }] });
    if (url.includes('q=')) return Response.json({ files: mode === 'existing' ? [file] : [] });
    if (init?.method === 'POST') return new Response('', { headers: { location: mode === 'malicious' ? 'https://foreign.test/upload' : 'https://www.googleapis.com/upload/drive/v3/files?upload_id=fixture' } });
    if (init?.method === 'PUT') { puts++; assert.deepEqual(Buffer.from(init.body as Uint8Array), bytes); return Response.json(file); }
    throw new Error('Unexpected network request.');
  };
  return { upload: createDriveUploader({ credentials: () => ({ clientId: 'fixture', clientSecret: 'fixture', refreshToken: 'fixture' }), fetch: mock }), puts: () => puts };
}
test('Drive confirms uploaded JPEG bytes and reuses only checksum-matching existing backups', async () => {
  const first = uploader('ok'); const receipt = await first.upload(input);
  assert.equal(receipt.verified, true); assert.equal(receipt.photoId, input.id); assert.equal(first.puts(), 1);
  const existing = uploader('existing'); assert.equal((await existing.upload(input)).driveFileId, 'drive-file'); assert.equal(existing.puts(), 0);
});
test('Drive rejects malformed input, missing credentials, wrong checksums and foreign upload URLs', async () => {
  await assert.rejects(uploader('ok').upload({ ...input, imageBase64: 'not-jpeg' }));
  await assert.rejects(createDriveUploader({ credentials: () => ({ clientId: '', clientSecret: '', refreshToken: '' }) })(input), /not_configured/);
  await assert.rejects(uploader('checksum').upload(input), /checksum/);
  await assert.rejects(uploader('size').upload(input), /checksum/);
  const foreign = uploader('malicious'); await assert.rejects(foreign.upload(input), /session URL/); assert.equal(foreign.puts(), 0);
});
const photos = (): Photo[] => ['a', 'b'].map((id) => ({ id, sceneId: 's', uri: '', status: 'binned', takenAt: 0 }));
const receipt = (id: string): BackupReceipt => ({ photoId: id, driveFileId: `drive-${id}`, verified: true });
test('only successfully verified backups enter the native removal call', async () => {
  const removed: string[][] = [];
  const result = await backupThenDelete(photos(), { isCurrent: () => true,
    backup: async (photo) => { if (photo.id === 'b') throw new Error('upload failed'); return receipt(photo.id); },
    remove: async (ids) => { removed.push(ids); return true; } });
  assert.deepEqual(removed, [['a']]); assert.deepEqual(result.deleted, ['a']); assert.deepEqual(result.failed, ['b']);
});
test('mismatched receipts, all failures, cancellation and cancelled system deletion preserve originals', async () => {
  let removes = 0;
  const remove = async () => { removes++; return true; };
  await backupThenDelete(photos(), { isCurrent: () => true, backup: async () => receipt('wrong-asset'), remove });
  assert.equal(removes, 0);
  let current = true;
  const cancelled = await backupThenDelete(photos(), { isCurrent: () => current, backup: async (p) => { current = false; return receipt(p.id); }, remove });
  assert.ok(cancelled.cancelled); assert.equal(removes, 0);
  const denied = await backupThenDelete(photos(), { isCurrent: () => true, backup: async (p) => receipt(p.id), remove: async () => false });
  assert.deepEqual(denied.deleted, []);
  const callbackError = await backupThenDelete(photos(), { isCurrent: () => true, backup: async (p) => receipt(p.id), remove,
    onBackedUp: () => { throw new Error('state update failed'); } });
  assert.deepEqual(callbackError.deleted, []); assert.equal(removes, 0);
});
