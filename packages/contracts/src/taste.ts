import { z } from 'zod';

/**
 * TasteProfileV1 — what the dish game «Выберите блюдо» learned (packages/taste-core produces it).
 * Stage 3 ranks dish candidates with `predictions`; the quiz itself only reads the `avoidsMeat` / `avoidsFish` hints
 * to pre-highlight a food-preference option (never to choose it).
 */

/** Dish ids are stable forever (algorithm-spec.md §8): stage 3 links them to recipes. */
export const DISH_ID_PATTERN = /^d_[a-z0-9_]{2,40}$/;
export const dishIdSchema = z.string().regex(DISH_ID_PATTERN);

export const TASTE_ANSWERS = ['like', 'dislike', 'skip'] as const;
export type TasteAnswer = (typeof TASTE_ANSWERS)[number];

/** The game needs this many likes/dislikes; skips don't count (user rule). */
export const DECISIVE_ANSWERS_REQUIRED = 10;

export const tasteDecisionSchema = z.object({
  dishId: dishIdSchema,
  answer: z.enum(TASTE_ANSWERS),
});
export type TasteDecision = z.infer<typeof tasteDecisionSchema>;

/** Confident conclusions in plain terms (taste-core/profile.ts decides when a hint is confident). */
export const TASTE_HINTS = [
  'avoidsMeat',
  'avoidsFish',
  'avoidsSeafood',
  'likesMeat',
  'likesFish',
  'likesSoups',
  'likesVegetables',
  'likesSpicy',
  'avoidsSpicy',
  'sweetTooth',
  'likesBaking',
  'likesAsian',
  'likesPasta',
] as const;
export type TasteHint = (typeof TASTE_HINTS)[number];

const probability = z.number().min(0).max(1);

export const tasteProfileV1Schema = z.object({
  version: z.literal(1),
  /** taste-core engine and catalog versions: stage 3 knows which model and dish set produced the numbers. */
  engineVersion: z.string().min(1),
  catalogVersion: z.string().min(1),
  /** Seed of the card sequence (reproducible with ?seed). */
  seed: z.number().int().nonnegative(),
  decisions: z.array(tasteDecisionSchema).max(300),
  /** Posterior over the taste weights, one entry per dish feature. */
  features: z.array(
    z.object({ id: z.string().min(1), mean: z.number(), variance: z.number().nonnegative() }),
  ),
  /** Predicted probability that the person likes each catalog dish. */
  predictions: z.array(z.object({ dishId: dishIdSchema, pLike: probability })),
  hints: z.array(z.object({ hint: z.enum(TASTE_HINTS), confidence: probability })),
});
export type TasteProfileV1 = z.infer<typeof tasteProfileV1Schema>;

export const decisiveCount = (decisions: readonly TasteDecision[]): number =>
  decisions.filter((decision) => decision.answer !== 'skip').length;
