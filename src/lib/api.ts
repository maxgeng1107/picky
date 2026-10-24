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
