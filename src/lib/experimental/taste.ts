import { DIMENSIONS, FEATURE_VERSION, KEYS } from './features';
import type { Scores, TasteProfile } from './types';

export interface Comparison {
  id: string;
  sceneId: string;
  aId: string;
  bId: string;
  a: Scores;
  b: Scores;
  /** Explicit choice only. 0.5 is an explicit tie, never inferred from keepBoth/skip. */
  target: 0 | 0.5 | 1;
}
export interface PreferenceModel {
  version: typeof FEATURE_VERSION;
  weights: number[];
  history: Comparison[];
}
export const normalized = (x: number | null | undefined): number | null =>
  typeof x === 'number' && Number.isFinite(x) && x >= 1 && x <= 5 ? (x - 3) / 2 : null;
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
export function difference(a: Scores, b: Scores): number[] {
  return KEYS.map((k) => {
    const x = normalized(a[k]); const y = normalized(b[k]);
    return x === null || y === null ? 0 : x - y;
  });
}
export const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
export const emptyModel = (): PreferenceModel => ({ version: FEATURE_VERSION, weights: KEYS.map(() => 0), history: [] });
export function probability(model: PreferenceModel, a: Scores, b: Scores): number {
  // This is a model probability, NOT a calibrated confidence estimate.
  return sigmoid(dot(model.weights, difference(a, b)));
}
export function fit(history: Comparison[]): PreferenceModel {
  const weights = KEYS.map(() => 0);
  const rows = history.map((h) => ({ x: difference(h.a, h.b), y: h.target }));
  // Replay all retained choices, L2 regularization, bounded deterministic optimization.
  for (let step = 0; step < 240 && rows.length; step++) {
    const gradient = weights.map((w) => 0.04 * w);
    for (const { x, y } of rows) {
      const error = sigmoid(dot(weights, x)) - y;
      x.forEach((v, i) => { gradient[i] += error * v / rows.length; });
    }
    weights.forEach((w, i) => { weights[i] = w - 0.4 * gradient[i]; });
  }
  return { version: FEATURE_VERSION, weights, history };
}
export function observe(model: PreferenceModel, comparison: Comparison): PreferenceModel {
  const history = appendComparison(model.history, comparison);
  return history === model.history ? model : fit(history);
}
function appendComparison(history: Comparison[], comparison: Comparison): Comparison[] {
  if (comparison.aId === comparison.bId) return history;
  const x = difference(comparison.a, comparison.b);
  // A nearly unobservable difference should not manufacture preference evidence.
  if (Math.max(...x.map(Math.abs)) < 0.125) return history;
  const samePair = (h: Comparison) => h.sceneId === comparison.sceneId &&
    [h.aId, h.bId].sort().join('\0') === [comparison.aId, comparison.bId].sort().join('\0');
  return [...history.filter((h) => h.id !== comparison.id && !samePair(h)), comparison].slice(-300);
}
export function genericScore(scores: Scores): number {
  return ((normalized(scores.lighting) ?? 0) + (normalized(scores.expression) ?? 0)) / 2;
}
export function score(model: PreferenceModel, scores: Scores): number {
  return model.history.length ? dot(model.weights, KEYS.map((k) => normalized(scores[k]) ?? 0)) : genericScore(scores);
}
export function profileFor(model: PreferenceModel, previous?: TasteProfile): TasteProfile {
  const criteria = DIMENSIONS.map((d, i) => {
    let support = 0; let against = 0;
    for (const h of model.history) {
      if (h.target === 0.5) continue;
      const delta = difference(h.a, h.b)[i] * (h.target === 1 ? 1 : -1);
      if (delta >= 0.125) support++;
      else if (delta <= -0.125) against++;
    }
    const old = previous?.preference?.weights[i] ?? 0;
    const delta = model.weights[i] - old;
    return { key: d.key, name: d.name, kind: d.kind, support, against,
      // Evidence counts are descriptive only. Conflicts do NOT prove indifference.
      status: support + against ? 'leaning' as const : 'unknown' as const,
      lastChange: Math.abs(delta) > 0.02 ? (delta > 0 ? 'up' as const : 'down' as const) : undefined };
  });
  return { criteria, preference: model, summary: model.history.length
    ? `Learning from ${model.history.length} distinct comparisons. Estimates are provisional; conflicting choices do not prove indifference.`
    : 'Choose between photos to personalize ranking. No personal preference has been learned yet.' };
}
export function restoreModel(raw: unknown): PreferenceModel {
  if (!raw || typeof raw !== 'object') return emptyModel();
  const m = raw as Partial<PreferenceModel>;
  if (m.version !== FEATURE_VERSION || !Array.isArray(m.history)) return emptyModel();
  let history: Comparison[] = [];
  for (const h of m.history.slice(-300)) {
    if (h && typeof h.id === 'string' && typeof h.sceneId === 'string' &&
        typeof h.aId === 'string' && typeof h.bId === 'string' &&
        h.a && h.b && typeof h.a === 'object' && typeof h.b === 'object' &&
        [0, 0.5, 1].includes(h.target)) history = appendComparison(history, h);
  }
  return fit(history);
}
