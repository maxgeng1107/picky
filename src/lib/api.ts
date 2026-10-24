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
