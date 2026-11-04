/**
 * What the menu page shows about an item (ТЗ фаза 4 §7–§8): names and texts, allergens and traces, the standard
 * portion, nutrients per 100 g and the ingredients of one standard portion — plain JSON, sent once from the worker so
 * the page never loads the food data itself. Numbers are the data's own (USDA SR Legacy, recipe calculation).
 */
import type { FoodTextFile, NutrientVector, Role } from '@refectorio/food-data';
import type { AllergenCode } from '@refectorio/nutrition-core';
import type { FoodIndex } from './foods';

export type ItemView = {
  readonly id: string;
  readonly nameRu: string;
  /** How it is counted in a sentence («тарелка каши»). */
  readonly unitRu: string;
  readonly descriptionRu: string;
  readonly role: Role;
  readonly cuisine: string | null;
  readonly allergens: readonly AllergenCode[];
  /** Allergens of serving add-ons that can be left out (nuts on porridge). */
  readonly servingAllergens: readonly AllergenCode[];
  readonly traces: readonly AllergenCode[];
  readonly flags: readonly string[];
  readonly portion: {
    readonly grams: number;
    readonly ml: number | null;
    readonly pieces: number | null;
  };
  readonly cookMin: number;
  readonly per100g: NutrientVector;
  /** Grams of each ingredient in one standard portion. */
  readonly ingredients: readonly {
    readonly id: string;
    readonly nameRu: string;
    readonly g: number;
  }[];
};

export function catalogView(foods: FoodIndex, texts: FoodTextFile): ItemView[] {
  return foods.foods.map((food) => {
    const [nameRu, unitRu, descriptionRu] = texts.items[food.id] ?? [food.nameRu, '', ''];
    const { item } = food;
    return {
      id: food.id,
      nameRu,
      unitRu,
      descriptionRu,
      role: food.role,
      cuisine: food.cuisine,
      allergens: item.allergens,
      servingAllergens: item.servingAllergens,
      traces: item.traces,
      flags: [...item.flags],
      portion: item.portion,
      cookMin: item.cookMin,
      per100g: item.per100g,
      ingredients: item.ingredients.map(({ id, nameRu: name, g }) => ({ id, nameRu: name, g })),
    };
  });
}
