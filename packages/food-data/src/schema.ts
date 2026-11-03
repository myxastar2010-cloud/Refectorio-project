/**
 * The food data contract (ADR 0015). Sources in `data/src/` (written by the build from USDA SR Legacy, the research
 * recipes and the authored facts); the browser chunks `data/food-core.json` (ids, roles, meal types, flags, allergens,
 * portions, nutrition, ingredients, taste features of the items outside the game) and `data/food-text.json` (names,
 * descriptions). One source of truth per field: the 186 game dishes keep names, meal types, allergens and taste
 * features in the taste-core catalog; here they get only what the menu adds.
 */
import { DISH_ID_PATTERN } from '@refectorio/contracts';
import { ALLERGEN_CODES } from '@refectorio/nutrition-core';
import {
  CARB_BASES,
  COOKING_METHODS,
  COURSES,
  CUISINES,
  EXTRAS,
  FLAVOURS,
  MEAL_TYPES,
  PROTEINS,
  TEXTURES,
} from '@refectorio/taste-core';
import { z } from 'zod';
import { NUTRIENT_KEYS } from './nutrients';
import { HEATS } from './retention';

/** The place of an item in a meal (menu-core composes meals from roles). */
export const ROLES = [
  'main',
  'soup',
  'salad',
  'side',
  'bread',
  'drink',
  'fruit',
  'dairy',
  'snack',
  'dessert',
] as const;
export type Role = (typeof ROLES)[number];

/** FDA/EPA «Advice about eating fish» (research/R17 C16–C17): best — 2–3 servings a week, good — 1, avoid — none. */
export const FISH_MERCURY = ['best', 'good', 'avoid'] as const;
export type FishMercury = (typeof FISH_MERCURY)[number];

export const ITEM_FLAGS = [
  'inGame',
  'boxable',
  'vegetarian',
  'vegan',
  'pescatarian',
  /** Raw or undercooked fish or seafood (sushi, poke). */
  'rawFish',
  /** Raw or lightly cooked egg (tiramisu cream). */
  'rawEgg',
  'unpasteurised',
  /** Salted, pickled or smoked fish eaten without further cooking (herring, smoked mackerel). */
  'curedFish',
  /** Dry- or raw-cured meat eaten without cooking (salo, salami); cooked on a pizza it is not. */
  'curedMeat',
  /** Soft mould-ripened or blue cheese eaten without heating (brie on a cheese plate). */
  'mouldCheese',
  /** Liver: vitamin A — not in pregnancy (research/R17 §9). */
  'liver',
  /** Cooked with an alcoholic drink (wine, beer, mirin); no menu item is a drink with alcohol. */
  'alcohol',
] as const;
export type ItemFlag = (typeof ITEM_FLAGS)[number];

const itemId = z.string().regex(DISH_ID_PATTERN);
const allergen = z.enum(ALLERGEN_CODES);
const trait = z.number().min(0).max(1);

/** Taste features of a menu item outside the game, in the catalog's vocabulary (taste-core predicts them). */
export const tasteFeaturesSchema = z.object({
  /** No course for drinks, bread, fruit and dairy: the game never asked about them. */
  course: z.enum(COURSES).optional(),
  /** No cuisine for water, fruit, nuts, plain dairy: a cuisine would add a preference they do not have. */
  cuisine: z.enum(CUISINES).optional(),
  proteins: z.array(z.enum(PROTEINS)).min(1),
  cookingMethods: z.array(z.enum(COOKING_METHODS)),
  carbBase: z.enum(CARB_BASES),
  flavours: z.array(z.enum(FLAVOURS)).max(4),
  textures: z.array(z.enum(TEXTURES)).max(3),
  traits: z.object({
    richness: trait,
    spiciness: trait,
    sweetness: trait,
    vegShare: trait,
    familiarityRu: trait,
    popularityRu: trait,
  }),
  extras: z.array(z.enum(EXTRAS)).optional(),
});
export type TasteFeatures = z.infer<typeof tasteFeaturesSchema>;

const portionSchema = z.object({
  grams: z.number().positive().max(1000),
  ml: z.number().positive().max(1000).nullable(),
  pieces: z.number().int().positive().max(20).nullable(),
});

/** What the menu adds to a game dish (data/src/items.json → `game`). */
export const gameFactsSchema = z.object({
  role: z.enum(ROLES).optional(),
  /** Total home cooking time, minutes; `estimate` until the recipes (phase 6) give it. */
  cookMin: z.number().int().min(1).max(600),
  boxable: z.boolean().optional(),
  /** Allergens of an optional serving add-on that the description mentions (nuts on porridge). */
  servingAllergens: z.array(allergen).optional(),
  heat: z.enum(HEATS).optional(),
  assembled: z.boolean().optional(),
  rawFish: z.boolean().optional(),
  rawEgg: z.boolean().optional(),
  curedFish: z.boolean().optional(),
  unpasteurised: z.boolean().optional(),
});

