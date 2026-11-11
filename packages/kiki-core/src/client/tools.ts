/**
 * Browser-side tools (ТЗ 07 §6–7): the same code runs in the menu worker (the site) and in Node (evals, tests). Read
 * tools answer from the plan and the dish data in compact JSON; propose tools compute a preview with menu-core and
 * never change the plan — the person applies it. Every id is checked against the data; a wrong one becomes an error the
 * model can fix, never a guess. Numbers come only from the engine (rounded as the site shows them).
 */
import { targetWeightBoundsKg } from '@refectorio/nutrition-core';
import {
  addMeal,
  alternatives,
  applyRules,
  buildMenuProfile,
  CATEGORIES,
  CATEGORY_IDS,
  dayStatus,
  drinking,
  moveMeal,
  regenerate,
  removeMeal,
  replaceItem,
  ruleSchema,
  setStructure,
  stableHash,
  totals,
  weekdayIndex,
  type CategoryId,
  type DayPlan,
  type DayTargets,
  type Engine,
  type FoodIndex,
  type IsoDate,
  type ItemView,
  type Meal,
  type OpError,
  type OpResult,
  type Plan,
  type PlannedItem,
  type Rule,
  type SearchHit,
  type SlotRef,
  type TermResolver,
  type Tracking,
} from '@refectorio/menu-core';
import { parseToolArgs, type RuleInput, type ToolArgs, type ToolName } from '../tools';
import { buildPreview, type Preview, type PreviewOp } from './preview';

export const WEEKDAYS_RU = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;
export const weekdayRu = (date: IsoDate): string => WEEKDAYS_RU[weekdayIndex(date)] ?? '';

/** Everything a tool may read: the person's plan, marks, answers and the engine (in the worker or in Node). */
export type ToolEnv = {
  readonly engine: Engine;
  readonly foods: FoodIndex;
  readonly plan: Plan;
  readonly tracking: Tracking;
  readonly today: IsoDate;
  /** The quiz answers (local; never leave the browser). */
  readonly answers: unknown;
  readonly items: ReadonlyMap<string, ItemView>;
  readonly ingredients: ReadonlyMap<string, string>;
  readonly resolve: TermResolver;
  readonly search: (query: string) => readonly SearchHit[];
  /** Preview ids: `pv-<n>` (deterministic in tests). */
  readonly nextPreviewId: () => string;
};

export type ToolOutcome = {
  /** What goes back to the model (compact JSON). */
  readonly result: unknown;
  /** Proposals: the preview the chat shows (one per alternative for `propose_alternatives`). */
  readonly previews?: readonly Preview[];
};

const round = (n: number | null | undefined) => (n == null ? null : Math.round(n));
const round1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);

function nameOf(env: ToolEnv, itemId: string): string {
  return env.items.get(itemId)?.nameRu ?? itemId;
}

export function portionText(item: PlannedItem): string {
  const grams = `${Math.round(item.grams)} г`;
  if (item.portion.kind === 'pieces' && item.portion.pieces)
    return `${item.portion.pieces} шт. (${grams})`;
  if (item.portion.kind === 'volume' && item.portion.ml) return `${Math.round(item.portion.ml)} мл`;
  return grams;
}

function mealTitle(plan: Plan, mealId: string): string {
  return plan.structure.find((m) => m.id === mealId)?.titleRu ?? mealId;
}

const macros = (n: Readonly<Record<string, number | null>>) => ({
  kcal: round(n.energyKcal),
  proteinG: round(n.proteinG),
  fatG: round(n.fatG),
  carbsG: round(n.carbsG),
});

function dayView(env: ToolEnv, day: DayPlan, meals?: readonly string[]) {
  const tracking = env.tracking.days[day.date];
  return {
    date: day.date,
    weekday: weekdayRu(day.date),
    meals: env.plan.structure
      .filter((m) => !meals || meals.includes(m.kind))
      .map((m) => ({
        mealId: m.id,
        title: m.titleRu,
        items: (day.meals[m.id] ?? []).map((item) => ({
          itemId: item.itemId,
          name: nameOf(env, item.itemId),
          portion: portionText(item),
          ...macros(item.nutrients),
          ...(tracking?.eaten[`${m.id}:${item.itemId}`] ? { eaten: true } : {}),
        })),
      })),
    totals: macros(day.totals),
  };
}

