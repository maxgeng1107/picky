import { parseSelection, type SelectResponse } from './scoring';
export type { ScoredPhoto, SelectResponse } from './scoring';

export async function selectScene(sceneId: string, photos: { id: string; imageBase64: string }[]): Promise<SelectResponse> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 75_000);
  try {
    const response = await fetch('/api/select', { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneId, photos }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `Scoring failed (${response.status}).`);
    return parseSelection(data, photos.map((p) => p.id));
  } finally { clearTimeout(timeout); }
}

export async function isDriveConfigured(): Promise<boolean> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000);
  try { const response = await fetch('/api/upload', { signal: controller.signal }); return response.ok && (await response.json()).configured === true; }
  catch { return false; } finally { clearTimeout(timer); }
}
export async function uploadToDrive(id: string, filename: string, imageBase64: string): Promise<import('./backup').BackupReceipt> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch('/api/upload', { method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, filename, imageBase64 }) });
    const data = await response.json();
    if (!response.ok || data.photoId !== id || data.verified !== true || typeof data.driveFileId !== 'string' || !data.driveFileId)
      throw new Error(data.error ?? 'Backup was not verified.');
    return data;
  } finally { clearTimeout(timer); }
}