/** A menu item outside the game (data/src/items.json → `menu`). */
export const menuItemSchema = z.object({
  nameRu: z.string().trim().min(2).max(40),
  role: z.enum(ROLES),
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1),
  /** Minutes; a batch recipe brings its own (from the fetched recipes). */
  cookMin: z.number().int().min(0).max(600).optional(),
  boxable: z.boolean(),
  taste: tasteFeaturesSchema,
  /**
   * `single`: one USDA row or label food as it is (fruit, milk, nuts); `mix`: a few of them (dried apricots and
   * prunes); `batch`: the research recipe of that batch (research/stage-4-food-data).
   */
  recipe: z.union([
    z.object({
      kind: z.enum(['single', 'mix']),
      /** [USDA fdcId or label id, raw net grams]. */
      parts: z
        .array(z.tuple([z.union([z.number().int().positive(), z.string()]), z.number().positive()]))
        .min(1),
      portion: portionSchema,
      whatRu: z.string().trim().min(2).max(60),
      sources: z.array(z.string()).min(1),
    }),
    z.object({ kind: z.literal('batch'), batch: z.number().int().positive() }),
  ]),
  servingAllergens: z.array(allergen).optional(),
  unpasteurised: z.boolean().optional(),
});
export type MenuItemSource = z.infer<typeof menuItemSchema>;

export const itemsFileSchema = z.object({
  version: z.string(),
  game: z.record(itemId, gameFactsSchema),
  menu: z.record(itemId, menuItemSchema),
});
export type ItemsFile = z.infer<typeof itemsFileSchema>;

const nutrientArray = z.array(z.number().nonnegative().nullable()).length(NUTRIENT_KEYS.length);

/** The browser chunk «food-core». Short keys: it is loaded during the quiz finale (≤ 60 KB gz). */
export const foodCoreItemSchema = z.object({
  id: itemId,
  /** Role. */
  r: z.enum(ROLES),
  /** Meal types. */
  m: z.array(z.enum(MEAL_TYPES)).min(1),
  /** Allergens of the typical recipe. */
  a: z.array(allergen),
  /** Allergens of an optional serving add-on. */
  sa: z.array(allergen),
  /** Traces: allergens that bought ingredients may carry by cross-contact (only a severe allergy excludes by them). */
  tr: z.array(allergen),
  /** Flags. */
  f: z.array(z.enum(ITEM_FLAGS)),
  /** Fish mercury class (FDA/EPA), when the item has fish. */
  hg: z.enum(FISH_MERCURY).nullable(),
  /** Portion: grams, ml, pieces. */
  p: z.tuple([
    z.number().positive(),
    z.number().positive().nullable(),
    z.number().int().positive().nullable(),
  ]),
  /** Cooking time, minutes (an estimate for the game dishes until phase 6). */
  t: z.number().int().nonnegative(),
  /** Nutrients per portion, NUTRIENT_KEYS order; null — no data. */
  n: nutrientArray,
  /** Ingredients: [index into `ingredients`, raw net grams]. */
  i: z.array(z.tuple([z.number().int().nonnegative(), z.number().positive()])),
  /** Taste features of an item outside the game (the game dishes take theirs from the catalog). */
  x: tasteFeaturesSchema.optional(),
});
export type FoodCoreItem = z.infer<typeof foodCoreItemSchema>;

export const foodCoreSchema = z.object({
  version: z.string(),
  /** taste-core catalog version the game dishes refer to. */
  catalogVersion: z.string(),
  nutrients: z.array(z.string()).length(NUTRIENT_KEYS.length),
  /**
   * [id, Russian name, SR Legacy food_category_id (0 — label foods)]: the group lets menu-core sort ingredients into
   * food groups (fish, red meat, vegetables…) without the build's English descriptions.
   */
  ingredients: z.array(z.tuple([z.string(), z.string(), z.number().int().nonnegative()])),
  items: z.array(foodCoreItemSchema),
});
export type FoodCoreFile = z.infer<typeof foodCoreSchema>;

/** The browser chunk «food-text»: [name, portion «what», long description, short description]. */
export const foodTextSchema = z.object({
  version: z.string(),
  items: z.record(itemId, z.tuple([z.string(), z.string(), z.string(), z.string()])),
});
export type FoodTextFile = z.infer<typeof foodTextSchema>;