/** Search scores below this are single description words (menu-core search: name 3, ingredient 1.5, description 0.4). */
const MIN_HIT_SCORE = 1;

const err = (error: string, hint?: string) => ({ result: { error, ...(hint ? { hint } : {}) } });

function getMenu(env: ToolEnv, args: ToolArgs<'get_menu'>): ToolOutcome {
  const days = env.plan.days.filter((d) => d.date >= args.from && d.date <= args.to).slice(0, 7);
  if (days.length === 0)
    return err(
      'no days in this range',
      `the menu covers ${env.plan.days[0]?.date} … ${env.plan.horizonEnd}`,
    );
  return { result: { days: days.map((d) => dayView(env, d, args.meals)) } };
}

function findInMenu(env: ToolEnv, args: ToolArgs<'find_in_menu'>): ToolOutcome {
  // Weak hits (one word of a description) mislead more than they help: «лазанья» found «плов» by its description.
  const all = env.search(args.query);
  const top = all[0]?.score ?? 0;
  const hits = all.filter((h) => h.score >= MIN_HIT_SCORE && h.score >= top / 2).slice(0, 6);
  const found = hits.flatMap((hit) =>
    hit.occurrences.slice(0, 14).map((o) => {
      const item = env.plan.days
        .find((d) => d.date === o.date)
        ?.meals[o.mealId]?.find((i) => i.itemId === hit.itemId);
      return {
        date: o.date,
        weekday: weekdayRu(o.date),
        meal: mealTitle(env.plan, o.mealId),
        mealId: o.mealId,
        itemId: hit.itemId,
        name: nameOf(env, hit.itemId),
        matchedIn: [...new Set(hit.spans.map((s) => s.field))].join(',') || 'category',
        ...(item ? { portion: portionText(item), ...macros(item.nutrients) } : {}),
      };
    }),
  );
  found.sort((a, b) => a.date.localeCompare(b.date));
  return { result: found.length > 0 ? { found } : { found: [], note: 'not in the menu' } };
}

function labelOf(env: ToolEnv, kind: string, id: string): string {
  if (kind === 'category')
    return (CATEGORY_IDS as readonly string[]).includes(id)
      ? CATEGORIES[id as CategoryId].labelRu
      : id;
  if (kind === 'ingredient') return env.ingredients.get(id) ?? id;
  return nameOf(env, id);
}

function resolveFoodTerms(env: ToolEnv, args: ToolArgs<'resolve_food_terms'>): ToolOutcome {
  return {
    result: {
      terms: args.terms.map((term) => {
        const matches = env
          .resolve(term)
          .slice(0, 4)
          .map((m) => ({
            kind: m.kind,
            id: m.id,
            label: labelOf(env, m.kind, m.id),
            confidence: m.confidence,
          }));
        return matches.length > 0 ? { term, matches } : { term, matches: [], unmatched: true };
      }),
    },
  };
}

const MICROS_SHOWN = [
  'fibreG',
  'freeSugarsG',
  'satFatG',
  'sodiumMg',
  'potassiumMg',
  'calciumMg',
  'ironMg',
  'vitaminCMg',
  'caffeineMg',
] as const;

function perPortion(item: ItemView, factor = 1) {
  const g = item.portion.grams * factor;
  const v = (key: string) => {
    const per100 = (item.per100g as Readonly<Record<string, number | null>>)[key];
    return per100 == null ? null : (per100 * g) / 100;
  };
  const out: Record<string, number | null> = {
    kcal: round(v('energyKcal')),
    proteinG: round(v('proteinG')),
    fatG: round(v('fatG')),
    carbsG: round(v('carbsG')),
  };
  for (const key of MICROS_SHOWN) {
    const value = v(key);
    if (value != null && value > 0) out[key] = key.endsWith('G') ? round1(value) : round(value);
  }
  return out;
}

