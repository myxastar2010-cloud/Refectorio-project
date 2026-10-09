import { dietFlags, type Dish } from './catalog';

/**
 * φ(dish): the dish as a sparse feature vector. Categories are one-hot or multi-hot (namespaced ids such as
 * `cuisine:italian`), numeric traits are centred to [−1, 1], plus a bias and two diet indicators that carry most of
 * the «I don't eat meat / fish» signal.
 */

export type SparseVector = { readonly index: readonly number[]; readonly value: readonly number[] };

export type FeatureSpace = {
  readonly ids: readonly string[];
  readonly indexOf: ReadonlyMap<string, number>;
  readonly size: number;
};

export const BIAS = 'bias';
export const HAS_MEAT = 'has:meat';
export const HAS_FISH = 'has:fish';
export const TRAIT_FEATURES = [
  'trait:richness',
  'trait:spiciness',
  'trait:sweetness',
  'trait:vegShare',
  'trait:familiarity',
  'trait:popularity',
] as const;

/** Raw (feature id, weight) pairs of one dish before it is mapped onto a feature space. */
export function dishFeatures(dish: Dish): [string, number][] {
  const pairs: [string, number][] = [[BIAS, 1]];
  pairs.push([`course:${dish.course}`, 1]);
  pairs.push([`cuisine:${dish.cuisine}`, 1]);
  pairs.push([`carb:${dish.carbBase}`, 1]);
  // The main protein counts fully, side proteins half: a vegetarian still sees the meat in a fish soup on meat broth.
  dish.proteins.forEach((protein, order) => {
    pairs.push([`protein:${protein}`, order === 0 ? 1 : 0.5]);
  });
  // Multi-tag fields are scaled by 1/√n: four flavours together weigh as much as two strong ones.
  const tags = (prefix: string, values: readonly string[]) => {
    const weight = 1 / Math.sqrt(Math.max(1, values.length));
    for (const value of values) pairs.push([`${prefix}:${value}`, weight]);
  };
  tags('method', dish.cookingMethods);
  tags('flavour', dish.flavours);
  tags('texture', dish.textures);
  const centred = (value: number) => (value - 0.5) * 2;
  const t = dish.traits;
  pairs.push(['trait:richness', centred(t.richness)]);
  pairs.push(['trait:spiciness', centred(t.spiciness)]);
  pairs.push(['trait:sweetness', centred(t.sweetness)]);
  pairs.push(['trait:vegShare', centred(t.vegShare)]);
  pairs.push(['trait:familiarity', centred(t.familiarityRu)]);
  pairs.push(['trait:popularity', centred(t.popularityRu)]);
  const flags = dietFlags(dish);
  if (flags.meat) pairs.push([HAS_MEAT, 1]);
  if (flags.fish || flags.seafood) pairs.push([HAS_FISH, 1]);
  return pairs;
}

/** Every feature id used by the dishes, in a stable order (bias, diet flags, traits, then categories A→Z). */
export function buildFeatureSpace(dishes: readonly Dish[]): FeatureSpace {
  const categories = new Set<string>();
  for (const dish of dishes) {
    for (const [id] of dishFeatures(dish)) categories.add(id);
  }
  const fixed = [BIAS, HAS_MEAT, HAS_FISH, ...TRAIT_FEATURES];
  for (const id of fixed) categories.delete(id);
  const ids = [...fixed, ...[...categories].sort()];
  return { ids, indexOf: new Map(ids.map((id, index) => [id, index])), size: ids.length };
}

export function encode(dish: Dish, space: FeatureSpace): SparseVector {
  const merged = new Map<number, number>();
  for (const [id, weight] of dishFeatures(dish)) {
    const index = space.indexOf.get(id);
    if (index === undefined || weight === 0) continue;
    merged.set(index, (merged.get(index) ?? 0) + weight);
  }
  const index = [...merged.keys()].sort((a, b) => a - b);
  return { index, value: index.map((i) => merged.get(i) ?? 0) };
}

/** Cosine similarity of the category part (bias and traits left out): near-duplicate detection. */
export function categorySimilarity(a: SparseVector, b: SparseVector, space: FeatureSpace): number {
  const categorical = (i: number) => {
    const id = space.ids[i] ?? '';
    return id !== BIAS && !id.startsWith('trait:');
  };
  const map = new Map<number, number>();
  let normA = 0;
  a.index.forEach((i, k) => {
    if (!categorical(i)) return;
    const v = a.value[k] ?? 0;
    map.set(i, v);
    normA += v * v;
  });
  let normB = 0;
  let dot = 0;
  b.index.forEach((i, k) => {
    if (!categorical(i)) return;
    const v = b.value[k] ?? 0;
    normB += v * v;
    dot += v * (map.get(i) ?? 0);
  });
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}
