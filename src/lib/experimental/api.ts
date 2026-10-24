import { DIMENSIONS } from './features';
import { validScores } from './selection';
import type { Scores } from './types';

export async function fetchScores(sceneId: string, photos: { id: string; imageBase64: string }[]): Promise<{ scores: Record<string, Scores>; gated: string[] }> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error('Set EXPO_PUBLIC_API_URL to your laptop server URL.');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 75_000);
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/api/select`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ sceneId, photos }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `Server error ${response.status}`);
    if (!Array.isArray(data.gated) || data.gated.some((id: string) => !photos.some((p) => p.id === id)) ||
      photos.some((p) => !validScores(data.scores?.[p.id]) || DIMENSIONS.some((d) => !(d.key in data.scores[p.id]))))
      throw new Error('Server returned incomplete photo attributes.');
    return data;
  } finally { clearTimeout(timer); }
}
