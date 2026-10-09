import { DISH_ID_PATTERN } from '@refectorio/contracts';
import { ALLERGEN_CODES } from '@refectorio/nutrition-core';
import { z } from 'zod';

/**
 * The dish taste catalog: what a dish is like (course, cuisine, protein, method, flavours, traits), not what it
 * contains in grams — stage 3 links the stable ids to recipes in the nutrition database.
 * Engineering estimates of the numeric traits are documented in research/R15 §7.
 */

/** Quota groups of the catalog and the «smart distribution of base dish types» of the warm start. */
export const BASE_TYPES = [
  'breakfast',
  'soup',
  'salad',
  'meatMain',
  'poultryMain',
  'fishMain',
  'seafoodMain',
  'vegMain',
  'pastaGrains',
  'asian',
  'caucasianCentralAsian',
  'baking',
  'dessert',
  'snack',
] as const;

export const COURSES = [
  'breakfast',
  'soup',
  'salad',
  'main',
  'side',
  'baking',
  'dessert',
  'snack',
] as const;

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export const CUISINES = [
  'russian',
  'eastEuropean',
  'european',
  'italian',
  'french',
  'mediterranean',
  'caucasian',
  'centralAsian',
  'middleEastern',
  'japanese',
  'chinese',
  'korean',
  'southeastAsian',
  'indian',
  'american',
  'mexican',
] as const;

export const PROTEINS = [
  'beef',
  'pork',
  'lamb',
  'poultry',
  'fish',
  'seafood',
  'eggs',
  'dairy',
  'legumes',
  'tofu',
  'mushrooms',
  'none',
] as const;

export const COOKING_METHODS = [
  'fried',
  'deepFried',
  'baked',
  'boiled',
  'stewed',
  'grilled',
  'steamed',
  'raw',
  'smoked',
] as const;

export const CARB_BASES = [
  'bread',
  'rice',
  'pasta',
  'noodles',
  'potato',
  'buckwheat',
  'grains',
  'dough',
  'none',
] as const;

export const FLAVOURS = [
  'sweet',
  'sour',
  'spicy',
  'smoky',
  'creamy',
  'herby',
  'garlicky',
  'umami',
  'salty',
] as const;

export const TEXTURES = [
  'crispy',
  'crunchy',
  'soft',
  'chewy',
  'juicy',
  'liquid',
  'creamy',
] as const;

/** Animal products that are not visible in the protein list (vegetarian/vegan flags). */
export const EXTRAS = ['honey', 'gelatin', 'meatBroth', 'fishSauce'] as const;

const trait = z.number().min(0).max(1);
const nonEmpty = <T extends readonly [string, ...string[]]>(values: T) =>
  z.array(z.enum(values)).min(1);

export const dishSchema = z.object({
  /** `d_[a-z0-9_]{2,40}` — stable forever. */
  id: z.string().regex(DISH_ID_PATTERN),
  nameRu: z.string().trim().min(2).max(40),
  baseType: z.enum(BASE_TYPES),
  course: z.enum(COURSES),
  mealTypes: nonEmpty(MEAL_TYPES),
  cuisine: z.enum(CUISINES),
  /** The first is the main protein. */
  proteins: nonEmpty(PROTEINS),
  cookingMethods: nonEmpty(COOKING_METHODS),
  carbBase: z.enum(CARB_BASES),
  flavours: z.array(z.enum(FLAVOURS)).max(4),
  textures: z.array(z.enum(TEXTURES)).max(3),
  traits: z.object({
    /** Fat and heaviness: 0 light (salad, steamed fish) … 1 very rich (fried pork, Napoleon cake). */
    richness: trait,
    spiciness: trait,
    sweetness: trait,
    /** Share of vegetables, fruit and greens in the dish. */
    vegShare: trait,
    /** How well an average person in Russia knows the dish (borscht 1.0 … bibimbap 0.25). */
    familiarityRu: trait,
    /** Share of people in Russia who like it (survey-based estimate, research/R15 §7). */
    popularityRu: trait,
  }),
  /** The 15 allergen codes of nutrition-core (typical recipe). */
  allergens: z.array(z.enum(ALLERGEN_CODES)),
  extras: z.array(z.enum(EXTRAS)).optional(),
  /** Photo alt text in Russian: what is on the plate, 3–12 words. */
  altRu: z.string().trim().min(8).max(120),
});
export type Dish = z.infer<typeof dishSchema>;

export const catalogSchema = z.object({
  /** Bumped on every change of the dish list or features (TasteProfileV1.catalogVersion). */
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/),
  dishes: z.array(dishSchema).min(150).max(200),
});
export type Catalog = z.infer<typeof catalogSchema>;

/** English photo search queries per dish (scripts/photos only — kept out of the web bundle). */
export const photoQueriesSchema = z.record(
  z.string().regex(DISH_ID_PATTERN),
  z.array(z.string().trim().min(3).max(60)).min(1).max(3),
);

const MEAT = new Set<string>(['beef', 'pork', 'lamb', 'poultry']);

/** Diet flags derived from the protein list, allergens and extras (never stored separately). */
export function dietFlags(dish: Dish) {
  const meat =
    dish.proteins.some((p) => MEAT.has(p)) || dish.extras?.includes('meatBroth') === true;
  const fish =
    dish.proteins.includes('fish') ||
    dish.allergens.includes('FISH') ||
    dish.extras?.includes('fishSauce') === true;
  const seafood =
    dish.proteins.includes('seafood') ||
    dish.allergens.includes('CRUSTACEAN') ||
    dish.allergens.includes('MOLLUSC');
  const eggs = dish.proteins.includes('eggs') || dish.allergens.includes('EGG');
  const dairy = dish.proteins.includes('dairy') || dish.allergens.includes('MILK');
  const otherAnimal = dish.extras?.some((e) => e === 'honey' || e === 'gelatin') === true;
  const gelatin = dish.extras?.includes('gelatin') === true;
  return {
    meat,
    fish,
    seafood,
    pescatarian: !meat && !gelatin,
    vegetarian: !meat && !fish && !seafood && !gelatin,
    vegan: !meat && !fish && !seafood && !eggs && !dairy && !otherAnimal,
  };
}
