/** Human labels are the ground truth. No test label ever enters fitting. */
import { FEATURE_VERSION, KEYS } from '../src/lib/experimental/features';
import { difference, emptyModel, observe, score, type Comparison } from '../src/lib/experimental/taste';
import { emptyProfile, learn, tasteScore, hasEvidence, genericScore as currentGeneric } from '../src/lib/taste';
import { evaluate } from './evaluate';
import type { Observation } from './vision';

export type Split = 'train' | 'test';
export interface StudyScene { id: string; split: Split; photoIds: string[]; observation: Observation }
export interface Question { id: string; sceneId: string; split: Split; aId: string; bId: string; repeatOf?: string }
export interface Choice { id: string; target: 0 | 0.5 | 1 | null }
const randomGenerator = (seed: number) => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export class Study {
  readonly scenes: StudyScene[] = [];
  readonly questions: Question[] = [];
  readonly choices: Choice[] = [];
  constructor(readonly participant: string, readonly purpose: string, readonly seed: number) {}
  validateScene(id: string, split: Split, photoIds: string[]) {
    if (this.questions.length) throw new Error('Scoring is locked after choices begin.');
    if (!id || id.length > 120 || !['train', 'test'].includes(split) || this.scenes.some((s) => s.id === id))
      throw new Error('Use a unique capture-session folder name, including across train/test.');
    if (this.scenes.length >= 24 || this.scenes.reduce((n, s) => n + s.photoIds.length, 0) + photoIds.length > 120)
      throw new Error('This pilot supports 24 sessions and 120 photos.');
    if (photoIds.length < 2 || photoIds.length > 12 || new Set(photoIds).size !== photoIds.length)
      throw new Error('Each session needs 2–12 distinct photos.');
    const seen = new Set(this.scenes.flatMap((s) => s.photoIds));
    if (photoIds.some((id) => seen.has(id))) throw new Error('Duplicate image bytes across sessions: remove duplicate photos before scoring.');
  }
  addScene(scene: StudyScene) { this.validateScene(scene.id, scene.split, scene.photoIds); this.scenes.push(scene); }
  start() {
    if (this.questions.length) throw new Error('Choices have already started.');
    const random = randomGenerator(this.seed);
    for (const split of ['train', 'test'] as const) {
      const groups = this.scenes.filter((s) => s.split === split).map((s) => {
        const ids = s.photoIds.filter((id) => !s.observation.gated.includes(id));
        const pairs: Question[] = [];
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
          const [aId, bId] = random() < 0.5 ? [ids[i], ids[j]] : [ids[j], ids[i]];
          pairs.push({ id: `${split}-${s.id}-${i}-${j}`, sceneId: s.id, split, aId, bId });
        }
        return shuffled(pairs, random).slice(0, 5);
      });
      const selected: Question[] = [];
      for (let i = 0; i < 5; i++) for (const group of groups) if (group[i]) selected.push(group[i]);
      this.questions.push(...selected.slice(0, split === 'train' ? 40 : 60));
    }
    if (!this.questions.some((q) => q.split === 'train') || !this.questions.some((q) => q.split === 'test')) {
      this.questions.length = 0; throw new Error('Need usable pairs from both training and held-out sessions.');
    }
    const repeats = shuffled(this.questions, random).slice(0, Math.min(5, Math.floor(this.questions.length / 10)));
    this.questions.push(...repeats.map((q, i) => ({ ...q, id: `repeat-${i}`, repeatOf: q.id, aId: q.bId, bId: q.aId })));
  }
  get next() { return this.questions[this.choices.length] ?? null; }
  answer(choice: Choice) {
    if (![0, 0.5, 1, null].includes(choice.target)) throw new Error('Choose A, B, an explicit tie, or skip.');
    const previous = this.choices.find((c) => c.id === choice.id);
    if (previous && previous.target === choice.target) return; // Request retry is idempotent.
    if (!this.next || choice.id !== this.next.id) throw new Error('Answer only the current question.');
    this.choices.push(choice);
  }
  dataset() {
    const data = { featureVersion: FEATURE_VERSION, train: [] as Comparison[], test: [] as Comparison[] };
    for (const c of this.choices) {
      const q = this.questions.find((q) => q.id === c.id)!;
      if (q.repeatOf || c.target === null) continue;
      const scene = this.scenes.find((s) => s.id === q.sceneId)!;
      data[q.split].push({ id: q.id, sceneId: q.sceneId, aId: q.aId, bId: q.bId,
        a: scene.observation.scores[q.aId], b: scene.observation.scores[q.bId], target: c.target });
    }
    return data;
  }
  report() {
    if (!this.questions.length || this.next) throw new Error('Finish blind choices before viewing model performance.');
    const data = this.dataset();
    if (!data.test.length) throw new Error('No answered test pairs; skipped pairs cannot establish accuracy.');
    const counts = [...new Set([0, 5, 10, 20, 40, data.train.length].filter((n) => n <= data.train.length))];
    const curve = counts.map((count) => {
      const train = data.train.slice(0, count);
      let baseline = emptyProfile(); let model = emptyModel();
      for (const c of train) {
        model = observe(model, c);
        if (c.target !== 0.5) baseline = learn(baseline, c.target === 1 ? c.a : c.b, c.target === 1 ? c.b : c.a);
      }
      const credit = (margin: number, c: Comparison) => Math.abs(margin) < 1e-10 ? 0.5 : (margin > 0) === (c.target === 1) ? 1 : 0;
      const decisive = data.test.filter((c) => c.target !== 0.5);
      const currentScore = hasEvidence(baseline) ? (s: Comparison['a']) => tasteScore(s, baseline) : currentGeneric;
      const perPair = decisive.map((c) => ({ sceneId: c.sceneId, credit: credit(score(model, c.a) - score(model, c.b), c) }));
      const ids = [...new Set(perPair.map((p) => p.sceneId))];
      const random = randomGenerator(this.seed + count);
      const bootstraps = ids.length >= 3 ? Array.from({ length: 1000 }, () => {
        const sample = ids.flatMap(() => { const id = ids[Math.floor(random() * ids.length)]; return perPair.filter((p) => p.sceneId === id); });
        return sample.reduce((s, p) => s + p.credit, 0) / sample.length;
      }).sort((a, b) => a - b) : [];
      const subtle = decisive.filter((c) => Math.max(...difference(c.a, c.b).map(Math.abs)) <= 0.25);
      return { feedback: count, ...evaluate({ ...data, train }),
        currentMainCounterAccuracy: decisive.length ? decisive.reduce((s, c) => s + credit(currentScore(c.a) - currentScore(c.b), c), 0) / decisive.length : null,
        subtleTestPairs: subtle.length,
        subtleAccuracy: subtle.length ? subtle.reduce((s, c) => s + credit(score(model, c.a) - score(model, c.b), c), 0) / subtle.length : null,
        sceneBootstrap95CI: bootstraps.length ? [bootstraps[25], bootstraps[974]] : null };
    });
    const repeats = this.questions.filter((q) => q.repeatOf).map((q) => {
      const a = this.choices.find((c) => c.id === q.id)!;
      const b = this.choices.find((c) => c.id === q.repeatOf)!;
      return a.target === null || b.target === null ? null : a.target === 1 - b.target;
    }).filter((x) => x !== null);
    return { kind: 'real-vlm-human-choices', participant: this.participant, purpose: this.purpose,
      featureVersion: FEATURE_VERSION, featureKeys: KEYS, seed: this.seed,
      sessions: { train: this.scenes.filter((s) => s.split === 'train').length, test: this.scenes.filter((s) => s.split === 'test').length },
      photos: this.scenes.reduce((n, s) => n + s.photoIds.length, 0), gatedPhotos: this.scenes.reduce((n, s) => n + s.observation.gated.length, 0),
      skippedChoices: this.choices.filter((c) => c.target === null).length, consistencyRepeats: repeats.length,
      repeatedChoiceAgreement: repeats.length ? repeats.filter(Boolean).length / repeats.length : null,
      curve, caveats: ['Single participant and purpose; do not generalize to other users.',
        'The subtle subset is defined by observed VLM scores, not verified physical similarity.',
        'Cluster bootstrap is exploratory and needs several independent capture sessions.',
        'Face-crop ablations and Top-k accuracy are not measured in this pilot.',
        'Current-main counter and new ranker receive the same fixed-anchor VLM observations.'] };
  }
}
