import catalogJson from '../data/catalog.json';
import { catalogSchema } from '../src/catalog';
import { prepareCatalog } from '../src/engine';
import { clonePosterior, likeProbability, update } from '../src/model';
import { sigmoid } from '../src/stats';
import { createRandom } from '../src/random';
import { createPopulation, likeChance, type NoiseLevel } from './generative';
import { auc, summarize } from './metrics';
import { testSet } from './simulate';

/**
 * Diagnostics of the simulation (not part of the acceptance): how much could the model learn at all?
 *   - prior: no answers;
 *   - oracle-φ: the model fed with the true preference of EVERY training dish (noise-free) — the ceiling of what
 *     the features can express;
 *   - test–retest: the agreement of two answers of the same player to the same dish (realism of the answer noise,
 *     R15 §8: 64–84 %).
 */
const prepared = prepareCatalog(catalogSchema.parse(catalogJson));
const users = createPopulation(
  prepared.dishes,
  Number(process.argv[2] ?? '300'),
  20261009,
  (process.argv[3] ?? 'base') as NoiseLevel,
);
const prior: number[] = [];
const oracle: number[] = [];
const oracleNoisy: number[] = [];
const agreement: number[] = [];
const likeRate: number[] = [];
const random = createRandom(5);
for (const user of users) {
  const test = testSet(prepared, user.id, 20261009);
  const testIdx = [...test];
  const labels = testIdx.map((i) => (user.utility[i] ?? 0) > 0);
  const predict = (p: ReturnType<typeof clonePosterior>) =>
    testIdx.map((i) => likeProbability(p, prepared.vectors[i] ?? { index: [], value: [] }));
  prior.push(auc(predict(prepared.prior), labels));
  const p = clonePosterior(prepared.prior);
  const q = clonePosterior(prepared.prior);
  prepared.dishes.forEach((_, i) => {
    if (test.has(i)) return;
    const vector = prepared.vectors[i];
    if (!vector) return;
    update(p, vector, (user.utility[i] ?? 0) > 0);
    update(q, vector, random.next() < likeChance(user, i));
  });
  oracle.push(auc(predict(p), labels));
  oracleNoisy.push(auc(predict(q), labels));
  let same = 0;
  let likes = 0;
  prepared.dishes.forEach((_, i) => {
    const chance = likeChance(user, i);
    same += chance * chance + (1 - chance) * (1 - chance);
    likes += sigmoid((user.utility[i] ?? 0) / user.temperature);
  });
  agreement.push(same / prepared.dishes.length);
  likeRate.push(likes / prepared.dishes.length);
}
const show = (name: string, values: number[]) => {
  const s = summarize(values);
  console.log(`${name}: ${s.mean.toFixed(3)} [${s.low.toFixed(3)}; ${s.high.toFixed(3)}]`);
};
show('AUC prior (k = 0)', prior);
show('AUC oracle-φ, all ~120 training dishes, true labels', oracle);
show('AUC oracle-φ, all training dishes, noisy answers', oracleNoisy);
show('test–retest agreement', agreement);
show('share of dishes liked', likeRate);

const components = ['quality', 'archetype', 'personal', 'hidden', 'noise'] as const;
for (const c of components)
  show(
    `variance: ${c}`,
    users.map((u) => u.variance[c]),
  );