function getItemDetails(env: ToolEnv, args: ToolArgs<'get_item_details'>): ToolOutcome {
  const item = env.items.get(args.itemId);
  if (!item)
    return err(`unknown itemId ${args.itemId}`, 'use ids from find_in_menu or resolve_food_terms');
  const plannedDay = args.date ? env.plan.days.find((d) => d.date === args.date) : undefined;
  const planned = plannedDay
    ? Object.values(plannedDay.meals)
        .flat()
        .find((i) => i.itemId === args.itemId)
    : undefined;
  return {
    result: {
      itemId: item.id,
      name: item.nameRu,
      description: item.descriptionRu,
      role: item.role,
      cookMin: item.cookMin,
      allergens: item.allergens,
      ...(item.servingAllergens.length > 0 ? { leaveOutForAllergy: item.servingAllergens } : {}),
      ...(item.traces.length > 0 ? { mayContainTraces: item.traces } : {}),
      flags: item.flags,
      ingredients: item.ingredients.map((i) => i.nameRu),
      standardPortion: { grams: Math.round(item.portion.grams), ...perPortion(item) },
      ...(planned
        ? {
            onThatDay: {
              portion: portionText(planned),
              ...macros(planned.nutrients),
            },
          }
        : {}),
      note: 'nutrition is an estimate (±10–20 %)',
    },
  };
}

function getRecipe(env: ToolEnv, args: ToolArgs<'get_recipe'>): ToolOutcome {
  const item = env.items.get(args.itemId);
  if (!item) return err(`unknown itemId ${args.itemId}`);
  return {
    result: {
      available: false,
      note: 'step-by-step recipes come with the «Рецепты» section soon; ingredients for one portion are below',
      ingredients: item.ingredients.map((i) => ({ name: i.nameRu, grams: Math.round(i.g) })),
      cookMin: item.cookMin,
    },
  };
}

function targetsView(targets: DayTargets) {
  return {
    kcal: round(targets.energyKcal),
    proteinG: {
      min: round(targets.proteinG.min),
      target: round(targets.proteinG.target),
      max: round(targets.proteinG.max),
    },
    fatG: {
      min: round(targets.fatG.min),
      target: round(targets.fatG.target),
      max: round(targets.fatG.max),
    },
    carbsG: {
      min: round(targets.carbsG.min),
      target: round(targets.carbsG.target),
      max: round(targets.carbsG.max),
    },
    fibreG: { min: round(targets.fibreG.min), target: round(targets.fibreG.target) },
    freeSugarsMaxG: round(targets.freeSugarsMaxG),
    satFatMaxG: round(targets.satFatMaxG),
    sodiumMaxMg: round(targets.sodiumMaxMg),
    saltMaxG: round1((targets.sodiumMaxMg * 2.5) / 1000),
    vegFruitMinG: round(targets.vegFruitMinG),
    waterTotalMl: round(targets.waterTotalMl),
    caffeineMaxMg: round(targets.caffeineMaxMg),
    mealProteinMinG: round(targets.mealProteinMinG),
  };
}

function getTargets(env: ToolEnv, args: ToolArgs<'get_targets'>): ToolOutcome {
  const date = args.date ?? env.today;
  const day = env.plan.days.find((d) => d.date === date);
  const water = day ? drinking(day, env.plan.targets, env.tracking.days[date]) : null;
  return {
    result: {
      date,
      ...targetsView(env.plan.targets),
      ...(water
        ? {
            drinkingMl: round(water.targetMl),
            drinkingGlasses: water.targetGlasses,
            glassMl: env.plan.targets.glassMl,
          }
        : {}),
      note: 'targets by the engine (nutrition-core); estimates',
    },
  };
}

function getProgress(env: ToolEnv, args: ToolArgs<'get_progress'>): ToolOutcome {
  const day = env.plan.days.find((d) => d.date === args.date);
  if (!day) return err('no such day in the menu');
  const tracking = env.tracking.days[args.date];
  const eaten = totals(day, { eatenOnly: true, ...(tracking ? { tracking } : {}) });
  const planned = totals(day);
  const water = drinking(day, env.plan.targets, tracking);
  return {
    result: {
      date: args.date,
      weekday: weekdayRu(args.date),
      status: dayStatus(env.plan, args.date, env.tracking, env.today),
      eaten: macros(eaten),
      planned: macros(planned),
      target: {
        kcal: round(env.plan.targets.energyKcal),
        proteinG: round(env.plan.targets.proteinG.target),
      },
      water: {
        drunkMl: round(water.drunkMl),
        targetMl: round(water.targetMl),
        glassMl: env.plan.targets.glassMl,
      },
    },
  };
}

