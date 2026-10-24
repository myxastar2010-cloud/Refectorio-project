import { z } from 'zod';
import { DISH_ID_PATTERN } from '@refectorio/contracts';

/**
 * Dish info of the game cards (stage 3, §5; research/stage-3-dish-data.md). The numbers are computed by
 * scripts/dish-data from the recipes and USDA SR Legacy — never written by hand or by a model — per one standard
 * portion; the descriptions continue the dish name («Овсяная каша — это…»).
 */
const version = z.string().regex(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/);
const dishId = z.string().regex(DISH_ID_PATTERN);

/** Limits of the two description lengths (the short one is used when the long one does not fit the card). */
export const DESCRIPTION_MAX = { long: 220, short: 90 } as const;

const grams = z.number().min(0).max(300);

/** The site's slim copy: [energy kcal, protein g, fat g, carbohydrate g] per portion, kcal integer, grams to 0.1. */
export const dishNumbersSchema = z.object({
  version,
  dishes: z.record(dishId, z.tuple([z.int().min(0).max(2500), grams, grams, grams])),
});
export type DishNumbersFile = z.infer<typeof dishNumbersSchema>;

const description = (max: number) =>
  z
    .string()
    .trim()
    .min(10)
    .max(max)
    // No digits: the description never carries numbers (they come from the row above it).
    .regex(/^[^0-9]+$/u);

/** [long ≤ 220, short ≤ 90] — each continues the dish name after «—», starting with a lower-case letter. */
export const dishTextSchema = z.object({
  version,
  dishes: z.record(
    dishId,
    z.tuple([description(DESCRIPTION_MAX.long), description(DESCRIPTION_MAX.short)]),
  ),
});
export type DishTextFile = z.infer<typeof dishTextSchema>;
