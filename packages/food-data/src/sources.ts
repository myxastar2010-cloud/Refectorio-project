/**
 * The committed sources of the food data (`data/src/`, ADR 0015). The build writes the first three from USDA SR
 * Legacy, the USDA retention table and the research recipes, so the food-core chunk can be recomputed and checked
 * from the repository alone (tests, CI); `items.json` and `texts.json` are authored.
 */
import { DISH_ID_PATTERN } from '@refectorio/contracts';
import { z } from 'zod';
import { NUTRIENT_KEYS, type NutrientKey } from './nutrients';
import { HEATS, RETENTION_CODES, type RetentionClass } from './retention';

const nutrientArray = z.array(z.number().nonnegative().nullable()).length(NUTRIENT_KEYS.length);

export const INGREDIENT_ORIGINS = [
  /** The USDA SR Legacy row as it is. */
  'sr',
  /** Micronutrients from the unenriched / unfortified twin row (Russian flour, rice, milk are not fortified). */
  'sr-twin',
  /** The US enrichment taken out by the folic-acid share of the row (no twin row exists), an estimate. */
  'sr-estimate',
  /** Macronutrients from Russian labels; the rest from the nearest USDA row (approx). */
  'label',
] as const;

export const ingredientsFileSchema = z.object({
  version: z.string(),
  source: z.string(),
  nutrients: z.array(z.string()).length(NUTRIENT_KEYS.length),
  ingredients: z.record(
    z.string().regex(/^(i_\d+|ru:[a-z0-9.-]+)$/),
    z.object({
      description: z.string(),
      nameRu: z.string(),
      category: z.number().int().nonnegative(),
      origin: z.enum(INGREDIENT_ORIGINS),
      /** The USDA row of the micronutrients when it differs (twin, analogue). */
      microFdcId: z.number().int().positive().nullable(),
      /** The unsalted USDA row of the sodium: the Russian food is unsalted, its US row is salted (butter, curd). */
      sodiumFdcId: z.number().int().positive().nullable(),
      per100g: nutrientArray,
      /** Label foods: where the macronutrients were read. */
      source: z.string().nullable(),
    }),
  ),
});
export type IngredientsFile = z.infer<typeof ingredientsFileSchema>;

export const retentionFileSchema = z.object({
  version: z.string(),
  source: z.string(),
  codes: z.record(
    z.string().regex(/^\d{4}$/),
    z.object({
      desc: z.string(),
      factors: z.partialRecord(
        z.enum(NUTRIENT_KEYS as [NutrientKey, ...NutrientKey[]]),
        z.number().min(0).max(100),
      ),
    }),
  ),
});
export type RetentionFile = z.infer<typeof retentionFileSchema>;

const RETENTION_CLASSES = Object.keys(RETENTION_CODES) as [RetentionClass, ...RetentionClass[]];

export const recipeSourceSchema = z.object({
  portion: z.object({
    grams: z.number().positive(),
    ml: z.number().positive().nullable(),
    pieces: z.number().int().positive().nullable(),
  }),
  /** «тарелка каши», «стакан» — what one portion is. */
  whatRu: z.string(),
  heat: z.enum(HEATS),
  assembled: z.boolean(),
  rawClasses: z.array(z.enum(RETENTION_CLASSES)).optional(),
  ingredients: z.array(z.tuple([z.string(), z.number().positive()])).min(1),
  frying: z
    .object({
      oil: z.string(),
      /** Bognár 2002 row (research/stage-3-dish-data/cooking-and-ru-dairy.json). */
      row: z.string(),
      fatGPer100g: z.number().nonnegative(),
      fried: z.array(z.string()).nullable(),
    })
    .nullable(),
  meatFat: z
    .object({
      cut: z.string(),
      /** USDA cooking yields row. */
      row: z.string(),
      fatChangeGPer100gRaw: z.number(),
    })
    .nullable(),
  /** `fetched` / `composed` — research recipes (≥ 2 fetched sources); `single` — USDA rows or labels as they are. */
  method: z.enum(['fetched', 'composed', 'single']),
  /** Cooking time of the research recipe, minutes. */
  cookMin: z.number().int().nonnegative().optional(),
  sources: z.array(z.string()).min(1),
});
export type RecipeSource = z.infer<typeof recipeSourceSchema>;

export const recipesFileSchema = z.object({
  version: z.string(),
  recipes: z.record(z.string().regex(DISH_ID_PATTERN), recipeSourceSchema),
});
export type RecipesFile = z.infer<typeof recipesFileSchema>;

/** Descriptions of the menu items outside the game (D-056 rules: no numbers, no health claims). */
export const textsFileSchema = z.object({
  version: z.string(),
  items: z.record(
    z.string().regex(DISH_ID_PATTERN),
    z.tuple([z.string().min(20).max(220), z.string().min(10).max(90)]),
  ),
});
export type TextsFile = z.infer<typeof textsFileSchema>;
