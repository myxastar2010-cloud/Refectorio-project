import {
  decisiveCount,
  type TasteDecision,
  type TasteHint,
  type TasteProfileV1,
} from '@refectorio/contracts';
import { dietFlags, type CUISINES, type Dish } from './catalog';
import type { FeatureSpace, SparseVector } from './features';
import { likeProbability, type Posterior } from './model';
import { normalCdf } from './stats';

export const ENGINE_VERSION = 'taste-core@1.0.0';

const EAST_ASIAN = new Set<(typeof CUISINES)[number]>([
  'japanese',
  'chinese',
  'korean',
  'southeastAsian',
]);

type HintRule = {
  readonly hint: TasteHint;
  readonly members: (dish: Dish) => boolean;
  /** avoids: the typical dish of the group is disliked; likes: liked clearly more than the person's average. */
  readonly kind: 'avoids' | 'likes';
};

/** Plain-language conclusions; the quiz shows likes* in «Запомнили: …» and uses avoidsMeat/avoidsFish to hint. */
export const HINT_RULES: readonly HintRule[] = [
  { hint: 'avoidsMeat', kind: 'avoids', members: (d) => dietFlags(d).meat },
  { hint: 'avoidsFish', kind: 'avoids', members: (d) => d.proteins.includes('fish') },
  { hint: 'avoidsSeafood', kind: 'avoids', members: (d) => d.proteins.includes('seafood') },
  { hint: 'likesMeat', kind: 'likes', members: (d) => dietFlags(d).meat },
  { hint: 'likesFish', kind: 'likes', members: (d) => d.proteins.includes('fish') },
  { hint: 'likesSoups', kind: 'likes', members: (d) => d.course === 'soup' },
  { hint: 'likesVegetables', kind: 'likes', members: (d) => d.traits.vegShare >= 0.6 },
  { hint: 'likesSpicy', kind: 'likes', members: (d) => d.traits.spiciness >= 0.5 },
  { hint: 'avoidsSpicy', kind: 'avoids', members: (d) => d.traits.spiciness >= 0.5 },
  { hint: 'sweetTooth', kind: 'likes', members: (d) => d.course === 'dessert' },
  { hint: 'likesBaking', kind: 'likes', members: (d) => d.course === 'baking' },
  { hint: 'likesAsian', kind: 'likes', members: (d) => EAST_ASIAN.has(d.cuisine) },
  { hint: 'likesPasta', kind: 'likes', members: (d) => d.carbBase === 'pasta' },
];

export const HINTS = {
  /** A hint is reported when the posterior is at least this sure… */
  minConfidence: 0.85,
  /** …and the person answered this many dishes of the group, mostly in the hint's direction. */
  minAnswers: 2,
  minAgreement: 0.8,
  /** «likes»: the group's average utility above the person's catalog average by this margin (logit). */
  likesMargin: 0.3,
} as const;

/** Average feature vector of a set of dishes (dense). */
function centroid(vectors: readonly SparseVector[], size: number): Float64Array {
  const sum = new Float64Array(size);
  for (const v of vectors) {
    v.index.forEach((i, k) => {
      sum[i] = (sum[i] ?? 0) + (v.value[k] ?? 0) / vectors.length;
    });
  }
  return sum;
}

function quadratic(p: Posterior, x: Float64Array): { mean: number; variance: number } {
  const k = p.size;
  let mean = 0;
  let variance = 0;
  for (let i = 0; i < k; i += 1) {
    const xi = x[i] ?? 0;
    if (xi === 0) continue;
    mean += (p.mean[i] ?? 0) * xi;
    for (let j = 0; j < k; j += 1) variance += xi * (x[j] ?? 0) * (p.cov[i * k + j] ?? 0);
  }
  return { mean, variance: Math.max(variance, 1e-12) };
}

export type HintEvidence = { readonly hint: TasteHint; readonly confidence: number };

export function tasteHints(
  dishes: readonly Dish[],
  vectors: readonly SparseVector[],
  posterior: Posterior,
  decisions: readonly TasteDecision[],
): HintEvidence[] {
  const allCentroid = centroid(vectors, posterior.size);
  const byId = new Map(dishes.map((dish, index) => [dish.id, index]));
  const result: HintEvidence[] = [];
  for (const rule of HINT_RULES) {
    const members = dishes.flatMap((dish, index) => (rule.members(dish) ? [index] : []));
    if (members.length === 0) continue;
    const answered = decisions.filter((d) => {
      const index = byId.get(d.dishId);
      return d.answer !== 'skip' && index !== undefined && members.includes(index);
    });
    const agreeing = answered.filter((d) => (rule.kind === 'likes') === (d.answer === 'like'));
    if (
      answered.length < HINTS.minAnswers ||
      agreeing.length / answered.length < HINTS.minAgreement
    ) {
      continue;
    }
    const groupCentroid = centroid(
      members.flatMap((i) => (vectors[i] ? [vectors[i]] : [])),
      posterior.size,
    );
    let confidence: number;
    if (rule.kind === 'avoids') {
      const f = quadratic(posterior, groupCentroid);
      confidence = normalCdf(-f.mean / Math.sqrt(f.variance));
    } else {
      const diff = groupCentroid.map((value, i) => value - (allCentroid[i] ?? 0));
      const f = quadratic(posterior, diff);
      confidence = normalCdf((f.mean - HINTS.likesMargin) / Math.sqrt(f.variance));
    }
    if (confidence >= HINTS.minConfidence) {
      result.push({ hint: rule.hint, confidence: Math.round(confidence * 1000) / 1000 });
    }
  }
  return result;
}

export function buildProfile(input: {
  readonly catalogVersion: string;
  readonly seed: number;
  readonly dishes: readonly Dish[];
  readonly vectors: readonly SparseVector[];
  readonly space: FeatureSpace;
  readonly posterior: Posterior;
  readonly decisions: readonly TasteDecision[];
}): TasteProfileV1 {
  const { dishes, vectors, space, posterior, decisions } = input;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    version: 1,
    engineVersion: ENGINE_VERSION,
    catalogVersion: input.catalogVersion,
    seed: input.seed,
    decisions: decisions.map((d) => ({ dishId: d.dishId, answer: d.answer })),
    features: space.ids.map((id, i) => ({
      id,
      mean: round(posterior.mean[i] ?? 0),
      variance: round(posterior.cov[i * space.size + i] ?? 0),
    })),
    predictions: dishes.map((dish, i) => {
      const vector = vectors[i];
      return { dishId: dish.id, pLike: round(vector ? likeProbability(posterior, vector) : 0.5) };
    }),
    hints: decisiveCount(decisions) > 0 ? tasteHints(dishes, vectors, posterior, decisions) : [],
  };
}