type Answers = {
  readonly goal?: { readonly goal?: string; readonly targetWeightKg?: number };
  readonly diet?: string;
  readonly body?: {
    readonly weightKg?: number;
    readonly heightCm?: number;
    readonly ageYears?: number;
    readonly mode?: string;
  };
};

/**
 * Neutral words for the excluded allergen groups. What goes to the model never says «аллергия» or names a level —
 * that is health data (152-ФЗ ст. 10; ADR 0003, stage 4 addendum; review of phase 5, M9). The engine keeps them as
 * hard exclusions either way.
 */
export const NOT_USE_RU: Readonly<Record<string, string>> = {
  GLUTEN: 'глютен (пшеница, рожь, ячмень)',
  CRUSTACEAN: 'ракообразные',
  MOLLUSC: 'моллюски',
  FISH: 'рыба',
  EGG: 'яйца',
  MILK: 'молоко и молочное',
  TREE_NUT: 'орехи',
  PEANUT: 'арахис',
  SOY: 'соя',
  CELERY: 'сельдерей',
  MUSTARD: 'горчица',
  SESAME: 'кунжут',
  SULPHITES: 'сульфиты',
  LUPIN: 'люпин',
  ASPARTAME: 'аспартам',
};

/** Everything the menu never uses, in plain neutral words (one list for the digest and the profile tool). */
export function notUseList(env: ToolEnv): string[] {
  const s = env.engine.profile.safety;
  return [
    ...new Set([
      ...[...s.allergens.keys()].map((a) => NOT_USE_RU[a] ?? a.toLowerCase()),
      ...[...s.excluded.categories].map((c) => CATEGORIES[c].labelRu),
      ...[...s.excluded.ingredientIds].map((i) => env.ingredients.get(i) ?? i),
      ...[...s.excluded.itemIds].map((i) => nameOf(env, i)),
    ]),
  ];
}

function getProfileSummary(env: ToolEnv): ToolOutcome {
  const { profile } = env.engine;
  const answers = env.answers as Answers;
  const s = profile.safety;
  const audience = answers.body?.mode === 'family' ? 'family' : s.ageYears < 18 ? 'teen' : 'adult';
  return {
    result: {
      goal: profile.goal,
      allowedGoals: profile.decision.allowedGoals,
      diet: s.diet,
      notUse: notUseList(env),
      meals: env.plan.structure.map((m) => ({ mealId: m.id, kind: m.kind, title: m.titleRu })),
      rules: env.plan.rules.map((r) => ({
        id: r.id,
        text: r.textRu,
        active: r.active,
        by: r.createdBy,
      })),
      safety: {
        audience,
        deemphasizeNumbers: s.deemphasizeNumbers,
        noWeightGoals: !profile.decision.allowedGoals.includes('lose'),
        minMainMeals: s.minMainMeals,
      },
      // The quiz's free text never leaves the browser (it may name a condition): only that some words were not
      // understood, so Kiki asks the person what to leave out (M9).
      ...(profile.unmatchedAllergies.length + profile.unmatchedDislikes.length > 0
        ? {
            unclearExclusions:
              'some words from the quiz were not matched to foods — ask the person what else to leave out',
          }
        : {}),
    },
  };
}

