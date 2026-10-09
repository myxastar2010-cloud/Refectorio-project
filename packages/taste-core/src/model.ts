import { BIAS, HAS_FISH, HAS_MEAT, type FeatureSpace, type SparseVector } from './features';
import { logit, millsRatio, PROBIT_LAMBDA, predictiveProbability } from './stats';

/**
 * Bayesian logistic taste model: P(like | dish) = σ(wᵀφ(dish)), w ~ N(μ, Σ).
 *
 * Prior: population means (popular and familiar dishes are liked more often) and a structured covariance — besides
 * its own variance every feature shares random effects with its group (all meats, red meats, fish and seafood,
 * sweets, spicy, East Asian cuisines…), so one answer about pork moves the belief about beef and lamb too.
 * Update: assumed-density filtering with the probit approximation of the logistic link — closed form, O(k²) per
 * answer (Minka 2001; MacKay 1992). Research and alternatives: research/R15-taste-elicitation.md.
 */

export type GroupTerm = {
  readonly name: string;
  /** Shared standard deviation of the group effect. */
  readonly sd: number;
  /** Member features and their loadings (−1 for a feature that moves the other way, e.g. richness in «light»). */
  readonly members: readonly (readonly [featureId: string, loading: number])[];
};

export type PriorConfig = {
  /** Share of catalog dishes an average person likes (sets the bias). */
  readonly baseLikeRate: number;
  readonly means: Readonly<Record<string, number>>;
  /** Prior SD by feature id prefix (`cuisine:`) or exact id; the longest match wins. */
  readonly sds: Readonly<Record<string, number>>;
  readonly groups: readonly GroupTerm[];
};

const all = (ids: readonly string[], loading = 1) => ids.map((id) => [id, loading] as const);

/**
 * Engineering prior (R15 §9): means from population liking, the relative SDs and the group structure from how tastes
 * plausibly co-vary. The overall scale (feature SDs ×0.6 and group SDs ×0.3 of the first draft) was chosen in the
 * simulation on a tuning population (seed 11) and checked on a separate evaluation population (D-035): with answers
 * as noisy as people's (R15 §8.3) a wider prior made every strategy learn worse — it chased the noise.
 */
export const DEFAULT_PRIOR: PriorConfig = {
  baseLikeRate: 0.6,
  means: {
    // A dish liked by 80 % of people (popularity 0.8 → +0.6 centred) gets ≈ +0.75 logit.
    'trait:popularity': 1.25,
    'trait:familiarity': 0.35,
  },
  sds: {
    [BIAS]: 0.36,
    'trait:popularity': 0.21,
    'trait:familiarity': 0.3,
    'trait:richness': 0.36,
    'trait:spiciness': 0.48,
    'trait:sweetness': 0.42,
    'trait:vegShare': 0.36,
    [HAS_MEAT]: 0.48,
    [HAS_FISH]: 0.48,
    'course:': 0.27,
    'cuisine:': 0.3,
    'protein:': 0.33,
    'method:': 0.21,
    'carb:': 0.21,
    'flavour:': 0.24,
    'texture:': 0.18,
  },
  groups: [
    {
      name: 'meat',
      sd: 0.33,
      members: all([HAS_MEAT, 'protein:beef', 'protein:pork', 'protein:lamb', 'protein:poultry']),
    },
    { name: 'redMeat', sd: 0.15, members: all(['protein:beef', 'protein:pork', 'protein:lamb']) },
    { name: 'sea', sd: 0.3, members: all([HAS_FISH, 'protein:fish', 'protein:seafood']) },
    {
      name: 'animal',
      sd: 0.11,
      members: all([HAS_MEAT, HAS_FISH, 'protein:eggs', 'protein:dairy']),
    },
    { name: 'plantProtein', sd: 0.15, members: all(['protein:legumes', 'protein:tofu']) },
    {
      name: 'sweet',
      sd: 0.21,
      members: all(['course:dessert', 'course:baking', 'flavour:sweet', 'trait:sweetness']),
    },
    {
      name: 'spicy',
      sd: 0.21,
      members: all([
        'flavour:spicy',
        'trait:spiciness',
        'cuisine:korean',
        'cuisine:indian',
        'cuisine:southeastAsian',
        'cuisine:mexican',
      ]),
    },
    {
      name: 'eastAsian',
      sd: 0.18,
      members: all([
        'cuisine:japanese',
        'cuisine:chinese',
        'cuisine:korean',
        'cuisine:southeastAsian',
        'carb:noodles',
      ]),
    },
    {
      name: 'caucasus',
      sd: 0.15,
      members: all(['cuisine:caucasian', 'cuisine:centralAsian', 'cuisine:middleEastern']),
    },
    { name: 'slavic', sd: 0.15, members: all(['cuisine:russian', 'cuisine:eastEuropean']) },
    {
      name: 'western',
      sd: 0.12,
      members: all([
        'cuisine:italian',
        'cuisine:french',
        'cuisine:european',
        'cuisine:mediterranean',
        'cuisine:american',
      ]),
    },
    {
      name: 'light',
      sd: 0.15,
      members: [
        ['trait:vegShare', 1],
        ['course:salad', 1],
        ['method:raw', 1],
        ['method:steamed', 1],
        ['trait:richness', -1],
      ],
    },
    {
      name: 'fried',
      sd: 0.15,
      members: all(['method:fried', 'method:deepFried', 'trait:richness', 'texture:crispy']),
    },
    {
      name: 'dough',
      sd: 0.12,
      members: all(['carb:dough', 'carb:bread', 'carb:pasta', 'course:baking']),
    },
  ],
};

