/**
 * The engine's view of the food data: every food-core item with its taste features (the taste-core catalog for game
 * dishes, food-core for the others), categories, food-group grams per portion and the portions it may take.
 */
import {
  decodeFoodCore,
  type FoodItem,
  type FoodTextFile,
  type NutrientVector,
  type Role,
  type TasteFeatures,
} from '@refectorio/food-data';
import type { Catalog, FeatureSource } from '@refectorio/taste-core';
import { rule } from './rules';
import { ingredientCategories, withAncestors, type CategoryId } from './taxonomy';
import type { Portion } from './types';

export type Protein = TasteFeatures['proteins'][number];

/** Grams per standard portion that the weekly food-group quotas count (research/R17 §1). */
export type GroupGrams = {
  /** Vegetables and fruit without potatoes and juices (WHO 400 g). */
  readonly vegFruitG: number;
  readonly redMeatRawG: number;
  readonly processedMeatG: number;
  readonly poultryG: number;
  readonly fishG: number;
  readonly oilyFishG: number;
  readonly tunaG: number;
  /** Shellfish and molluscs: FDA counts them with fish in pregnancy ('fish and shellfish', R17 E9; review m1). */
  readonly seafoodG: number;
  /** Cooked/canned equivalent (dry legumes × 2.5). */
  readonly legumesG: number;
  readonly wholeGrainG: number;
  /** Dairy servings (rules P.serving.dairy*: a glass of milk or kefir, a slice of cheese, a portion of tvorog). */
  readonly dairyServings: number;
  readonly nutsG: number;
  readonly eggsG: number;
};

export type MenuFood = {
  readonly id: string;
  readonly item: FoodItem;
  readonly role: Role;
  readonly nameRu: string;
  readonly features: FeatureSource;
  readonly mainProtein: Protein;
  readonly cuisine: string | null;
  /** A main without its own starch (cutlets, baked salmon): lunch and dinner add a side. */
  readonly needsSide: boolean;
  readonly categories: ReadonlySet<CategoryId>;
  readonly groups: GroupGrams;
  readonly fried: boolean;
  /** Portions it may take; the first is the standard one (factor 1). */
  readonly portions: readonly Portion[];
  readonly caffeineMg: number;
  /** Water is tracked by glasses, never planned as a dish. */
  readonly trackedSeparately: boolean;
};

export type FoodIndex = {
  readonly version: string;
  readonly foods: readonly MenuFood[];
  readonly byId: ReadonlyMap<string, MenuFood>;
};

const WATER_ID = 'd_water';

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** The portion grid of an item (ТЗ фаза 3 §1): factors, whole pieces or drink volumes. */
export function portionGrid(item: FoodItem, fixed: boolean): Portion[] {
  const { pieces, ml } = item.portion;
  const standard: Portion =
    item.role === 'drink' && ml !== null
      ? { kind: 'volume', factor: 1, ml }
      : pieces !== null && pieces >= 2
        ? { kind: 'pieces', factor: 1, pieces }
        : { kind: 'factor', factor: 1 };
  if (fixed) return [standard];
  const out: Portion[] = [standard];
  if (item.role === 'drink') {
    if (ml === null || ml < rule('P.drinkVolumeMinMl') * 0.75) return out;
    const step = rule('P.drinkVolumeStepMl');
    for (let v = rule('P.drinkVolumeMinMl'); v <= rule('P.drinkVolumeMaxMl'); v += step) {
      if (v !== ml) out.push({ kind: 'volume', factor: round4(v / ml), ml: v });
    }
  } else if (pieces !== null && pieces >= 2) {
    const lo = Math.ceil(pieces * rule('P.portionFactorMin') - 1e-9);
    const hi = Math.floor(pieces * rule('P.portionFactorMax') + 1e-9);
    for (let k = Math.max(1, lo); k <= hi; k += 1) {
      if (k !== pieces) out.push({ kind: 'pieces', factor: round4(k / pieces), pieces: k });
    }
  } else if (item.role === 'fruit') {
    out.push({ kind: 'pieces', factor: 2, pieces: 2 * (pieces ?? 1) });
  } else {
    const step = rule('P.portionFactorStep');
    for (let f = rule('P.portionFactorMin'); f <= rule('P.portionFactorMax') + 1e-9; f += step) {
      const factor = round4(f);
      if (factor !== 1) out.push({ kind: 'factor', factor });
    }
  }
  return [standard, ...out.slice(1).sort((a, b) => a.factor - b.factor)];
}

