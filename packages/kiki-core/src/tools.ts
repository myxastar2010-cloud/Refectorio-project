/**
 * Kiki's tools (ТЗ 07 §6): zod schemas → JSON Schema for the model; short, precise English descriptions with Russian
 * examples. Where a tool runs decides its kind: `read` and `propose` run in the browser (menu-core worker, local
 * profile), `ui` and `server` on the server. Proposals never change anything: they return a preview the person applies.
 * Schemas here are what the MODEL sees (ids as plain strings — the executor checks them against the data and the rules
 * DSL, so a wrong id becomes a readable error the model can fix, never a silent guess).
 */
import { NUTRIENT_KEYS, type NutrientKey } from '@refectorio/food-data';
import { GOALS } from '@refectorio/nutrition-core';
import { z } from 'zod';
import { UI_TARGETS } from './protocol';

export const MEAL_KINDS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('YYYY-MM-DD');
const mealKind = z.enum(MEAL_KINDS);
const nutrient = z.enum(NUTRIENT_KEYS as [NutrientKey, ...NutrientKey[]]);

const daysScope = z
  .object({
    kind: z.enum(['all', 'weekdays', 'weekends', 'weekdaysOf', 'dates']),
    days: z.array(z.int().min(0).max(6)).optional().describe('weekdaysOf: 0 = Monday … 6 = Sunday'),
    dates: z.array(isoDate).optional().describe('dates: exact days'),
  })
  .describe('Which days; omit = every day');

const target = z
  .object({
    itemId: z.string().optional(),
    category: z.string().optional(),
    ingredientId: z.string().optional(),
  })
  .describe(
    'Exactly one key. Ids ONLY from resolve_food_terms or find_in_menu results — never invent or guess an id',
  );

export const RULE_INPUT_KINDS = [
  'excludeIngredient',
  'excludeItem',
  'includeItem',
  'minNutrient',
  'maxNutrient',
  'frequency',
  'replaceCategory',
  'preferLess',
  'preferMore',
] as const;

/** One rule as the model writes it; the executor adds id, author and checks it against the menu-core DSL. */
export const ruleInputSchema = z.object({
  kind: z
    .enum(RULE_INPUT_KINDS)
    .describe(
      'excludeIngredient/excludeItem — never use (safety-level for allergies); includeItem — put it in the menu; ' +
        'min/maxNutrient — a nutrient floor/ceiling per meal or day; frequency — times per week; ' +
        'replaceCategory — from → to (coffee → tea); preferLess/preferMore — softer/stronger preference',
    ),
  textRu: z
    .string()
    .min(2)
    .max(160)
    .describe('Short Russian label the user sees: «Ужин — от 20 г белка», «Без чеснока»'),
  target: target.optional(),
  itemId: z.string().optional().describe('excludeItem only'),
  nutrient: nutrient
    .optional()
    .describe('min/maxNutrient: proteinG, energyKcal, fibreG, sodiumMg…'),
  per: z.enum(['meal', 'day']).optional(),
  value: z.number().optional().describe('The amount the USER asked for, in the nutrient unit'),
  minPerWeek: z.int().min(0).max(21).optional(),
  maxPerWeek: z.int().min(0).max(21).optional(),
  from: z.string().optional().describe('replaceCategory: category id'),
  to: z.string().optional().describe('replaceCategory: category id'),
  days: daysScope.optional(),
  meals: z.array(mealKind).min(1).max(4).optional().describe('Which meals; omit = every meal'),
});
export type RuleInput = z.infer<typeof ruleInputSchema>;

