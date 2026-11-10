/**
 * Builds a tool environment from the engine's own inputs (the menu worker's state, or Node in evals): the catalog view,
 * the term vocabulary and the search index are derived once per dish data / plan and cached.
 */
import type { FoodTextFile } from '@refectorio/food-data';
import {
  buildSearchIndex,
  catalogView,
  createTermResolver,
  search,
  type FoodIndex,
  type IsoDate,
  type ItemView,
  type MenuProfile,
  type Plan,
  type TermResolver,
  type Tracking,
} from '@refectorio/menu-core';
import type { ToolEnv } from './tools';

type Derived = {
  readonly items: ReadonlyMap<string, ItemView>;
  readonly ingredients: ReadonlyMap<string, string>;
  readonly resolve: TermResolver;
};

const derivedCache = new WeakMap<FoodIndex, Derived>();
let searchCache: { key: string; index: ReturnType<typeof buildSearchIndex> } | null = null;

function derive(foods: FoodIndex, texts: FoodTextFile): Derived {
  const known = derivedCache.get(foods);
  if (known) return known;
  const items = new Map(catalogView(foods, texts).map((v) => [v.id, v] as const));
  const ingredients = new Map<string, string>();
  for (const f of foods.foods) for (const i of f.item.ingredients) ingredients.set(i.id, i.nameRu);
  const resolve = createTermResolver({
    ingredients: [...ingredients].map(([id, nameRu]) => ({ id, nameRu })),
    items: [...items.values()].map((v) => ({ id: v.id, nameRu: v.nameRu })),
  });
  const derived = { items, ingredients, resolve };
  derivedCache.set(foods, derived);
  return derived;
}

export type EnvInput = {
  readonly foods: FoodIndex;
  readonly texts: FoodTextFile;
  readonly profile: MenuProfile;
  readonly plan: Plan;
  readonly tracking: Tracking;
  readonly today: IsoDate;
  readonly answers: unknown;
  readonly nextPreviewId: () => string;
};

export function createToolEnv(input: EnvInput): ToolEnv {
  const { foods, texts, plan } = input;
  const derived = derive(foods, texts);
  return {
    engine: { profile: input.profile, foods },
    foods,
    plan,
    tracking: input.tracking,
    today: input.today,
    answers: input.answers,
    ...derived,
    search: (query) => {
      // The days themselves, not the revision: an undo brings an old revision number back with other days.
      const key = JSON.stringify(plan.days.map((d) => [d.date, d.meals]));
      if (searchCache?.key !== key)
        searchCache = { key, index: buildSearchIndex(plan, foods, texts) };
      return search(searchCache.index, query);
    },
    nextPreviewId: input.nextPreviewId,
  };
}

/** Preview ids unique within a chat: a prefix per session and a counter (deterministic when the prefix is fixed). */
export function previewIdFactory(prefix: string, start = 0): () => string {
  let n = start;
  return () => `${prefix}${(++n).toString(36)}`;
}
