import type { Dish } from './catalog';
import { categorySimilarity, type FeatureSpace, type SparseVector } from './features';
import { latent, type Posterior } from './model';
import { hashUnit } from './random';
import { skipProbability, type SkipBelief } from './skip';
import { bald, entropyBits, millsRatio, PROBIT_LAMBDA, predictiveProbability } from './stats';

/**
 * Which card comes next: the one whose decisive answer would tell us most about the person's taste (BALD — mutual
 * information between the answer and the weights, Houlsby et al. 2011), weighted by the chance of a decisive answer at
 * all, under sequencing rules that keep the game varied and fair (ТЗ §9.3). A one-step lookahead over the whole
 * catalog was tested as well: equally good in the simulation and 50 times costlier, so BALD stays (D-035).
 */
export const SELECTION = {
  /** The first cards each come from a different base type (breakfast, soup, fish…): a broad first impression. */
  warmStartCards: 4,
  /** Two dishes this similar (category cosine) never both appear. */
  nearDuplicate: 0.9,
  /** After this many skips in a row only well-known dishes are offered until a decisive answer. */
  skipStreakForFamiliar: 5,
  familiarFloor: 0.85,
  /** ±share of seeded jitter on the score: people get different, still informative sequences. */
  jitter: 0.12,
} as const;

/**
 * 'ours' — BALD × P(decisive) + rules; 'lookahead' — the catalog lookahead × P(decisive) + rules (tested alternative);
 * the rest are the baselines of the simulation (ТЗ §9.5).
 */
export type Strategy = 'ours' | 'lookahead' | 'uncertainty' | 'random' | 'popularity' | 'coverage';

export type SelectionContext = {
  readonly dishes: readonly Dish[];
  readonly vectors: readonly SparseVector[];
  /** Indices of near-duplicates for every dish (precomputed once per catalog). */
  readonly nearDuplicates: readonly (readonly number[])[];
  readonly posterior: Posterior;
  readonly skipBelief: SkipBelief;
  /** Indices of cards already shown, in order. */
  readonly shown: readonly number[];
  readonly skipStreak: number;
  readonly seed: number;
  /** Dishes never offered (the simulation keeps a held-out test set this way). */
  readonly exclude?: ReadonlySet<number>;
};

export function nearDuplicateLists(
  vectors: readonly SparseVector[],
  space: FeatureSpace,
): number[][] {
  const lists: number[][] = vectors.map(() => []);
  for (let a = 0; a < vectors.length; a += 1) {
    for (let b = a + 1; b < vectors.length; b += 1) {
      const va = vectors[a];
      const vb = vectors[b];
      if (!va || !vb) continue;
      if (categorySimilarity(va, vb, space) >= SELECTION.nearDuplicate) {
        lists[a]?.push(b);
        lists[b]?.push(a);
      }
    }
  }
  return lists;
}

const sameSequenceSlot = (a: Dish, b: Dish) =>
  a.course === b.course || a.cuisine === b.cuisine || a.proteins[0] === b.proteins[0];

const openDishes = (ctx: SelectionContext) => {
  const shown = new Set(ctx.shown);
  return ctx.dishes
    .map((_, index) => index)
    .filter((i) => !shown.has(i) && ctx.exclude?.has(i) !== true);
};

/**
 * Candidates after the rules, most restrictive first; a rule that would leave nothing is dropped (the catalog may
 * run low for a very picky player).
 */
export function candidates(ctx: SelectionContext): number[] {
  const blocked = new Set<number>();
  for (const index of ctx.shown)
    for (const twin of ctx.nearDuplicates[index] ?? []) blocked.add(twin);
  const open = openDishes(ctx);
  if (open.length === 0) return [];

  const lastIndex = ctx.shown.at(-1);
  const last = lastIndex === undefined ? undefined : ctx.dishes[lastIndex];
  const usedBaseTypes = new Set(ctx.shown.map((i) => ctx.dishes[i]?.baseType));
  const rules: ((i: number) => boolean)[] = [];
  if (ctx.skipStreak >= SELECTION.skipStreakForFamiliar) {
    rules.push((i) => (ctx.dishes[i]?.traits.familiarityRu ?? 0) >= SELECTION.familiarFloor);
  }
  if (ctx.shown.length < SELECTION.warmStartCards) {
    rules.push((i) => !usedBaseTypes.has(ctx.dishes[i]?.baseType));
  }
  rules.push((i) => !blocked.has(i));
  if (last) {
    rules.push((i) => {
      const dish = ctx.dishes[i];
      return dish !== undefined && !sameSequenceSlot(dish, last);
    });
  }

  let pool = open;
  for (const rule of rules) {
    const next = pool.filter(rule);
    if (next.length > 0) pool = next;
  }
  return pool;
}

export type Scored = { readonly index: number; readonly score: number };

/** Per-selection cache: every catalog dish's latent mean and variance under the current posterior. */
export type ScoreCache = { readonly dishMean: Float64Array; readonly dishVariance: Float64Array };

export function scoreCache(ctx: SelectionContext): ScoreCache {
  const dishMean = new Float64Array(ctx.vectors.length);
  const dishVariance = new Float64Array(ctx.vectors.length);
  ctx.vectors.forEach((vector, d) => {
    const f = latent(ctx.posterior, vector);
    dishMean[d] = f.mean;
    dishVariance[d] = f.variance;
  });
  return { dishMean, dishVariance };
}

