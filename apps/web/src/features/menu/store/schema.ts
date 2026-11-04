/**
 * What the menu keeps in this browser (ТЗ этапа 4 §5.2, D-061): one record per key, each checked by a zod schema when
 * read, a file or another tab hands it over. Keys keep the internal prefix `refectorio.` (D-060). The plan is checked
 * by its envelope and shape (the engine's own validator and `planStaleness` judge its contents).
 */
import { quizAnswersV1Schema } from '@refectorio/contracts';
import { NUTRIENT_KEYS } from '@refectorio/food-data';
import type { Plan, Tracking } from '@refectorio/menu-core';
import { z } from 'zod';

export const STORE_VERSION = 1;
export const DB_NAME = 'refectorio';
/** `?menu=demo` keeps its seeded plan apart from the person's own. */
export const DEMO_DB_NAME = 'refectorio-demo';

export const KEYS = {
  meta: 'refectorio.meta',
  profile: 'refectorio.profile',
  plan: 'refectorio.plan',
  tracking: 'refectorio.tracking',
  widgets: 'refectorio.widgets',
  letters: 'refectorio.notifications',
  settings: 'refectorio.settings',
} as const;

/** Undo keeps this many earlier revisions of the plan. */
export const PLAN_HISTORY = 10;
export const MAX_WIDGETS = 6;
export const AVATAR_COUNT = 9;
export const LETTER_IMAGES = 7;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const mealSchema = z.object({
  id: z.string(),
  kind: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  titleRu: z.string(),
  order: z.number().int(),
});

const itemSchema = z.looseObject({
  itemId: z.string(),
  role: z.string(),
  slot: z.string(),
  portion: z.looseObject({ kind: z.enum(['factor', 'pieces', 'volume']), factor: z.number() }),
  grams: z.number(),
  nutrients: z.record(z.string(), z.number().nullable()),
  reasons: z.array(z.string()),
});

export const planSchema = z
  .looseObject({
    schema: z.literal(1),
    revision: z.number().int().nonnegative(),
    seed: z.number(),
    createdAt: isoDate,
    profileHash: z.string(),
    foodDataVersion: z.string(),
    rulesVersion: z.string(),
    targets: z.looseObject({ energyKcal: z.number().positive() }),
    structure: z.array(mealSchema).min(1),
    rules: z.array(z.unknown()),
    days: z.array(
      z.looseObject({
        date: isoDate,
        meals: z.record(z.string(), z.array(itemSchema)),
        totals: z.record(z.string(), z.number().nullable()),
        flags: z.array(z.looseObject({ code: z.string() })),
      }),
    ),
    horizonEnd: isoDate,
    notes: z.array(z.looseObject({ code: z.string() })),
  })
  .transform((plan) => plan as unknown as Plan);

export const planRecordSchema = z.object({
  current: planSchema,
  history: z.array(planSchema).max(PLAN_HISTORY),
});

export const trackingSchema = z
  .object({
    schema: z.literal(1),
    days: z.record(
      isoDate,
      z.object({
        eaten: z.record(z.string(), z.string()),
        waterGlasses: z.number().int().nonnegative(),
        waterAt: z.array(z.string()),
      }),
    ),
  })
  .transform((tracking) => tracking as Tracking);

export const WIDGET_COLORS = [
  'plum',
  'blue',
  'gold',
  'teal',
  'coral',
  'sage',
  'sand',
  'ink',
] as const;
export type WidgetColor = (typeof WIDGET_COLORS)[number];

export const widgetSchema = z.object({
  id: z.string(),
  nutrient: z.enum(NUTRIENT_KEYS),
  scope: z.enum(['day', 'meal', 'week']),
  mealId: z.string().optional(),
  color: z.enum(WIDGET_COLORS),
});
export type WidgetConfig = z.infer<typeof widgetSchema>;

export const LETTER_KINDS = ['welcome', 'localOnly', 'recap', 'tip', 'change', 'season'] as const;
export type LetterKind = (typeof LETTER_KINDS)[number];

export const letterSchema = z.object({
  id: z.string(),
  kind: z.enum(LETTER_KINDS),
  /** ISO time it arrived. */
  at: z.string(),
  read: z.boolean(),
  /** One of the decorative images, chosen once per letter (1–7). */
  image: z.number().int().min(1).max(LETTER_IMAGES),
  /** The facts the letter's text is built from (rules, not a model). */
  data: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});
export type Letter = z.infer<typeof letterSchema>;

export const settingsSchema = z.object({
  /** Index of the avatar (0–8), chosen at the first menu. */
  avatar: z
    .number()
    .int()
    .min(0)
    .max(AVATAR_COUNT - 1)
    .nullable(),
  /** «Понятно» on the local-storage notice. */
  noticeSeen: z.boolean(),
  dailyDigest: z.boolean(),
  /** The day the last daily letter was written (at most one a day). */
  lastLetterDay: isoDate.nullable(),
  /** The menu's notes the person closed with «Понятно» (health, allergy); older files have none. */
  dismissedNotes: z.array(z.string()).default([]),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  avatar: null,
  noticeSeen: false,
  dailyDigest: true,
  lastLetterDay: null,
  dismissedNotes: [],
};

export const profileSchema = z.object({ answers: quizAnswersV1Schema });

/** The backup file (download / restore): the same records, versioned. */
export const backupSchema = z.object({
  format: z.literal('refectorio.backup'),
  version: z.literal(STORE_VERSION),
  exportedAt: z.string(),
  data: z.object({
    profile: profileSchema,
    plan: planRecordSchema,
    tracking: trackingSchema,
    widgets: z.array(widgetSchema).max(MAX_WIDGETS),
    letters: z.array(letterSchema),
    settings: settingsSchema,
  }),
});
export type Backup = z.input<typeof backupSchema>;