/** A model rule → a DSL rule (id, author) or a readable problem. */
export function toRule(
  env: ToolEnv,
  input: RuleInput,
  index: number,
): { ok: true; rule: Rule } | { ok: false; error: string } {
  const target = input.target
    ? Object.fromEntries(
        Object.entries(input.target).filter(([, v]) => v !== undefined && v !== ''),
      )
    : undefined;
  if (target && Object.keys(target).length !== 1)
    return {
      ok: false,
      error: `rule ${index + 1}: target needs exactly one of itemId, category, ingredientId`,
    };
  const check = (t: Record<string, string> | undefined): string | null => {
    if (!t) return null;
    if (t.itemId !== undefined && !env.items.has(t.itemId)) return `unknown itemId ${t.itemId}`;
    if (t.category !== undefined && !(CATEGORY_IDS as readonly string[]).includes(t.category))
      return `unknown category ${t.category}`;
    if (t.ingredientId !== undefined && !env.ingredients.has(t.ingredientId))
      return `unknown ingredientId ${t.ingredientId}`;
    return null;
  };
  const problem =
    check(target as Record<string, string> | undefined) ??
    (input.itemId !== undefined && !env.items.has(input.itemId)
      ? `unknown itemId ${input.itemId}`
      : null) ??
    (input.from !== undefined && !(CATEGORY_IDS as readonly string[]).includes(input.from)
      ? `unknown category ${input.from}`
      : null) ??
    (input.to !== undefined && !(CATEGORY_IDS as readonly string[]).includes(input.to)
      ? `unknown category ${input.to}`
      : null);
  if (problem)
    return { ok: false, error: `rule ${index + 1}: ${problem} — use ids from resolve_food_terms` };
  const days =
    input.days?.kind === 'weekdaysOf'
      ? { kind: 'weekdaysOf', days: input.days.days ?? [] }
      : input.days?.kind === 'dates'
        ? { kind: 'dates', dates: input.days.dates ?? [] }
        : input.days
          ? { kind: input.days.kind }
          : undefined;
  const candidate = Object.fromEntries(
    Object.entries({
      ...input,
      target,
      days,
      id: `k-${stableHash(JSON.stringify(input)).slice(0, 10)}-${index}`,
      createdBy: 'kiki',
      active: true,
    }).filter(([, v]) => v !== undefined),
  );
  const parsed = ruleSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `rule ${index + 1} (${input.kind}): ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid'}`,
    };
  }
  return { ok: true, rule: parsed.data };
}

const OP_HINTS: Partial<Record<string, string>> = {
  rulesConflict: 'explain the conflicts honestly in plain words; offer another way',
  noCandidates:
    'the rules leave a meal without dishes — suggest a softer rule (preferLess) or fewer days',
  structureRejected: 'the meal set breaks a safety rule (too few main meals or too many meals)',
  mealHasEaten: 'a meal with eaten dishes today cannot be removed until tomorrow',
  notAllowed: 'this dish is not allowed for the user (safety filter)',
  stalePlan: 'the menu must be regenerated first («Перегенерировать меню»)',
};

function opFailure(error: OpError) {
  const hint = OP_HINTS[error.code];
  return { result: { error: error.code, detail: error, ...(hint ? { hint } : {}) } };
}

function propose(
  env: ToolEnv,
  op: PreviewOp,
  outcome: OpResult,
  extra: { reasonRu?: string; targetsAfter?: DayTargets } = {},
): ToolOutcome {
  if (!outcome.ok) return opFailure(outcome.error);
  const preview = buildPreview({
    id: env.nextPreviewId(),
    op,
    base: env.plan,
    plan: outcome.value.plan,
    diff: outcome.value.diff,
    names: (id) => nameOf(env, id),
    ...extra,
  });
  return {
    result: { previewId: preview.id, summaryRu: preview.summaryRu, stats: preview.stats },
    previews: [preview],
  };
}

const opOptions = (env: ToolEnv) => ({ today: env.today, tracking: env.tracking });

function proposeMenuChange(env: ToolEnv, args: ToolArgs<'propose_menu_change'>): ToolOutcome {
  const remove = new Set(args.removeRuleIds ?? []);
  const unknown = [...remove].filter((id) => !env.plan.rules.some((r) => r.id === id));
  if (unknown.length > 0)
    return err(`unknown rule ids ${unknown.join(', ')}`, 'see get_profile_summary');
  if (args.rules.length === 0 && remove.size === 0) return err('nothing to change');
  const added: Rule[] = [];
  for (const [i, input] of args.rules.entries()) {
    const r = toRule(env, input, i);
    if (!r.ok) return err(r.error);
    added.push(r.rule);
  }
  const rules = [...env.plan.rules.filter((r) => !remove.has(r.id)), ...added];
  return propose(
    env,
    { kind: 'rules', rules },
    applyRules(env.engine, env.plan, rules, opOptions(env)),
    {
      reasonRu: args.reasonRu,
    },
  );
}