function groupGrams(
  ingredients: FoodItem['ingredients'],
  categoriesOf: (index: number) => ReadonlySet<CategoryId>,
): GroupGrams {
  const g = {
    vegFruitG: 0,
    redMeatRawG: 0,
    processedMeatG: 0,
    poultryG: 0,
    fishG: 0,
    oilyFishG: 0,
    tunaG: 0,
    legumesG: 0,
    wholeGrainG: 0,
    dairyServings: 0,
    nutsG: 0,
    eggsG: 0,
    seafoodG: 0,
  };
  ingredients.forEach((ingredient, index) => {
    const c = categoriesOf(index);
    const grams = ingredient.g;
    const isSauceOrBroth = c.has('sauces') || c.has('meatBroth');
    if ((c.has('vegetables') || c.has('fruit')) && !c.has('potatoes')) g.vegFruitG += grams;
    if (c.has('redMeat') && !c.has('processedMeat') && !isSauceOrBroth) g.redMeatRawG += grams;
    if (c.has('processedMeat')) g.processedMeatG += grams;
    if (c.has('poultry') && !isSauceOrBroth) g.poultryG += grams;
    if (c.has('fish') && !isSauceOrBroth) {
      g.fishG += grams;
      if (c.has('oilyFish')) g.oilyFishG += grams;
      if (c.has('tuna')) g.tunaG += grams;
    }
    if (c.has('seafood') && !isSauceOrBroth) g.seafoodG += grams;
    if (c.has('legumes')) {
      g.legumesG += /сух/.test(ingredient.nameRu) ? grams * rule('P.dryLegumeToCooked') : grams;
    }
    if (c.has('wholeGrain')) g.wholeGrainG += grams;
    if (c.has('milk') || c.has('fermentedDairy'))
      g.dairyServings += grams / rule('P.serving.dairyLiquidG');
    if (c.has('cheese')) g.dairyServings += grams / rule('P.serving.dairyCheeseG');
    if (c.has('tvorog')) g.dairyServings += grams / rule('P.serving.dairyTvorogG');
    if (c.has('nuts') || c.has('seeds')) g.nutsG += grams;
    if (c.has('eggs')) g.eggsG += grams;
  });
  return g;
}

function itemCategories(
  item: FoodItem,
  features: FeatureSource,
  nameRu: string,
  fromIngredients: Iterable<CategoryId>,
): Set<CategoryId> {
  const out = new Set<CategoryId>();
  const add = (id: CategoryId) => {
    for (const c of withAncestors(id)) out.add(c);
  };
  for (const id of fromIngredients) add(id);
  const roleCategory: Partial<Record<Role, CategoryId>> = {
    soup: 'soup',
    salad: 'salad',
    dessert: 'dessert',
    side: 'side',
    drink: 'drink',
    snack: 'snackItem',
    fruit: 'fruit',
    bread: 'bread',
  };
  const fromRole = roleCategory[item.role];
  if (fromRole) add(fromRole);
  if (item.role === 'dairy') add('dairy');
  if (/каша|овсянк/i.test(nameRu)) add('porridge');
  if (
    features.course === 'baking' ||
    (features.carbBase === 'dough' && features.cookingMethods.includes('baked'))
  )
    add('baking');
  if (features.cookingMethods.some((m) => m === 'fried' || m === 'deepFried')) add('fried');
  if (features.traits.spiciness >= rule('P.spicyTrait')) add('spicy');
  if (item.flags.has('boxable')) add('lunchBox');
  if (item.cookMin <= rule('P.quickMaxMin')) add('quick');
  if (item.flags.has('vegetarian')) add('vegetarian');
  if (item.flags.has('vegan')) add('vegan');
  if (item.flags.has('alcohol')) add('alcohol');
  if (!item.allergens.includes('GLUTEN') && !item.traces.includes('GLUTEN')) add('glutenFree');
  const protein = item.perPortion.proteinG ?? 0;
  const energy = item.perPortion.energyKcal ?? 0;
  if (
    protein >= rule('P.highProteinMinG') &&
    energy > 0 &&
    (protein * 4) / energy >= rule('P.highProteinShare')
  )
    add('highProtein');
  return out;
}