export type Posterior = {
  readonly size: number;
  /** Mean of w. */
  readonly mean: Float64Array;
  /** Covariance of w, row-major k×k. */
  readonly cov: Float64Array;
};

function priorSd(id: string, sds: PriorConfig['sds']): number {
  let best = -1;
  let sd = 0.3;
  for (const [key, value] of Object.entries(sds)) {
    const matches = key.endsWith(':') ? id.startsWith(key) : id === key;
    if (matches && key.length > best) {
      best = key.length;
      sd = value;
    }
  }
  return sd;
}

export function priorPosterior(
  space: FeatureSpace,
  config: PriorConfig = DEFAULT_PRIOR,
): Posterior {
  const k = space.size;
  const mean = new Float64Array(k);
  const cov = new Float64Array(k * k);
  space.ids.forEach((id, i) => {
    mean[i] = config.means[id] ?? 0;
    const sd = priorSd(id, config.sds);
    cov[i * k + i] = sd * sd;
  });
  const bias = space.indexOf.get(BIAS);
  if (bias !== undefined) mean[bias] = logit(config.baseLikeRate);
  for (const group of config.groups) {
    const members = group.members.flatMap(([id, loading]) => {
      const index = space.indexOf.get(id);
      return index === undefined ? [] : [[index, loading] as const];
    });
    const variance = group.sd * group.sd;
    for (const [i, li] of members) {
      for (const [j, lj] of members) cov[i * k + j] = (cov[i * k + j] ?? 0) + variance * li * lj;
    }
  }
  return { size: k, mean, cov };
}

export function clonePosterior(p: Posterior): Posterior {
  return { size: p.size, mean: new Float64Array(p.mean), cov: new Float64Array(p.cov) };
}

/** Latent utility f = wᵀφ: its mean and variance under the posterior (sparse φ: O(nnz²)). */
export function latent(p: Posterior, x: SparseVector): { mean: number; variance: number } {
  const k = p.size;
  let mean = 0;
  let variance = 0;
  const n = x.index.length;
  for (let a = 0; a < n; a += 1) {
    const i = x.index[a] ?? 0;
    const xi = x.value[a] ?? 0;
    mean += (p.mean[i] ?? 0) * xi;
    for (let b = 0; b < n; b += 1) {
      variance += xi * (x.value[b] ?? 0) * (p.cov[i * k + (x.index[b] ?? 0)] ?? 0);
    }
  }
  return { mean, variance: Math.max(variance, 0) };
}

export const likeProbability = (p: Posterior, x: SparseVector): number => {
  const f = latent(p, x);
  return predictiveProbability(f.mean, f.variance);
};

/**
 * One answer (like = +1, dislike = −1): moment-matched Gaussian update of w under σ(y·wᵀφ) ≈ Φ(λ·y·wᵀφ).
 * Mutates the posterior in place.
 */
export function update(p: Posterior, x: SparseVector, like: boolean): void {
  const k = p.size;
  const y = like ? 1 : -1;
  // Σφ — only the columns of the non-zero features are needed.
  const s = new Float64Array(k);
  const n = x.index.length;
  for (let a = 0; a < n; a += 1) {
    const j = x.index[a] ?? 0;
    const xj = x.value[a] ?? 0;
    for (let i = 0; i < k; i += 1) s[i] = (s[i] ?? 0) + (p.cov[i * k + j] ?? 0) * xj;
  }
  let mean = 0;
  let variance = 0;
  for (let a = 0; a < n; a += 1) {
    const j = x.index[a] ?? 0;
    const xj = x.value[a] ?? 0;
    mean += (p.mean[j] ?? 0) * xj;
    variance += (s[j] ?? 0) * xj;
  }
  const m = PROBIT_LAMBDA * mean;
  const v = PROBIT_LAMBDA * PROBIT_LAMBDA * Math.max(variance, 0);
  const root = Math.sqrt(1 + v);
  const z = (y * m) / root;
  const alpha = (y * millsRatio(z)) / root;
  const gamma = alpha * alpha + (alpha * m) / (1 + v);
  const meanStep = PROBIT_LAMBDA * alpha;
  const covStep = PROBIT_LAMBDA * PROBIT_LAMBDA * gamma;
  for (let i = 0; i < k; i += 1) {
    const si = s[i] ?? 0;
    p.mean[i] = (p.mean[i] ?? 0) + meanStep * si;
    if (si === 0) continue;
    for (let j = 0; j < k; j += 1) {
      p.cov[i * k + j] = (p.cov[i * k + j] ?? 0) - covStep * si * (s[j] ?? 0);
    }
  }
}