function proposeGoalChange(env: ToolEnv, args: ToolArgs<'propose_goal_change'>): ToolOutcome {
  const answers = env.answers as Answers & Record<string, unknown>;
  const body = answers.body;
  if (!body?.weightKg || !body.heightCm || !body.ageYears)
    return err('no quiz answers on this device');
  if (args.goal === 'habits') return err('habits is not a goal of the quiz', 'use maintain');
  if (!env.engine.profile.decision.allowedGoals.includes(args.goal))
    return err(
      `goal ${args.goal} is not available for this user (safety rules)`,
      `allowed: ${env.engine.profile.decision.allowedGoals.join(', ')}`,
    );
  let goal: { goal: string; targetWeightKg?: number } = { goal: args.goal };
  if (args.goal !== 'maintain') {
    const bounds = targetWeightBoundsKg({
      goal: args.goal,
      currentKg: body.weightKg,
      heightCm: body.heightCm,
      ageYears: body.ageYears,
    });
    if (!bounds) return err(`goal ${args.goal} has no safe target weight for this user`);
    const fallback = args.goal === 'lose' ? bounds.maxKg : bounds.minKg;
    const wanted = args.targetWeightKg ?? answers.goal?.targetWeightKg ?? fallback;
    if (wanted < bounds.minKg || wanted > bounds.maxKg)
      return err(`target weight outside the safe range ${bounds.minKg}–${bounds.maxKg} kg`);
    goal = { goal: args.goal, targetWeightKg: wanted };
  }
  const next = { ...answers, goal };
  const profile = buildMenuProfile(next, { foods: env.foods });
  if (!profile.ok) return err(`profile: ${profile.error.code}`);
  const engine = { profile: profile.value, foods: env.foods };
  return propose(
    env,
    { kind: 'goal', answers: next },
    regenerate(engine, env.plan, opOptions(env)),
    { targetsAfter: profile.value.targets },
  );
}

function proposeMealStructure(env: ToolEnv, args: ToolArgs<'propose_meal_structure'>): ToolOutcome {
  const min = env.engine.profile.safety.minMainMeals;
  let structure: readonly Meal[] = env.plan.structure;
  for (const id of args.remove ?? []) {
    const r = removeMeal(structure, id, min);
    if (!r.ok) return err(`cannot remove ${id}: ${r.error.code}`);
    structure = r.value;
  }
  for (const kind of args.add ?? []) {
    const r = addMeal(structure, kind);
    if (!r.ok) return err(`cannot add ${kind}: ${r.error.code}`);
    structure = r.value;
  }
  for (const [index, id] of (args.order ?? []).entries()) {
    const r = moveMeal(structure, id, index);
    if (!r.ok) return err(`cannot move ${id}: ${r.error.code}`);
    structure = r.value;
  }
  return propose(
    env,
    { kind: 'structure', structure },
    setStructure(env.engine, env.plan, structure, opOptions(env)),
  );
}

function proposeAlternatives(env: ToolEnv, args: ToolArgs<'propose_alternatives'>): ToolOutcome {
  const day = env.plan.days.find((d) => d.date === args.date);
  const index = day?.meals[args.mealId]?.findIndex((i) => i.itemId === args.itemId) ?? -1;
  if (!day || index < 0) return err('this dish is not in that meal', 'use find_in_menu');
  const slot: SlotRef = { date: args.date, meal: args.mealId, index };
  const options = alternatives(env.engine, env.plan, slot, args.k, env.tracking);
  if (!options.ok) return opFailure(options.error);
  const previews: Preview[] = [];
  const out: unknown[] = [];
  for (const alt of options.value) {
    const outcome = propose(
      env,
      { kind: 'replace', slot, itemId: alt.itemId },
      replaceItem(env.engine, env.plan, slot, alt.itemId, opOptions(env)),
    );
    const preview = outcome.previews?.[0];
    if (!preview) continue;
    previews.push(preview);
    out.push({
      previewId: preview.id,
      itemId: alt.itemId,
      name: nameOf(env, alt.itemId),
      reasons: alt.reasons,
      dayKcalAfter: round(alt.dayTotalsAfter.energyKcal),
    });
  }
  return {
    result: { replacing: nameOf(env, args.itemId), options: out },
    previews,
  };
}