function toFeatures(item: FoodItem, dish: Catalog['dishes'][number] | undefined): FeatureSource {
  if (dish) return dish;
  const taste = item.taste;
  if (!taste) throw new Error(`food-core: ${item.id} has neither catalog nor own taste features`);
  return { ...taste, allergens: [...item.allergens], extras: taste.extras ?? [] };
}

export type FoodIndexInput = {
  /** The food-core chunk as loaded (validated here). */
  readonly foodCore: unknown;
  /** The taste-core catalog (taste features of the game dishes). */
  readonly catalog: Catalog;
  /** Names for search and texts; ids stand in when absent. */
  readonly foodText?: FoodTextFile;
};

export function buildFoodIndex(input: FoodIndexInput): FoodIndex {
  const decoded = decodeFoodCore(input.foodCore);
  const dishes = new Map(input.catalog.dishes.map((d) => [d.id, d]));
  const categoryCache = new Map<string, ReadonlySet<CategoryId>>();
  const categoriesOfIngredient = (ingredient: FoodItem['ingredients'][number]) => {
    let found = categoryCache.get(ingredient.id);
    if (!found) {
      const own = ingredientCategories({ nameRu: ingredient.nameRu, group: ingredient.group });
      found = new Set(own.flatMap(withAncestors));
      categoryCache.set(ingredient.id, found);
    }
    return found;
  };
  const foods = decoded.items.map((item): MenuFood => {
    const features = toFeatures(item, dishes.get(item.id));
    const nameRu = input.foodText?.items[item.id]?.[0] ?? dishes.get(item.id)?.nameRu ?? item.id;
    const perIngredient = item.ingredients.map(categoriesOfIngredient);
    const categories = itemCategories(
      item,
      features,
      nameRu,
      perIngredient.flatMap((s) => [...s]),
    );
    const mainProtein = features.proteins[0] ?? 'none';
    return {
      id: item.id,
      item,
      role: item.role,
      nameRu,
      features,
      mainProtein,
      cuisine: features.cuisine ?? null,
      // Breakfast dishes (syrniki, shakshuka) take bread, not a side, even at lunch.
      needsSide:
        item.role === 'main' && features.carbBase === 'none' && features.course !== 'breakfast',
      categories,
      groups: groupGrams(item.ingredients, (i) => perIngredient[i] ?? new Set()),
      fried: categories.has('fried'),
      portions: portionGrid(item, false),
      caffeineMg: item.perPortion.caffeineMg ?? 0,
      trackedSeparately: item.id === WATER_ID,
    };
  });
  return { version: decoded.version, foods, byId: new Map(foods.map((f) => [f.id, f])) };
}

/** Nutrients of a portion: the standard portion's vector times the factor (unknown stays unknown). */
export function scaleNutrients(perPortion: NutrientVector, factor: number): NutrientVector {
  const out = {} as Record<keyof NutrientVector, number | null>;
  for (const key of Object.keys(perPortion) as (keyof NutrientVector)[]) {
    const value = perPortion[key];
    out[key] = value === null ? null : value * factor;
  }
  return out;
}