/**
 * The expected drop of the catalog's total predictive entropy after a decisive answer about dish x (an EPIG-style
 * criterion, Bickford Smith et al. 2023: the game needs good predictions for every dish, not the weights as such).
 * One-step lookahead without touching the matrix: after an answer y every dish's latent moves by
 * m_d' = m_d + λα·c_xd, v_d' = v_d − λ²γ·c_xd², with c_xd = φ_dᵀΣφ_x — the same ADF step as model.update.
 * O(k·nnz + n·nnz) per card.
 */
export function lookaheadGain(ctx: SelectionContext, index: number, cache: ScoreCache): number {
  const x = ctx.vectors[index];
  if (!x) return 0;
  const k = ctx.posterior.size;
  const cov = ctx.posterior.cov;
  const sx = new Float64Array(k);
  x.index.forEach((j, a) => {
    const xj = x.value[a] ?? 0;
    for (let i = 0; i < k; i += 1) sx[i] = (sx[i] ?? 0) + (cov[i * k + j] ?? 0) * xj;
  });
  let vx = 0;
  let mx = 0;
  x.index.forEach((j, a) => {
    vx += (sx[j] ?? 0) * (x.value[a] ?? 0);
    mx += (ctx.posterior.mean[j] ?? 0) * (x.value[a] ?? 0);
  });
  const m = PROBIT_LAMBDA * mx;
  const v = PROBIT_LAMBDA * PROBIT_LAMBDA * vx;
  const root = Math.sqrt(1 + v);
  const pLike = predictiveProbability(mx, vx);
  const steps = [1, -1].map((y) => {
    const alpha = (y * millsRatio((y * m) / root)) / root;
    const gamma = alpha * alpha + (alpha * m) / (1 + v);
    return {
      p: y === 1 ? pLike : 1 - pLike,
      meanStep: PROBIT_LAMBDA * alpha,
      varStep: PROBIT_LAMBDA * PROBIT_LAMBDA * gamma,
    };
  });
  let gain = 0;
  ctx.vectors.forEach((vector, d) => {
    let c = 0;
    vector.index.forEach((j, a) => {
      c += (sx[j] ?? 0) * (vector.value[a] ?? 0);
    });
    if (c === 0) return;
    const md = cache.dishMean[d] ?? 0;
    const vd = cache.dishVariance[d] ?? 0;
    let after = 0;
    for (const s of steps) {
      after +=
        s.p *
        entropyBits(
          predictiveProbability(md + s.meanStep * c, Math.max(0, vd - s.varStep * c * c)),
        );
    }
    gain += entropyBits(predictiveProbability(md, vd)) - after;
  });
  return gain;
}

/** Score of one card for a strategy (higher = ask sooner). */
export function score(
  ctx: SelectionContext,
  index: number,
  strategy: Strategy,
  cache?: ScoreCache,
): number {
  const dish = ctx.dishes[index];
  const vector = ctx.vectors[index];
  if (!dish || !vector) return Number.NEGATIVE_INFINITY;
  const step = ctx.shown.length;
  const jitter = 1 + SELECTION.jitter * (2 * hashUnit(ctx.seed, step, dish.id) - 1);
  const decisive = () => 1 - skipProbability(ctx.skipBelief, dish.traits.familiarityRu);
  switch (strategy) {
    case 'ours': {
      const f = latent(ctx.posterior, vector);
      return bald(f.mean, f.variance) * decisive() * jitter;
    }
    case 'lookahead':
      return lookaheadGain(ctx, index, cache ?? scoreCache(ctx)) * decisive() * jitter;
    case 'uncertainty': {
      // Closest to 50/50 under the predictive distribution (no skip awareness, no epistemic split).
      const f = latent(ctx.posterior, vector);
      return (1 - Math.abs(2 * predictiveProbability(f.mean, f.variance) - 1)) * jitter;
    }
    case 'popularity':
      return dish.traits.popularityRu * jitter;
    case 'random':
    case 'coverage':
      return hashUnit(ctx.seed, step, dish.id, strategy);
  }
}

/** The next card's index, or null when the catalog is exhausted. */
export function selectNext(ctx: SelectionContext, strategy: Strategy = 'ours'): number | null {
  let pool: readonly number[];
  if (strategy === 'ours' || strategy === 'lookahead') {
    pool = candidates(ctx);
  } else if (strategy === 'coverage') {
    // Round-robin over base types: the least shown base type first, random dish inside it.
    const counts = new Map<string, number>();
    for (const i of ctx.shown) {
      const type = ctx.dishes[i]?.baseType ?? '';
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    const open = openDishes(ctx);
    const least = Math.min(...open.map((i) => counts.get(ctx.dishes[i]?.baseType ?? '') ?? 0));
    pool = open.filter((i) => (counts.get(ctx.dishes[i]?.baseType ?? '') ?? 0) === least);
  } else {
    pool = openDishes(ctx);
  }
  const cache = strategy === 'lookahead' ? scoreCache(ctx) : undefined;
  let best: Scored | null = null;
  for (const index of pool) {
    const value = score(ctx, index, strategy, cache);
    if (!best || value > best.score) best = { index, score: value };
  }
  return best?.index ?? null;
}
