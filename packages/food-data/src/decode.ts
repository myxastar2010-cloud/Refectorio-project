/**
 * The food-core chunk as typed items for menu-core (ADR 0015): validated once on load, nutrients as named vectors,
 * ingredient indices resolved.
 */
import type { AllergenCode } from '@refectorio/nutrition-core';
import { fromArray, NUTRIENT_KEYS, per100g, type NutrientVector } from './nutrients';
import {
  foodCoreSchema,
  type FishMercury,
  type ItemFlag,
  type Role,
  type TasteFeatures,
} from './schema';

export type FoodItem = {
  readonly id: string;
  readonly role: Role;
  readonly mealTypes: readonly ('breakfast' | 'lunch' | 'dinner' | 'snack')[];
  readonly allergens: readonly AllergenCode[];
  readonly servingAllergens: readonly AllergenCode[];
  /** Cross-contact traces of bought ingredients: only a severe allergy excludes by them. */
  readonly traces: readonly AllergenCode[];
  readonly flags: ReadonlySet<ItemFlag>;
  readonly fishMercury: FishMercury | null;
  readonly portion: {
    readonly grams: number;
    readonly ml: number | null;
    readonly pieces: number | null;
  };
  readonly cookMin: number;
  readonly perPortion: NutrientVector;
  readonly per100g: NutrientVector;
  readonly ingredients: readonly {
    readonly id: string;
    readonly nameRu: string;
    readonly g: number;
  }[];
  /** Taste features of an item outside the game; the game dishes use the taste-core catalog. */
  readonly taste: TasteFeatures | null;
};

export function decodeFoodCore(json: unknown): {
  version: string;
  catalogVersion: string;
  items: FoodItem[];
} {
  const file = foodCoreSchema.parse(json);
  if (file.nutrients.join() !== NUTRIENT_KEYS.join())
    throw new Error('food-core: the nutrient order differs from this build');
  const items = file.items.map((item): FoodItem => {
    const perPortion = fromArray(item.n);
    const [grams, ml, pieces] = item.p;
    return {
      id: item.id,
      role: item.r,
      mealTypes: item.m,
      allergens: item.a,
      servingAllergens: item.sa,
      traces: item.tr,
      flags: new Set(item.f),
      fishMercury: item.hg,
      portion: { grams, ml, pieces },
      cookMin: item.t,
      perPortion,
      per100g: per100g(perPortion, grams),
      ingredients: item.i.map(([index, g]) => {
        const row = file.ingredients[index];
        if (!row) throw new Error(`food-core: ${item.id} refers to ingredient #${index}`);
        return { id: row[0], nameRu: row[1], g };
      }),
      taste: item.x ?? null,
    };
  });
  return { version: file.version, catalogVersion: file.catalogVersion, items };
}