const NUMBER_WORD = /kcal|energy|protein|fat|carb|fib|sugar|salt|sodium|gram|percent/i;
const NUMBER_UNIT = /(G|Mg|Ug|Ml|Kcal|Pct)$/;
const NUMBER_TEXT = /\d[\d\s\u00a0,.]*\s?(ккал|г|мг|мкг|мл|л|%)(?![а-яё])/iu;

/**
 * deemphasizeNumbers (an eating-disorder history and similar, nutrition-core guardrails): the model never receives
 * calories or grams — not in the digest, not from a tool — so it cannot show them even when asked. Numbers of things
 * (days, meals, glasses) stay.
 */
export function withoutNutritionNumbers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNutritionNumbers);
  if (typeof value === 'string')
    return value
      .split(/(?<=[.;!?])\s+/)
      .filter((sentence) => !NUMBER_TEXT.test(sentence))
      .join(' ');
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === 'number' && (NUMBER_WORD.test(key) || NUMBER_UNIT.test(key))) continue;
      out[key] = withoutNutritionNumbers(v);
    }
    return out;
  }
  return value;
}

/** Runs one client tool; `argsText` as the model wrote it. Throws nothing: problems become `{ error }` results. */
export function executeTool(env: ToolEnv, name: ToolName, args: unknown): ToolOutcome {
  const outcome = runTool(env, name, args);
  if (!env.engine.profile.safety.deemphasizeNumbers) return outcome;
  return {
    ...outcome,
    result: {
      ...(withoutNutritionNumbers(outcome.result) as Record<string, unknown>),
      numbersHidden:
        'deemphasizeNumbers: never write kcal or grams; talk about regular, varied meals',
    },
  };
}

/** Proposals that can be re-run on a changed menu from their call (alternatives keep their exact slot instead). */
const RERUNNABLE = new Set<ToolName>([
  'propose_menu_change',
  'propose_goal_change',
  'propose_meal_structure',
]);

function runTool(env: ToolEnv, name: ToolName, args: unknown): ToolOutcome {
  const parsed = parseToolArgs(name, typeof args === 'string' ? args : JSON.stringify(args ?? {}));
  if (!parsed.ok) return err(parsed.error);
  const outcome = runParsed(env, name, parsed);
  if (!RERUNNABLE.has(name) || !outcome.previews) return outcome;
  return {
    ...outcome,
    previews: outcome.previews.map((p) => ({ ...p, call: { name, args: parsed.args } })),
  };
}

function runParsed(
  env: ToolEnv,
  name: ToolName,
  parsed: Extract<ReturnType<typeof parseToolArgs>, { ok: true }>,
): ToolOutcome {
  try {
    switch (name) {
      case 'get_menu':
        return getMenu(env, parsed.args as ToolArgs<'get_menu'>);
      case 'find_in_menu':
        return findInMenu(env, parsed.args as ToolArgs<'find_in_menu'>);
      case 'resolve_food_terms':
        return resolveFoodTerms(env, parsed.args as ToolArgs<'resolve_food_terms'>);
      case 'get_item_details':
        return getItemDetails(env, parsed.args as ToolArgs<'get_item_details'>);
      case 'get_recipe':
        return getRecipe(env, parsed.args as ToolArgs<'get_recipe'>);
      case 'get_targets':
        return getTargets(env, parsed.args as ToolArgs<'get_targets'>);
      case 'get_progress':
        return getProgress(env, parsed.args as ToolArgs<'get_progress'>);
      case 'get_profile_summary':
        return getProfileSummary(env);
      case 'propose_menu_change':
        return proposeMenuChange(env, parsed.args as ToolArgs<'propose_menu_change'>);
      case 'propose_goal_change':
        return proposeGoalChange(env, parsed.args as ToolArgs<'propose_goal_change'>);
      case 'propose_meal_structure':
        return proposeMealStructure(env, parsed.args as ToolArgs<'propose_meal_structure'>);
      case 'propose_alternatives':
        return proposeAlternatives(env, parsed.args as ToolArgs<'propose_alternatives'>);
      default:
        return err(`${name} is not a browser tool`);
    }
  } catch (error) {
    return err(`tool failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