export const TOOLS = {
  get_menu: {
    kind: 'read',
    description:
      'The user menu for a date range (≤ 7 days): per day and meal — item ids, names, portion, kcal and macros, eaten marks.',
    schema: z.object({
      from: isoDate,
      to: isoDate,
      meals: z.array(mealKind).optional(),
    }),
  },
  find_in_menu: {
    kind: 'read',
    description:
      'Search the user menu for a dish, ingredient or category («блины», «пшёнка», «рыба»): every day and meal where it is, with portion and kcal.',
    schema: z.object({ query: z.string().min(1).max(80) }),
  },
  resolve_food_terms: {
    kind: 'read',
    description:
      'Map the user food words («чеснок», «молочка», «пшённая каша») to category / ingredient / item ids of the dish database. Use before any rule that names a food. Unmatched words come back as unmatched — then ask, never guess.',
    schema: z.object({ terms: z.array(z.string().min(1).max(60)).min(1).max(10) }),
  },
  get_item_details: {
    kind: 'read',
    description:
      'One dish: description, allergens and traces, diet flags, cooking time, ingredients, nutrition per portion (with the day portion if date is given).',
    schema: z.object({ itemId: z.string().min(2).max(60), date: isoDate.optional() }),
  },
  get_recipe: {
    kind: 'read',
    description: 'The recipe of a dish (ingredients with grams, steps) if available.',
    schema: z.object({
      itemId: z.string().min(2).max(60),
      variant: z.enum(['classic', 'quick']).optional(),
    }),
  },
  get_targets: {
    kind: 'read',
    description:
      'The user daily targets computed by the engine: kcal, protein/fat/carbs ranges, fibre, water, sugar, salt, caffeine.',
    schema: z.object({ date: isoDate.optional() }),
  },
  get_progress: {
    kind: 'read',
    description: 'What the user marked as eaten on a day and the water drunk, against the targets.',
    schema: z.object({ date: isoDate }),
  },
  get_profile_summary: {
    kind: 'read',
    description:
      'Goal type, diet, exclusions, meal structure (meal ids), active rules (ids, labels), safety flags. No body data.',
    schema: z.object({}),
  },
  propose_menu_change: {
    kind: 'propose',
    description:
      'Propose rules for the menu; the engine re-plans and returns a preview the USER applies (nothing changes now). Returns previewId, summaryRu and stats — retell summaryRu briefly, never compute numbers yourself.',
    schema: z.object({
      rules: z.array(ruleInputSchema).max(6).default([]),
      removeRuleIds: z
        .array(z.string().max(40))
        .max(10)
        .optional()
        .describe('Ids of active rules to drop (from get_profile_summary)'),
      reasonRu: z.string().min(2).max(200).describe('Why, in the user words'),
    }),
  },
  propose_goal_change: {
    kind: 'propose',
    description:
      'Propose a new goal (maintain / lose / gain / habits); targets are recomputed locally from the user body data. Preview shows targets before → after.',
    schema: z.object({
      goal: z.enum(GOALS),
      targetWeightKg: z.number().min(30).max(250).optional(),
    }),
  },
  propose_meal_structure: {
    kind: 'propose',
    description:
      'Propose a new set of meals: add meal kinds (a snack…), remove meal ids, or a new order of meal ids. Preview with the re-planned days.',
    schema: z.object({
      add: z.array(mealKind).max(3).optional(),
      remove: z.array(z.string().max(20)).max(3).optional(),
      order: z.array(z.string().max(20)).max(6).optional(),
    }),
  },
  propose_alternatives: {
    kind: 'propose',
    description:
      'Options to replace one dish of the menu (date, meal id, item id): up to k alternatives, each with its own previewId.',
    schema: z.object({
      date: isoDate,
      mealId: z.string().max(20),
      itemId: z.string().min(2).max(60),
      k: z.int().min(2).max(5).default(3),
    }),
  },
  ask_choice: {
    kind: 'ui',
    description:
      'Ask the user to pick one option (shown as buttons under your message) when the request is ambiguous or a reply like «Да» does not pick an option. Then stop: the next user message is the answer.',
    schema: z.object({
      questionRu: z.string().min(2).max(200),
      options: z.array(z.string().min(1).max(60)).min(2).max(4),
    }),
  },
  open_ui: {
    kind: 'ui',
    description:
      'Show a button that opens a place of the site (it never navigates by itself): dish (id = itemId), day (id = date), search, goal, download, restore, widgets, mealEdit, news, account, privacy, recipes.',
    schema: z.object({
      target: z.enum(UI_TARGETS),
      id: z.string().max(60).optional(),
    }),
  },
  kb_search: {
    kind: 'server',
    description:
      'Search the knowledge base: how-to steps for the site and short cited nutrition science cards. Use for «как…», «где…» and health questions.',
    schema: z.object({ query: z.string().min(2).max(120) }),
  },
} as const;

export type ToolName = keyof typeof TOOLS;
export type ToolKind = (typeof TOOLS)[ToolName]['kind'];
export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];
export type ToolArgs<N extends ToolName> = z.infer<(typeof TOOLS)[N]['schema']>;

export const isToolName = (name: string): name is ToolName => Object.hasOwn(TOOLS, name);
export const toolKind = (name: ToolName): ToolKind => TOOLS[name].kind;

/** Part I tool set (Part II adds web search, page fetch, custom items, recipe edits). */
export const PART_ONE_TOOLS: readonly ToolName[] = TOOL_NAMES;

export type ProviderTool = {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
};

function stripSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema' || key === 'additionalProperties') continue;
    out[key] = stripSchema(value);
  }
  return out;
}

const providerCache = new Map<string, ProviderTool[]>();

/** OpenAI-compatible `tools` for the given names (cached: the same bytes every request keep the provider's prefix cache). */
export function providerTools(names: readonly ToolName[] = PART_ONE_TOOLS): ProviderTool[] {
  const key = names.join(',');
  const known = providerCache.get(key);
  if (known) return known;
  const tools = names.map((name) => ({
    type: 'function' as const,
    function: {
      name,
      description: TOOLS[name].description,
      parameters: stripSchema(
        z.toJSONSchema(TOOLS[name].schema, { io: 'input', unrepresentable: 'any' }),
      ) as Record<string, unknown>,
    },
  }));
  providerCache.set(key, tools);
  return tools;
}

/**
 * Tool arguments as models write them: strict JSON usually; sometimes in a code fence, with text around it or empty.
 * Returns the parsed value or null.
 */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const unfenced = trimmed.replace(/^```(?:json)?\s*|\s*```$/g, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

export type ArgsResult<N extends ToolName> =
  | { readonly ok: true; readonly args: ToolArgs<N> }
  | { readonly ok: false; readonly error: string };

/** Validates a call's arguments with the tool's schema; the error is short English the model can act on. */
export function parseToolArgs<N extends ToolName>(name: N, argsText: string): ArgsResult<N> {
  const value = parseJsonLoose(argsText);
  if (value === null) return { ok: false, error: 'arguments are not valid JSON' };
  const parsed = TOOLS[name].schema.safeParse(value);
  if (parsed.success) return { ok: true, args: parsed.data as ToolArgs<N> };
  const issues = parsed.error.issues
    .slice(0, 4)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ok: false, error: `invalid arguments — ${issues}` };
}
