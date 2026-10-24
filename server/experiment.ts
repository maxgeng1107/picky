/** Offline synthetic stress test. Does NOT run a VLM or measure human aesthetic accuracy. */
import { writeFileSync } from 'node:fs';
import { KEYS } from '../src/lib/personalization/features';
import { difference, dot, emptyModel, genericScore, observe, probability, score, type Comparison } from '../src/lib/personalization/taste';
import type { Scores } from '../src/lib/personalization/types';

function rng(seed: number) { let n = seed >>> 0; return () => ((n = (1664525 * n + 1013904223) >>> 0) / 4294967296); }
const clamp = (x: number) => Math.max(1, Math.min(5, x));
type Regime = 'linear-clean' | 'noisy-feedback' | 'subtle-clean-features' | 'subtle-noisy-features' | 'correlated-training' | 'nonlinear-taste' | 'unobserved-taste';
const regimes: Regime[] = ['linear-clean', 'noisy-feedback', 'subtle-clean-features', 'subtle-noisy-features', 'correlated-training', 'nonlinear-taste', 'unobserved-taste'];
const counts = [0, 5, 10, 20, 40];
const seeds = 30;
const results: unknown[] = [];
const winCredit = (margin: number, truth: number) => Math.abs(margin) < 1e-10 ? 0.5 : (margin > 0) === (truth > 0) ? 1 : 0;

