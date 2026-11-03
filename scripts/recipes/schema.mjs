// Zod shapes of a pilot recipe — mirrors «Shape» in recipe-pilot/BRIEF.md.
import { z } from 'zod';

const DISPLAY = ['g', 'ml', 'piece', 'tbsp', 'tsp', 'pinch', 'toTaste', 'clove', 'slice'];

export const Substitute = z
  .object({
    key: z.string().optional(),
    textRu: z.string().optional(),
    ratio: z.number().positive(),
    rule: z.string().optional(),
    noteRu: z.string().max(100),
    changes: z
      .object({
        allergensAdd: z.array(z.string()).optional(),
        allergensRemove: z.array(z.string()).optional(),
        dietNote: z.string().optional(),
      })
      .strict(),
  })
  .strict()
  .refine((s) => s.key || s.textRu, 'substitute needs key or textRu');

export const Ingredient = z
  .object({
    key: z.string().min(1),
    nameRu: z.string().min(1),
    grams: z.number().nonnegative(),
    display: z.enum(DISPLAY),
    optional: z.literal(true).optional(),
    group: z.string().optional(),
    substitutes: z.array(Substitute).max(2),
  })
  .strict();

export const Step = z
  .object({
    id: z.string().regex(/^s\d+$/),
    textRu: z.string().min(1),
    ingredientKeys: z.array(z.string()),
    timerSec: z.number().positive().optional(),
    tempC: z.number().optional(),
    tipRu: z.string().max(120).optional(),
    safety: z.literal(true).optional(),
  })
  .strict();

export const Variant = z
  .object({
    totalTimeMin: z.number().int().positive(),
    activeTimeMin: z.number().int().nonnegative(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    equipment: z.array(z.string()),
    ingredients: z.array(Ingredient).min(1),
    steps: z.array(Step).min(1),
    storage: z.string().optional(),
    reheat: z.string().optional(),
    lunchBoxNote: z.string().optional(),
    sources: z.array(z.string()),
  })
  .strict();

export const Recipe = z
  .object({
    itemId: z.string(),
    baseServings: z.literal(1),
    variants: z.object({ classic: Variant, quick: Variant }).strict(),
  })
  .strict();
