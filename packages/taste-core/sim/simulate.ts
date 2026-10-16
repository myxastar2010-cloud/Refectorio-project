import { applyAnswer, initialState, nextCard, type PreparedCatalog } from '../src/engine';
import { likeProbability } from '../src/model';
import { createRandom, hashUnit } from '../src/random';
import type { Strategy } from '../src/selection';
import { answerCard, likeChance, type SyntheticUser } from './generative';
import { auc, expectedBrier, ndcgAt } from './metrics';

export const STRATEGIES: readonly Strategy[] = [
  'random',
  'popularity',
  'coverage',
  'uncertainty',
  'lookahead',
  'ours',
];
export const K_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30] as const;
/** Share of the catalog held out per player (never shown, the metrics are measured on it). */
export const TEST_SHARE = 0.35;

export type UserResult = {
  userId: number;
  strategy: Strategy;
  /** Metric value at every K_VALUES entry (NaN when undefined for this player). */
  aucTrue: number[];
  aucAnswers: number[];
  ndcg10: number[];
  brier: number[];
  /** AUC of the true utility against the player's sampled answers on the test set: the ceiling (context). */
  oracleAucAnswers: number;
  coverage10: number;
  skipsTo10: number;
  cardsTo10: number;
  noisy: boolean;
  skipHeavy: boolean;
};

/** Cards a player may see at most (a very picky player stops early: the catalog is exhausted). */
const MAX_CARDS = 90;

export function testSet(prepared: PreparedCatalog, userId: number, seed: number): Set<number> {
  const scored = prepared.dishes.map((dish, index) => ({
    index,
    r: hashUnit(seed, 'test', userId, dish.id),
  }));
  scored.sort((a, b) => a.r - b.r);
  return new Set(
    scored.slice(0, Math.round(prepared.dishes.length * TEST_SHARE)).map((s) => s.index),
  );
}

export function simulateUser(
  prepared: PreparedCatalog,
  user: SyntheticUser,
  strategy: Strategy,
  seed: number,
  hidden: ReadonlySet<number> = new Set(),
): UserResult {
  const test = testSet(prepared, user.id, seed);
  // Never offered: the held-out test set and the dishes the site hides (no photo).
  const exclude = hidden.size > 0 ? new Set([...test, ...hidden]) : test;
  const testIndices = [...test].sort((a, b) => a - b);
  const truthLabels = testIndices.map((i) => (user.utility[i] ?? 0) > 0);
  const truthChance = testIndices.map((i) => likeChance(user, i));
  // Sampled answers on the test set (the same for every strategy: seeded by the player only).
  const answerRandom = createRandom(seed ^ (user.id * 2654435761));
  const answerLabels = truthChance.map((p) => answerRandom.next() < p);
  const oracleAucAnswers = auc(
    testIndices.map((i) => user.utility[i] ?? 0),
    answerLabels,
  );

  const random = createRandom(hashUnit(seed, 'answers', user.id) * 4294967296);
  const sessionSeed = Math.floor(hashUnit(seed, 'session', user.id) * 4294967296);
  let state = initialState(prepared);
  const result: UserResult = {
    userId: user.id,
    strategy,
    aucTrue: [],
    aucAnswers: [],
    ndcg10: [],
    brier: [],
    oracleAucAnswers,
    coverage10: 0,
    skipsTo10: 0,
    cardsTo10: 0,
    noisy: user.noisy,
    skipHeavy: user.skipHeavy,
  };
  const measure = () => {
    const predicted = testIndices.map((i) => {
      const vector = prepared.vectors[i];
      return vector ? likeProbability(state.posterior, vector) : 0.5;
    });
    result.aucTrue.push(auc(predicted, truthLabels));
    result.aucAnswers.push(auc(predicted, answerLabels));
    result.ndcg10.push(ndcgAt(10, predicted, truthLabels));
    result.brier.push(expectedBrier(predicted, truthChance));
  };
  const maxK = K_VALUES[K_VALUES.length - 1] ?? 30;
  let decisive = 0;
  let skips = 0;
  let nextK = 0;
  const lastK = () => K_VALUES[nextK];
  // k = 0: the prior alone (popularity knowledge).
  if (lastK() === 0) {
    measure();
    nextK += 1;
  }
  for (let card = 0; card < MAX_CARDS && decisive < maxK; card += 1) {
    const index = nextCard(prepared, state, sessionSeed, strategy, exclude);
    if (index === null) break;
    const dish = prepared.dishes[index];
    if (!dish) break;
    const answer = answerCard(user, dish, index, random);
    state = applyAnswer(prepared, state, index, answer);
    if (answer === 'skip') {
      if (decisive < 10) skips += 1;
      continue;
    }
    decisive += 1;
    if (decisive === 10) {
      result.cardsTo10 = card + 1;
      result.skipsTo10 = skips;
      const types = new Set(
        state.decisions
          .filter((d) => d.answer !== 'skip')
          .map((d) => prepared.dishes[prepared.indexOf.get(d.dishId) ?? -1]?.baseType),
      );
      result.coverage10 = types.size;
    }
    while (lastK() !== undefined && lastK() === decisive) {
      measure();
      nextK += 1;
    }
  }
  // An exhausted catalog: carry the last measurement forward (the player could answer no more).
  while (nextK < K_VALUES.length) {
    result.aucTrue.push(result.aucTrue.at(-1) ?? Number.NaN);
    result.aucAnswers.push(result.aucAnswers.at(-1) ?? Number.NaN);
    result.ndcg10.push(result.ndcg10.at(-1) ?? Number.NaN);
    result.brier.push(result.brier.at(-1) ?? Number.NaN);
    nextK += 1;
  }
  if (decisive < 10) {
    result.skipsTo10 = skips;
    result.cardsTo10 = MAX_CARDS;
  }
  return result;
}
