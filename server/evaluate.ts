/** Evaluate saved, human-labelled comparisons. No photos, network, or test-label updates. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KEYS, FEATURE_VERSION } from '../src/lib/personalization/features';
import { difference, emptyModel, genericScore, observe, probability, score, type Comparison } from '../src/lib/personalization/taste';
import { validScores } from '../src/lib/personalization/selection';
export interface EvaluationData { featureVersion: string; train: Comparison[]; test: Comparison[] }
export function evaluate(data: EvaluationData) {
  if (data.featureVersion !== FEATURE_VERSION || !Array.isArray(data.train) || !Array.isArray(data.test) || !data.test.length)
    throw new Error('Expected current featureVersion plus train and nonempty test arrays.');
  const pairIds = new Set<string>(); const photoScenes = new Map<string, string>();
  for (const c of [...data.train, ...data.test]) {
    if (![c.id, c.sceneId, c.aId, c.bId].every((s) => typeof s === 'string' && s.length) || c.aId === c.bId ||
      ![0, 0.5, 1].includes(c.target) || !validScores(c.a) || !validScores(c.b) || KEYS.some((k) => !(k in c.a) || !(k in c.b)))
      throw new Error('Invalid comparison or missing feature keys.');
    const key = [c.aId, c.bId].sort().join('\0');
    if (pairIds.has(key)) throw new Error('Duplicate comparison pair; deduplicate before evaluation.');
    pairIds.add(key);
    for (const id of [c.aId, c.bId]) {
      if (photoScenes.has(id) && photoScenes.get(id) !== c.sceneId) throw new Error('A photo belongs to multiple scenes.');
      photoScenes.set(id, c.sceneId);
    }
  }
  const trainScenes = new Set(data.train.map((c) => c.sceneId));
  const trainPhotos = new Set(data.train.flatMap((c) => [c.aId, c.bId]));
  if (data.test.some((c) => trainScenes.has(c.sceneId) || trainPhotos.has(c.aId) || trainPhotos.has(c.bId)))
    throw new Error('Train/test leakage: split by capture session and keep photo IDs disjoint.');
  let model = emptyModel();
  for (const c of data.train) model = observe(model, c);
  const decisive = data.test.filter((c) => c.target !== 0.5);
  const credit = (margin: number, c: Comparison) => Math.abs(margin) < 1e-10 ? 0.5 : (margin > 0) === (c.target === 1) ? 1 : 0;
  const accuracy = (f: (c: Comparison) => number) => decisive.length ? decisive.reduce((s, c) => s + credit(f(c), c), 0) / decisive.length : null;
  const selected = decisive.filter((c) => model.history.length >= 10 && Math.abs(probability(model, c.a, c.b) - 0.5) >= 0.25);
  return { kind: 'human-labels-supplied-by-caller', featureVersion: FEATURE_VERSION, trainingPairs: data.train.length,
    retainedTrainingPairs: model.history.length, testPairs: data.test.length, decisiveTestPairs: decisive.length,
    pairwiseAccuracy: accuracy((c) => score(model, c.a) - score(model, c.b)),
    genericAccuracy: accuracy((c) => genericScore(c.a) - genericScore(c.b)),
    brier: data.test.reduce((s, c) => s + (probability(model, c.a, c.b) - c.target) ** 2, 0) / data.test.length,
    logLoss: data.test.reduce((s, c) => { const p = probability(model, c.a, c.b); return s - c.target * Math.log(p) - (1 - c.target) * Math.log(1 - p); }, 0) / data.test.length,
    indistinguishableFraction: data.test.filter((c) => difference(c.a, c.b).every((d) => Math.abs(d) < 0.125)).length / data.test.length,
    experimentalCoverage: decisive.length ? selected.length / decisive.length : 0,
    experimentalSelectiveAccuracy: selected.length ? selected.reduce((s, c) => s + credit(probability(model, c.a, c.b) - 0.5, c), 0) / selected.length : null,
    warning: 'Probability margins are uncalibrated. Accuracy excludes explicit human ties and gives half-credit to model-tied predictions. Use one user/context per file. No deletion authorization.' };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: npm run evaluate:preferences -- /path/to/labels.json');
  console.log(JSON.stringify(evaluate(JSON.parse(readFileSync(process.argv[2], 'utf8'))), null, 2));
}
