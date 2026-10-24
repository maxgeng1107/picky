import type { Scores } from '@/lib/types';

export interface ScoredPhoto {
  id: string;
  person: boolean; // false = scenery/food/screenshot → Picky leaves it alone
  gated: boolean; // person, but eyes closed / blurry / face hidden
  scores: Scores;
}

export interface SelectResponse {
  label: string;
  photos: ScoredPhoto[];
}

export async function isDriveConfigured(): Promise<boolean> {
  try {
    const res = await fetch('/api/upload');
    return res.ok && ((await res.json()) as { configured: boolean }).configured;
  } catch {
    return false;
  }
}

// Back up one photo to Google Drive; resolves with the Drive file id only once Drive has stored it.
export async function uploadToDrive(id: string, filename: string, imageBase64: string): Promise<string> {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, filename, imageBase64 }),
  });
  const json = (await res.json().catch(() => ({}))) as { driveFileId?: string; error?: string };
  if (!res.ok || !json.driveFileId) throw new Error(json.error ?? `Upload failed (${res.status})`);
  return json.driveFileId;
}

// In development, a relative URL goes to the Expo dev server, which also runs src/app/api/select+api.ts.
export async function selectScene(sceneId: string, photos: { id: string; imageBase64: string }[]): Promise<SelectResponse> {
  const res = await fetch('/api/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneId, photos }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Scoring failed (${res.status}) ${text.slice(0, 200)}`);
  }
  return res.json();
}