for (const regime of regimes) for (const count of counts) {
  const runs: { accuracy: number; originalCounter: number; matchedCounter: number; generic: number; logLoss: number; coverage: number; selectedCorrect: number; selected: number; retainedFeedback: number }[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    // The two subtle regimes share users, latent pairs, and jitter draws: noise is the only change.
    const regimeSeed = regime.startsWith('subtle-') ? regimes.indexOf('subtle-clean-features') : regimes.indexOf(regime);
    const random = rng(seed * 901 + regimeSeed * 100003);
    const w = KEYS.map(() => random() * 2 - 1);
    const vector = () => KEYS.map(() => 1 + 4 * random());
    const toScores = (x: number[]): Scores => Object.fromEntries(KEYS.map((k, i) => [k, x[i]]));
    function pair(training: boolean) {
      const a = vector(); const b = vector();
      if (regime === 'correlated-training' && training) { a[1] = a[0]; b[1] = b[0]; }
      if (regime.startsWith('subtle-')) for (let i = 0; i < a.length; i++) b[i] = clamp(a[i] + (random() - 0.5) * 0.6);
      const utility = (x: number[]) => regime === 'nonlinear-taste'
        ? -Math.pow(x[0] - 3, 2) + 0.5 * (x[1] - 3) * (x[2] - 3)
        : dot(w, x.map((v) => (v - 3) / 2));
      let truth = regime === 'unobserved-taste' ? random() - 0.5 : utility(a) - utility(b);
      const measure = (v: number) => {
        const jitter = regime.startsWith('subtle-') ? (random() - 0.5) * 1.2 : 0;
        return regime === 'subtle-noisy-features' ? clamp(v + jitter) : v;
      };
      const observedA = a.map(measure); const observedB = b.map(measure);
      if (training && regime === 'noisy-feedback' && random() < 0.2) truth *= -1;
      return { a: toScores(observedA), b: toScores(observedB), truth };
    }
    const training = Array.from({ length: 40 }, () => pair(true));
    // Always generate 40 training rows so each count uses the SAME holdout stream.
    let model = emptyModel(); const supports = KEYS.map(() => 0); const againsts = KEYS.map(() => 0);
    for (let i = 0; i < count; i++) {
      const p = training[i]; const c: Comparison = { ...p, id: String(i), sceneId: `train-${i}`, aId: `${i}a`, bId: `${i}b`, target: p.truth > 0 ? 1 : 0 };
      model = observe(model, c);
      difference(p.a, p.b).forEach((v, k) => { const d = v * (c.target === 1 ? 1 : -1); if (d >= 1) supports[k]++; else if (d <= -1) againsts[k]++; });
    }
    // Original six-dimensional counter, DIFF_MIN=2, and original generic fallback.
    const matchedWeights = supports.map((s, k) => {
      const a = againsts[k]; const d = s - a;
      if (s + a >= 3 && Math.abs(d) <= 1) return 0;
      return d >= 2 ? 2 : d <= -2 ? -2 : Math.sign(d);
    });
    const oldWeights = matchedWeights.map((w, k) => k < 6 ? w : 0);
    const oldHasEvidence = supports.slice(0, 6).some((v, i) => v + againsts[i] > 0);
    const oldScore = (s: Scores) => oldHasEvidence ? dot(oldWeights, KEYS.map((k) => (s[k]! - 3) / 2))
      : (s.facing_camera! + s.smile_teeth! + s.big_eyes!);
    const matchedHasEvidence = supports.some((v, i) => v + againsts[i] > 0);
    const matchedScore = (s: Scores) => matchedHasEvidence ? dot(matchedWeights, KEYS.map((k) => (s[k]! - 3) / 2)) : genericScore(s);
    let correct = 0, oldCorrect = 0, matchedCorrect = 0, genericCorrect = 0, loss = 0, selected = 0, selectedCorrect = 0;
    const trials = 400;
    for (let i = 0; i < trials; i++) {
      const p = pair(false); const prob = probability(model, p.a, p.b);
      const margin = score(model, p.a) - score(model, p.b);
      correct += winCredit(margin, p.truth); oldCorrect += winCredit(oldScore(p.a) - oldScore(p.b), p.truth);
      genericCorrect += winCredit(genericScore(p.a) - genericScore(p.b), p.truth);
      matchedCorrect += winCredit(matchedScore(p.a) - matchedScore(p.b), p.truth);
      loss -= Math.log(Math.max(1e-8, p.truth > 0 ? prob : 1 - prob));
      if (model.history.length >= 10 && Math.abs(prob - 0.5) >= 0.25) { selected++; selectedCorrect += winCredit(prob - 0.5, p.truth); }
    }
    runs.push({ accuracy: correct / trials, originalCounter: oldCorrect / trials, matchedCounter: matchedCorrect / trials, generic: genericCorrect / trials,
      logLoss: loss / trials, coverage: selected / trials, selectedCorrect, selected, retainedFeedback: model.history.length });
  }
  const mean = (key: keyof typeof runs[number]) => runs.reduce((s, r) => s + r[key], 0) / runs.length;
  const accuracy = mean('accuracy');
  const sd = Math.sqrt(runs.reduce((s, r) => s + (r.accuracy - accuracy) ** 2, 0) / (runs.length - 1));
  const selected = runs.reduce((s, r) => s + r.selected, 0);
  results.push({ regime, feedback: count, accuracy, originalCounter: mean('originalCounter'), matchedCounter: mean('matchedCounter'), generic: mean('generic'),
    accuracySD: sd, mean95CI: [accuracy - 1.96 * sd / Math.sqrt(seeds), accuracy + 1.96 * sd / Math.sqrt(seeds)],
    logLoss: mean('logLoss'), coverage: mean('coverage'),
    selectiveAccuracy: selected ? runs.reduce((s, r) => s + r.selectedCorrect, 0) / selected : null,
    retainedFeedback: mean('retainedFeedback') });
}
const report = { kind: 'synthetic-only', seeds, testPairsPerSeed: 400,
  limitations: ['No VLM calls, human labels, or real photos. These are NOT product accuracy numbers.',
    'Linear synthetic users match the new model assumptions and favor that model class.',
    'Original counter uses six dimensions. matchedCounter uses the same eight features and cold-start fallback as the new ranker to isolate the learning-rule change.',
    '20% label noise is applied only during training; holdout targets are latent deterministic preferences.',
    'Correlated training is evaluated on independently varying features (deliberate distribution shift).',
    'Selective threshold is an experimental score margin, not calibrated confidence or deletion authorization.'], results };
writeFileSync('server/experiment-results.json', JSON.stringify(report, null, 2) + '\n');
console.table((results as Record<string, unknown>[]).filter((r) => r.feedback === 20).map((r) => ({
  regime: r.regime, feedback: r.feedback, pairwise: Number(r.accuracy).toFixed(3), counter: Number(r.originalCounter).toFixed(3), coverage: Number(r.coverage).toFixed(3),
})));
