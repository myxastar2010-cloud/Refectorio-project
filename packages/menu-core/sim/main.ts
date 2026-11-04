/**
 * The menu simulation (ТЗ фаза 3 §10): N random valid people → a plan each (the full search) → distributions of
 * energy and protein fit, food-group quotas, variety, taste fit, flags and runtime; risk groups and worst cases.
 *   npm run menu:sim -- --personas 5000 --out <dir> [--iterations 300] [--threads 16]
 * Writes <out>/menu-sim.json (aggregates + compact rows) and <out>/menu-sim.md (Russian report).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import path from 'node:path';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { buildContext } from '../src/context';
import type { QuizAnswersV1 } from '@refectorio/contracts';
import { createRandom } from '@refectorio/taste-core';
import { addDays, daysBetween } from '../src/dates';
import { ruleSchema, type Rule } from '../src/dsl';
import type { FoodIndex } from '../src/foods';
import { generate } from '../src/generate';
import {
  alternatives,
  applyRules,
  changeTargets,
  replaceItem,
  type Engine,
  type OpResult,
} from '../src/operations';
import { buildMenuProfile, type MenuProfile } from '../src/profile';
import { rule } from '../src/rules';
import { mealShares, structureFromKinds } from '../src/structure';
import { EMPTY_TRACKING, markEaten } from '../src/tracking';
import type { MealKind, Plan } from '../src/types';
import { likeProbability } from '../src/taste';
import { randomAnswers, testFoods } from '../src/testing';
import { hardViolations, type IsFact } from '../src/validate';

type Row = {
  seed: number;
  ok: boolean;
  error?: string;
  groups: string[];
  targetKcal: number;
  days: number;
  energyDevMeanPct: number;
  energyDevMaxPct: number;
  within5: number;
  within10: number;
  protein: number;
  fat: number;
  carbs: number;
  fibre: number;
  sodium: number;
  sugar: number;
  satFat: number;
  vegFruit: number;
  fishWeeks: number | null;
  /** Full weeks whose average sodium is within the limit (+5 %): the engine holds the week, not the day (D-084). */
  sodiumWeeks: number;
  redMeatWeeks: number;
  flags: Record<string, number>;
  notes: string[];
  violations: number;
  /** Operations on the plan for every 10th person (M4); null — not run. */
  ops: Ops | null;
  /** Days with at least one repeat flag (m17). */
  repeatDays: number;
  /** Property checks (ТЗ фаза 3 §10): days off by > 10 % without an energy flag, main or soup repeats within the week
   * without the repeat flag, and — for every 50th person — the same plan from the same inputs and seed. */
  unflaggedEnergy: number;
  unflaggedRepeats: number;
  deterministic: boolean | null;
  structure: string;
  tasteCore: number;
  tasteAllowedMean: number;
  tasteAllowedTop: number;
  /** Planned core mains / allowed mains the person probably dislikes (P(like) < 0,4). */
  dislikedCore: number;
  dislikedAllowed: number;
  variety: number;
  /** How a person would read the meals (ТЗ фаза 3 §3.2 templates): see `plausibility`. */
  plaus: Plausibility;
  ms: number;
};

type Plausibility = {
  /** Core mains half a portion or more away from the person's scale (target ÷ 2200 kcal, 0,5–1,5). */
  oddCore: number;
  /** Lunches with a soup. */
  soupLunch: number;
  /** Sweet drinks (free sugars ≥ P.sweetDrinkFreeSugarsG) a day. */
  sweetDrinks: number;
  /** Meals with bread next to a starchy core or side and no soup. */
  breadStarch: number;
  /** Mean |meal share − target|, percentage points. */
  shareDevPp: number;
  itemsPerMeal: number;
};

const NO_PLAUS: Plausibility = {
  oddCore: 0,
  soupLunch: 0,
  sweetDrinks: 0,
  breadStarch: 0,
  shareDevPp: 0,
  itemsPerMeal: 0,
};

function plausibility(
  targetKcal: number,
  plan: {
    days: readonly {
      meals: Readonly<
        Record<
          string,
          readonly {
            itemId: string;
            slot: string;
            role: string;
            portion: { factor: number };
            nutrients: { energyKcal: number | null };
          }[]
        >
      >;
    }[];
    structure: readonly { id: string; kind: string }[];
  },
  foods: ReturnType<typeof testFoods>,
): Plausibility {
  const shares = mealShares(plan.structure as Parameters<typeof mealShares>[0]);
  const scale = Math.min(1.5, Math.max(0.5, targetKcal / 2200));
  let cores = 0;
  let odd = 0;
  let lunches = 0;
  let soups = 0;
  let sweet = 0;
  let meals = 0;
  let breadStarch = 0;
  let dev = 0;
  let items = 0;
  for (const day of plan.days) {
    const dayKcal = Object.values(day.meals)
      .flat()
      .reduce((sum, i) => sum + (i.nutrients.energyKcal ?? 0), 0);
    for (const meal of plan.structure) {
      const list = day.meals[meal.id] ?? [];
      meals += 1;
      items += list.length;
      const kcal = list.reduce((sum, i) => sum + (i.nutrients.energyKcal ?? 0), 0);
      if (dayKcal > 0) dev += Math.abs(kcal / dayKcal - (shares.get(meal.id) ?? 0)) * 100;
      if (meal.kind === 'lunch') {
        lunches += 1;
        if (list.some((i) => i.role === 'soup')) soups += 1;
      }
      let starch = false;
      for (const i of list) {
        const f = foods.byId.get(i.itemId);
        if (!f) continue;
        if (i.slot === 'core' && i.role === 'main') {
          cores += 1;
          if (Math.abs(i.portion.factor - scale) >= 0.5 - 1e-9) odd += 1;
        }
        if (
          i.role === 'drink' &&
          (f.item.perPortion.freeSugarsG ?? 0) >= rule('P.sweetDrinkFreeSugarsG')
        )
          sweet += 1;
        if ((i.slot === 'core' || i.slot === 'side') && f.features.carbBase !== 'none')
          starch = true;
      }
      if (starch && list.some((i) => i.role === 'bread') && !list.some((i) => i.role === 'soup'))
        breadStarch += 1;
    }
  }
  return {
    oddCore: round(cores ? odd / cores : 0),
    soupLunch: round(lunches ? soups / lunches : 0),
    sweetDrinks: round(plan.days.length ? sweet / plan.days.length : 0, 2),
    breadStarch: round(meals ? breadStarch / meals : 0),
    shareDevPp: round(meals ? dev / meals : 0, 2),
    itemsPerMeal: round(meals ? items / meals : 0, 2),
  };
}

/** Day structures the people pick (as in properties.test.ts): the default, three meals, two snacks, two meals. */
const STRUCTURES: readonly (readonly MealKind[])[] = [
  ['breakfast', 'lunch', 'snack', 'dinner'],
  ['breakfast', 'lunch', 'dinner'],
  ['breakfast', 'snack', 'lunch', 'snack', 'dinner'],
  ['breakfast', 'lunch', 'snack', 'dinner'],
  ['lunch', 'dinner'],
];

type Job = { seeds: number[]; iterations: number; today: string[] };

/** The operations a person or Kiki runs on a plan, re-checked by the validator (review of phase 3, M4). */
type Ops = { checked: number; violations: number; refused: string[] };
const OPS_ITERATIONS = 60;

/**
 * Two days after the plan was made: (1) breakfast marked eaten, then an allergy to something on the coming days →
 * changeTargets; (2) 1–3 random rules (exclude a planned dish, a category, a caffeine cap, prefer less) →
 * applyRules; (3) the best alternative put into a coming lunch → replaceItem. Every result goes through the validator
 * with the new profile and rules; refusals are counted by code (a refusal is honest, a violation is a bug).
 */
function operationScenarios(
  seed: number,
  answers: QuizAnswersV1,
  profile: MenuProfile,
  plan: Plan,
  foods: FoodIndex,
): Ops {
  const ops: Ops = { checked: 0, violations: 0, refused: [] };
  const rng = createRandom((seed ^ 0x2f6b) >>> 0);
  const today = addDays(plan.createdAt, 2);
  const options = { today, iterationsPerDay: OPS_ITERATIONS };
  const coming = plan.days.filter((d) => d.date >= today);
  const check = (engine: Engine, result: OpResult, isFact?: IsFact) => {
    if (!result.ok) {
      ops.refused.push(result.error.code);
      return;
    }
    const next = result.value.plan;
    const ctx = buildContext(engine.profile, foods, next.structure, next.rules);
    const fresh = next.days.filter((d) => d.date >= today);
    const past = next.days.filter((d) => d.date < today);
    ops.checked += 1;
    ops.violations += hardViolations(ctx, fresh, past, isFact).length;
  };

  // (1) Eaten breakfast, then a new allergy.
  const firstMeal = plan.structure[0]?.id ?? 'breakfast';
  const eatenItem = coming[0]?.meals[firstMeal]?.[0];
  const tracking =
    eatenItem && coming[0]
      ? markEaten(
          EMPTY_TRACKING,
          plan,
          today,
          firstMeal,
          eatenItem.itemId,
          true,
          `${today}T08:00:00.000Z`,
          today,
        )
      : null;
  const planned = coming.flatMap((d) => Object.values(d.meals).flat());
  const allergen = planned
    .flatMap((i) => foods.byId.get(i.itemId)?.item.allergens ?? [])
    .find((code) => !answers.allergies.items.some((a) => a.code === code));
  if (allergen) {
    const changed = buildMenuProfile(
      {
        ...answers,
        allergies: {
          ...answers.allergies,
          items: [...answers.allergies.items, { code: allergen, level: 'allergy' }],
        },
      },
      { foods },
    );
    if (changed.ok) {
      const engine = { profile: changed.value, foods };
      const facts: IsFact = (date, mealId, itemId) =>
        tracking?.ok === true &&
        date === today &&
        mealId === firstMeal &&
        itemId === eatenItem?.itemId;
      check(
        engine,
        changeTargets(engine, plan, {
          ...options,
          ...(tracking?.ok ? { tracking: tracking.value } : {}),
        }),
        facts,
      );
    }
  }

  // (2) Random rules.
  const engine = { profile, foods };
  const rules: Rule[] = [];
  const pick = <T>(list: readonly T[]): T | undefined => list[rng.int(Math.max(1, list.length))];
  const count = 1 + rng.int(3);
  for (let i = 0; i < count; i += 1) {
    const base = { id: `sim${i}`, createdBy: 'kiki', textRu: 'Правило симуляции', active: true };
    const kind = rng.int(4);
    const item = pick(planned);
    const category = pick([...(foods.byId.get(item?.itemId ?? '')?.categories ?? [])]);
    const body =
      kind === 0 && item
        ? { kind: 'excludeItem', itemId: item.itemId }
        : kind === 1 && category
          ? { kind: 'excludeIngredient', target: { category } }
          : kind === 2
            ? { kind: 'maxNutrient', nutrient: 'caffeineMg', per: 'day', value: 20 + rng.int(150) }
            : { kind: 'preferLess', target: { category: category ?? 'sugar' } };
    const parsed = ruleSchema.safeParse({ ...base, ...body });
    if (parsed.success) rules.push(parsed.data);
  }
  check(engine, applyRules(engine, plan, rules, options));

  // (3) The best alternative for a coming lunch (or the first main meal).
  const date = coming[1]?.date;
  const meal = plan.structure.find((m) => m.kind === 'lunch') ?? plan.structure[0];
  if (date && meal) {
    const index = coming[1]?.meals[meal.id]?.findIndex((i) => i.slot === 'core') ?? -1;
    if (index >= 0) {
      const slot = { date, meal: meal.id, index };
      const alts = alternatives(engine, plan, slot, 3);
      if (!alts.ok) ops.refused.push(alts.error.code);
      else if (alts.value[0])
        check(engine, replaceItem(engine, plan, slot, alts.value[0].itemId, { today }));
    }
  }
  return ops;
}

const share = (xs: readonly boolean[]) =>
  xs.length === 0 ? 1 : xs.filter(Boolean).length / xs.length;
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

function runOne(seed: number, iterations: number, today: string): Row {
  const foods = testFoods();
  const answers = randomAnswers(seed);
  const profile = buildMenuProfile(answers, { foods });
  const base: Row = {
    seed,
    ok: false,
    groups: [],
    targetKcal: 0,
    days: 0,
    energyDevMeanPct: 0,
    energyDevMaxPct: 0,
    within5: 0,
    within10: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    fibre: 0,
    sodium: 0,
    sugar: 0,
    satFat: 0,
    vegFruit: 0,
    fishWeeks: null,
    sodiumWeeks: 0,
    redMeatWeeks: 0,
    flags: {},
    notes: [],
    violations: 0,
    ops: null,
    repeatDays: 0,
    unflaggedEnergy: 0,
    unflaggedRepeats: 0,
    deterministic: null,
    structure: '',
    tasteCore: 0,
    tasteAllowedMean: 0,
    tasteAllowedTop: 0,
    dislikedCore: 0,
    dislikedAllowed: 0,
    variety: 0,
    plaus: NO_PLAUS,
    ms: 0,
  };
  if (!profile.ok) return { ...base, error: `profile:${profile.error.code}` };
  const p = profile.value;
  const groups: string[] = [];
  const s = p.safety;
  if (s.diet === 'vegan') groups.push('vegan');
  if (s.diet === 'vegan' && s.allergens.size >= 2) groups.push('veganMultiAllergy');
  if (s.allergens.size > 0) groups.push('allergy');
  if (s.ageYears < 18) groups.push('teen');
  if (s.ageYears >= 65) groups.push('65plus');
  if (s.pregnant) groups.push('pregnancy');
  if (s.lactating) groups.push('lactation');
  if (p.macroProfile === 'keto') groups.push('keto');
  if (s.deemphasizeNumbers) groups.push('eatingDisorder');
  if (p.targets.energyKcal >= 3500) groups.push('energy3500plus');
  if (p.targets.energyKcal <= 1300) groups.push('energy1300minus');
  const started = performance.now();
  // m16: a person who needs three main meals (teen, pregnancy, an eating disorder) would pick a structure the quiz
  // allows them, so a two-meal pick falls back to the default instead of counting as a refusal.
  const picked = STRUCTURES[seed % STRUCTURES.length] ?? STRUCTURES[0] ?? [];
  const kinds =
    picked.filter((k) => k !== 'snack').length < s.minMainMeals
      ? (STRUCTURES[0] ?? picked)
      : picked;
  const request = {
    profile: p,
    foods,
    today,
    seed,
    iterationsPerDay: iterations,
    structure: structureFromKinds(kinds),
  };
  const result = generate(request);
  const ms = performance.now() - started;
  if (!result.ok)
    return {
      ...base,
      groups,
      targetKcal: p.targets.energyKcal,
      error: `plan:${result.error.code}`,
      ms,
    };
  const plan = result.value.plan;
  const t = plan.targets;
  const ctx = buildContext(p, foods, plan.structure, []);
  const violations = hardViolations(ctx, plan.days).length;
  let unflaggedEnergy = 0;
  let unflaggedRepeats = 0;
  plan.days.forEach((day, d) => {
    const codes = day.flags.map((f) => f.code);
    const dev = (day.totals.energyKcal ?? 0) / t.energyKcal - 1;
    if (
      Math.abs(dev) > rule('S.energyToleranceRelaxedShare') &&
      !codes.includes(dev < 0 ? 'energyLow' : 'energyHigh')
    )
      unflaggedEnergy += 1;
    for (const [mealId, items] of Object.entries(day.meals))
      for (const item of items.filter((i) => i.role === 'main' || i.role === 'soup')) {
        const repeated = plan.days
          .slice(0, d)
          .some(
            (q) =>
              daysBetween(q.date, day.date) < rule('E19.repeatWindowDays') &&
              (q.meals[mealId] ?? []).some((x) => x.itemId === item.itemId),
          );
        if (repeated && !codes.includes('repeatRelaxed')) unflaggedRepeats += 1;
      }
  });
  let deterministic: boolean | null = null;
  if (seed % 50 === 0) {
    const again = generate(request);
    deterministic = again.ok && JSON.stringify(again.value.plan) === JSON.stringify(plan);
  }
  const devs = plan.days.map((d) => Math.abs((d.totals.energyKcal ?? 0) / t.energyKcal - 1));
  const val = (d: (typeof plan.days)[number], k: keyof (typeof d)['totals']) => d.totals[k];
  const flags: Record<string, number> = {};
  for (const d of plan.days) for (const f of d.flags) flags[f.code] = (flags[f.code] ?? 0) + 1;
  const weeks = new Map<string, typeof plan.days>();
  for (const d of plan.days) {
    const key = String(Math.floor(daysBetween('2026-01-05', d.date) / 7));
    weeks.set(key, [...(weeks.get(key) ?? []), d]);
  }
  const full = [...weeks.values()].filter((w) => w.length >= 5);
  const fishGOf = (w: typeof plan.days) =>
    w
      .flatMap((d) => Object.values(d.meals).flat())
      .reduce(
        (sum, i) => sum + (foods.byId.get(i.itemId)?.groups.fishG ?? 0) * i.portion.factor,
        0,
      );
  const redOf = (w: typeof plan.days) =>
    w
      .flatMap((d) => Object.values(d.meals).flat())
      .reduce(
        (sum, i) => sum + (foods.byId.get(i.itemId)?.groups.redMeatRawG ?? 0) * i.portion.factor,
        0,
      );
  const cores = plan.days.flatMap((d) =>
    Object.values(d.meals)
      .flat()
      .filter((i) => i.slot === 'core' && i.role === 'main'),
  );
  const allowedMains = ctx.foods
    .map((f, i) => [f, i] as const)
    .filter(([f, i]) => f.role === 'main' && ctx.verdicts[i]?.ok === true)
    .map(([f]) => likeProbability(f, p.taste))
    .sort((a, b) => b - a);
  const like = (id: string) => {
    const f = foods.byId.get(id);
    return f ? likeProbability(f, p.taste) : 0.5;
  };
  const vegFruit = (d: (typeof plan.days)[number]) =>
    Object.values(d.meals)
      .flat()
      .reduce(
        (sum, i) => sum + (foods.byId.get(i.itemId)?.groups.vegFruitG ?? 0) * i.portion.factor,
        0,
      );
  return {
    ...base,
    ok: true,
    groups,
    targetKcal: round(t.energyKcal, 0),
    days: plan.days.length,
    energyDevMeanPct: round((devs.reduce((a, b) => a + b, 0) / devs.length) * 100, 2),
    energyDevMaxPct: round(Math.max(...devs) * 100, 2),
    within5: round(share(devs.map((x) => x <= 0.05))),
    within10: round(share(devs.map((x) => x <= 0.1))),
    protein: round(share(plan.days.map((d) => (val(d, 'proteinG') ?? 0) >= t.proteinG.min * 0.95))),
    fat: round(
      share(
        plan.days.map(
          (d) =>
            (val(d, 'fatG') ?? 0) >= t.fatG.min * 0.95 &&
            (val(d, 'fatG') ?? 0) <= t.fatG.max * 1.05,
        ),
      ),
    ),
    carbs: round(
      share(
        plan.days.map(
          (d) =>
            (val(d, 'carbsG') ?? 0) >= t.carbsG.min * 0.95 &&
            (val(d, 'carbsG') ?? 0) <= t.carbsG.max * 1.05,
        ),
      ),
    ),
    fibre: round(
      share(
        plan.days.map(
          (d) => val(d, 'fibreG') === null || (val(d, 'fibreG') ?? 0) >= t.fibreG.min * 0.95,
        ),
      ),
    ),
    sodium: round(
      share(
        plan.days.map(
          (d) => val(d, 'sodiumMg') === null || (val(d, 'sodiumMg') ?? 0) <= t.sodiumMaxMg * 1.05,
        ),
      ),
    ),
    sugar: round(
      share(
        plan.days.map(
          (d) => t.freeSugarsMaxG === 0 || (val(d, 'freeSugarsG') ?? 0) <= t.freeSugarsMaxG * 1.05,
        ),
      ),
    ),
    satFat: round(share(plan.days.map((d) => (val(d, 'satFatG') ?? 0) <= t.satFatMaxG * 1.05))),
    vegFruit: round(
      share(plan.days.map((d) => t.vegFruitMinG === 0 || vegFruit(d) >= t.vegFruitMinG * 0.8)),
    ),
    fishWeeks:
      ctx.fishAllowed && full.length > 0
        ? round(
            share(
              full.map((w) => fishGOf(w) >= rule('E10.fishTargetGWeek') * (w.length / 7) * 0.9),
            ),
          )
        : null,
    sodiumWeeks: round(
      share(
        full.map(
          (w) =>
            w.reduce((sum, d) => sum + (d.totals.sodiumMg ?? 0), 0) / w.length <=
            t.sodiumMaxMg * 1.05,
        ),
      ),
    ),
    redMeatWeeks: round(
      share(
        full.map(
          (w) =>
            redOf(w) * rule('E22.redMeatCookedPerRawG') <=
            rule('E22.redMeatMaxCookedGWeek') * (w.length / 7) * 1.05,
        ),
      ),
    ),
    flags,
    notes: plan.notes.map((n) => n.code),
    violations,
    ops: seed % 10 === 0 ? operationScenarios(seed, answers, p, plan, foods) : null,
    repeatDays: plan.days.filter((d) => d.flags.some((f) => f.code === 'repeatRelaxed')).length,
    unflaggedEnergy,
    unflaggedRepeats,
    deterministic,
    structure: kinds.join('+'),
    tasteCore: round(cores.reduce((a, i) => a + like(i.itemId), 0) / Math.max(1, cores.length)),
    tasteAllowedMean: round(
      allowedMains.reduce((a, b) => a + b, 0) / Math.max(1, allowedMains.length),
    ),
    tasteAllowedTop: round(
      allowedMains.slice(0, 10).reduce((a, b) => a + b, 0) /
        Math.max(1, Math.min(10, allowedMains.length)),
    ),
    dislikedCore: round(
      cores.filter((i) => like(i.itemId) < 0.4).length / Math.max(1, cores.length),
    ),
    dislikedAllowed: round(
      allowedMains.filter((x) => x < 0.4).length / Math.max(1, allowedMains.length),
    ),
    variety: round(new Set(cores.map((i) => i.itemId)).size / Math.max(1, cores.length)),
    plaus: plausibility(t.energyKcal, plan, foods),
    ms: round(ms, 1),
  };
}

const TODAYS = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08'];

function runJob(job: Job): Row[] {
  return job.seeds.map((seed, i) =>
    runOne(seed, job.iterations, job.today[i % job.today.length] ?? TODAYS[0] ?? ''),
  );
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] ?? 0;
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const num = (x: number, d = 1) => x.toFixed(d).replace('.', ',');

function summarize(rows: readonly Row[], single: readonly number[]) {
  const ok = rows.filter((r) => r.ok);
  const mean = (f: (r: Row) => number, list = ok) =>
    list.length ? list.reduce((s, r) => s + f(r), 0) / list.length : 0;
  const errors: Record<string, number> = {};
  for (const r of rows) if (!r.ok && r.error) errors[r.error] = (errors[r.error] ?? 0) + 1;
  const flagTotals: Record<string, number> = {};
  for (const r of ok)
    for (const [k, v] of Object.entries(r.flags)) flagTotals[k] = (flagTotals[k] ?? 0) + v;
  const dayCount = ok.reduce((s, r) => s + r.days, 0);
  const groups = [...new Set(ok.flatMap((r) => r.groups))].sort();
  const byGroup = Object.fromEntries(
    groups.map((g) => {
      const list = ok.filter((r) => r.groups.includes(g));
      return [
        g,
        {
          n: list.length,
          within10: mean((r) => r.within10, list),
          within5: mean((r) => r.within5, list),
          protein: mean((r) => r.protein, list),
          fibre: mean((r) => r.fibre, list),
          variety: mean((r) => r.variety, list),
          repeatDays:
            list.reduce((s, r) => s + r.repeatDays, 0) /
            Math.max(
              1,
              list.reduce((s, r) => s + r.days, 0),
            ),
          violations: list.reduce((s, r) => s + r.violations, 0),
        },
      ];
    }),
  );
  const fish = ok.filter((r) => r.fishWeeks !== null);
  return {
    personas: rows.length,
    plans: ok.length,
    errors,
    violations: ok.reduce((s, r) => s + r.violations, 0),
    ops: (() => {
      const runs = ok.flatMap((r) => (r.ops ? [r.ops] : []));
      const refused: Record<string, number> = {};
      for (const o of runs) for (const code of o.refused) refused[code] = (refused[code] ?? 0) + 1;
      return {
        people: runs.length,
        checked: runs.reduce((s, o) => s + o.checked, 0),
        violations: runs.reduce((s, o) => s + o.violations, 0),
        refused,
      };
    })(),
    properties: {
      unflaggedEnergy: ok.reduce((s, r) => s + r.unflaggedEnergy, 0),
      unflaggedRepeats: ok.reduce((s, r) => s + r.unflaggedRepeats, 0),
      determinismChecked: ok.filter((r) => r.deterministic !== null).length,
      determinismFailed: ok.filter((r) => r.deterministic === false).length,
      structures: Object.fromEntries(
        STRUCTURES.map((k) => k.join('+'))
          .filter((k, i, all) => all.indexOf(k) === i)
          .map((k) => [k, ok.filter((r) => r.structure === k).length]),
      ),
    },
    days: dayCount,
    energy: {
      within5: mean((r) => r.within5),
      within10: mean((r) => r.within10),
      devMeanPct: {
        p50: quantile(
          ok.map((r) => r.energyDevMeanPct),
          0.5,
        ),
        p95: quantile(
          ok.map((r) => r.energyDevMeanPct),
          0.95,
        ),
      },
      devMaxPct: {
        p95: quantile(
          ok.map((r) => r.energyDevMaxPct),
          0.95,
        ),
        max: Math.max(0, ...ok.map((r) => r.energyDevMaxPct)),
      },
    },
    nutrients: {
      protein: mean((r) => r.protein),
      fat: mean((r) => r.fat),
      carbs: mean((r) => r.carbs),
      fibre: mean((r) => r.fibre),
      sodium: mean((r) => r.sodium),
      sugar: mean((r) => r.sugar),
      satFat: mean((r) => r.satFat),
      vegFruit: mean((r) => r.vegFruit),
    },
    quotas: {
      fishWeeks: mean((r) => r.fishWeeks ?? 0, fish),
      fishPersons: fish.length,
      redMeatWeeks: mean((r) => r.redMeatWeeks),
      sodiumWeeks: mean((r) => r.sodiumWeeks),
    },
    variety: mean((r) => r.variety),
    plaus: {
      oddCore: mean((r) => r.plaus.oddCore),
      soupLunch: mean((r) => r.plaus.soupLunch),
      sweetDrinks: mean((r) => r.plaus.sweetDrinks),
      breadStarch: mean((r) => r.plaus.breadStarch),
      shareDevPp: mean((r) => r.plaus.shareDevPp),
      itemsPerMeal: mean((r) => r.plaus.itemsPerMeal),
    },
    taste: {
      planned: mean((r) => r.tasteCore),
      allowedMean: mean((r) => r.tasteAllowedMean),
      allowedTop10: mean((r) => r.tasteAllowedTop),
      dislikedCore: mean((r) => r.dislikedCore),
      dislikedAllowed: mean((r) => r.dislikedAllowed),
    },
    flags: Object.fromEntries(
      Object.entries(flagTotals)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => [k, { days: v, share: v / Math.max(1, dayCount) }]),
    ),
    runtime: {
      parallelMs: {
        p50: quantile(
          ok.map((r) => r.ms),
          0.5,
        ),
        p95: quantile(
          ok.map((r) => r.ms),
          0.95,
        ),
      },
      singleThreadMs: {
        p50: quantile(single, 0.5),
        p95: quantile(single, 0.95),
        max: Math.max(0, ...single),
      },
    },
    byGroup,
    worst: [...ok]
      .sort((a, b) => b.energyDevMaxPct - a.energyDevMaxPct || b.violations - a.violations)
      .slice(0, 10)
      .map((r) => ({
        seed: r.seed,
        groups: r.groups,
        targetKcal: r.targetKcal,
        energyDevMaxPct: r.energyDevMaxPct,
        flags: r.flags,
      })),
  };
}

function report(
  s: ReturnType<typeof summarize>,
  args: { personas: number; iterations: number; threads: number },
): string {
  const lines: string[] = [];
  lines.push('# Симуляция меню (menu-core)', '');
  lines.push(
    `Запуск: \`npm run menu:sim -- --personas ${args.personas}\`, поиск ${args.iterations} шагов на день, ${args.threads} потоков. Люди — случайные корректные ответы теста (\`randomAnswers\`: все диеты теста, аллергии всех уровней, флаги здоровья, беременность и кормление, подростки, 65+, цели и типы питания), вкусы — настоящие профили taste-core после 15–30 карточек.`,
    '',
  );
  lines.push('## Сводка', '');
  lines.push(`- Людей: ${s.personas}; меню построено: ${s.plans}; дней: ${s.days}.`);
  lines.push(
    `- Отказы: ${
      Object.entries(s.errors)
        .map(([k, v]) => `${k} — ${v}`)
        .join('; ') || 'нет'
    } (отказ guardrails — экран теста, не ошибка движка).`,
  );
  lines.push(
    `- **Нарушений жёстких правил: ${s.violations}** (валидатор по составу: аллергены, следы, диеты, беременность, недельный бюджет рыбы, кофеин, исключения; вторая, простая проверка по меткам и ингредиентам).`,
    `- **Операции** (каждый 10-й человек, через 2 дня после построения: съеден завтрак + новая аллергия → changeTargets; 1–3 случайных правила → applyRules; лучшая замена обеда → replaceItem): людей ${s.ops.people}, проверено результатов ${s.ops.checked}, **нарушений ${s.ops.violations}**; честные отказы — ${
      Object.entries(s.ops.refused)
        .map(([k, v]) => `${k} — ${v}`)
        .join('; ') || 'нет'
    }.`,
    `- Свойства: дней с энергией вне ±10 % без пометки — ${s.properties.unflaggedEnergy}; повторов основного блюда или супа в неделю без пометки — ${s.properties.unflaggedRepeats}; детерминизм — ${s.properties.determinismChecked - s.properties.determinismFailed} из ${s.properties.determinismChecked} повторных запусков дали то же меню байт в байт.`,
    `- Структуры дня: ${Object.entries(s.properties.structures)
      .map(([k, v]) => `${k} — ${v}`)
      .join('; ')}.`,
    '',
  );
  lines.push('## Попадание в цели (доля дней)', '');
  lines.push('| Показатель | Доля дней |', '|---|---|');
  lines.push(
    `| энергия ±5 % | ${pct(s.energy.within5)} |`,
    `| энергия ±10 % | ${pct(s.energy.within10)} |`,
  );
  lines.push(
    `| белок ≥ цели | ${pct(s.nutrients.protein)} |`,
    `| жиры в коридоре | ${pct(s.nutrients.fat)} |`,
    `| углеводы в коридоре | ${pct(s.nutrients.carbs)} |`,
  );
  lines.push(
    `| клетчатка ≥ 25 г | ${pct(s.nutrients.fibre)} |`,
    `| натрий ≤ 2000 мг за день (держится среднее за неделю, D-084) | ${pct(s.nutrients.sodium)} |`,
    `| свободные сахара ≤ 10 % | ${pct(s.nutrients.sugar)} |`,
  );
  lines.push(
    `| НЖК ≤ 10 % | ${pct(s.nutrients.satFat)} |`,
    `| овощи и фрукты ≥ 80 % от 400 г | ${pct(s.nutrients.vegFruit)} |`,
    '',
  );
  lines.push(
    `Отклонение энергии: среднее по дням — медиана ${num(s.energy.devMeanPct.p50, 2)} %, 95-й перцентиль ${num(s.energy.devMeanPct.p95, 2)} %; худший день — 95-й перцентиль ${num(s.energy.devMaxPct.p95, 1)} %, максимум ${num(s.energy.devMaxPct.max, 1)} %.`,
    '',
  );
  lines.push('## Квоты, разнообразие, вкус', '');
  lines.push(
    `- Рыба ≥ 227 г в неделю (у кого рыба разрешена, ${s.quotas.fishPersons} чел.): ${pct(s.quotas.fishWeeks)} недель.`,
  );
  lines.push(`- Красное мясо ≤ 500 г готового в неделю: ${pct(s.quotas.redMeatWeeks)} недель.`);
  lines.push(
    `- Натрий в среднем за неделю ≤ нормы ВОЗ (+5 %): ${pct(s.quotas.sodiumWeeks)} недель.`,
  );
  lines.push(`- Разнообразие основных блюд (разных / всего): ${num(s.variety * 100, 1)} %.`);
  lines.push(
    `- Вкус (P(like) taste-core): в меню ${num(s.taste.planned, 3)}; среднее по разрешённым основным ${num(s.taste.allowedMean, 3)}; лучшие 10 разрешённых ${num(s.taste.allowedTop10, 3)}; вероятно нелюбимых (P < 0,4) в меню ${pct(s.taste.dislikedCore)} основных блюд при ${pct(s.taste.dislikedAllowed)} среди разрешённых.`,
    '',
  );
  lines.push('## Правдоподобие приёмов', '');
  lines.push(
    `- Основное блюдо на полпорции и больше от «своей» порции человека (цель ÷ 2200 ккал): ${pct(s.plaus.oddCore)} основных блюд.`,
    `- Суп на обед: ${pct(s.plaus.soupLunch)} обедов.`,
    `- Сладких напитков в день: ${num(s.plaus.sweetDrinks, 2)}.`,
    `- Хлеб к крахмальному блюду или гарниру без супа: ${pct(s.plaus.breadStarch)} приёмов.`,
    `- Отклонение доли приёма от цели R17 E17: в среднем ${num(s.plaus.shareDevPp, 1)} п. п.; блюд в приёме: ${num(s.plaus.itemsPerMeal, 2)}.`,
    '',
  );
  lines.push('## Честные пометки дней', '');
  lines.push('| Пометка | Дней | Доля |', '|---|---|---|');
  for (const [k, v] of Object.entries(s.flags))
    lines.push(`| \`${k}\` | ${v.days} | ${pct(v.share)} |`);
  lines.push('', '## Время', '');
  lines.push(
    `- Один поток (без конкуренции, каждый 25-й человек, до 200): медиана ${num(s.runtime.singleThreadMs.p50, 0)} мс, 95-й перцентиль ${num(s.runtime.singleThreadMs.p95, 0)} мс, максимум ${num(s.runtime.singleThreadMs.max, 0)} мс на меню 8–14 дней.`,
  );
  lines.push(
    `- В ${args.threads} параллельных потоках: медиана ${num(s.runtime.parallelMs.p50, 0)} мс, 95-й перцентиль ${num(s.runtime.parallelMs.p95, 0)} мс.`,
    '',
  );
  lines.push('## Группы риска', '');
  lines.push(
    '| Группа | Людей | энергия ±10 % | ±5 % | белок | клетчатка | разнообразие | дни с повторами | нарушения |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const [g, v] of Object.entries(s.byGroup))
    lines.push(
      `| ${g} | ${v.n} | ${pct(v.within10)} | ${pct(v.within5)} | ${pct(v.protein)} | ${pct(v.fibre)} | ${num(v.variety * 100, 0)} % | ${pct(v.repeatDays)} | ${v.violations} |`,
    );
  lines.push('', '## Худшие случаи (по худшему дню энергии)', '');
  lines.push('| seed | группы | цель, ккал | худший день | пометки |', '|---|---|---|---|---|');
  for (const w of s.worst)
    lines.push(
      `| ${w.seed} | ${w.groups.join(', ') || '—'} | ${w.targetKcal} | ${num(w.energyDevMaxPct, 1)} % | ${Object.entries(
        w.flags,
      )
        .map(([k, v]) => `${k}×${v}`)
        .join(', ')} |`,
    );
  lines.push(
    '',
    'Воспроизвести человека: `randomAnswers(seed)` из `packages/menu-core/src/testing.ts`.',
    '',
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const personas = Number(arg('personas', '500'));
  const iterations = Number(arg('iterations', '300'));
  const out = path.resolve(arg('out', '.'));
  const threads = Math.max(1, Math.min(Number(arg('threads', String(cpus().length - 2))), 16));
  const seeds = Array.from({ length: personas }, (_, i) => 1000 + i * 7919);
  // Single-thread timing first (no contention).
  // m18: the single-thread sample spreads over the whole run (every 25th person, at most 200), not its first 40.
  const single = seeds
    .filter((_, i) => i % 25 === 0)
    .slice(0, 200)
    .map((seed, i) => runOne(seed, iterations, TODAYS[i % TODAYS.length] ?? '').ms);
  const chunks: number[][] = Array.from({ length: threads }, () => []);
  seeds.forEach((seed, i) => chunks[i % threads]?.push(seed));
  const started = performance.now();
  let done = 0;
  const results = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<Row[]>((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), {
            workerData: { seeds: chunk, iterations, today: TODAYS } satisfies Job,
          });
          worker.on('message', (rows: Row[]) => {
            done += rows.length;
            process.stdout.write(
              `\r${done}/${personas} (${Math.round((performance.now() - started) / 1000)} s)   `,
            );
            resolve(rows);
          });
          worker.on('error', reject);
        }),
    ),
  );
  const rows = results.flat().sort((a, b) => a.seed - b.seed);
  const summary = summarize(rows, single);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'menu-sim.json'), `${JSON.stringify({ summary, rows }, null, 0)}\n`);
  writeFileSync(path.join(out, 'menu-sim.md'), report(summary, { personas, iterations, threads }));
  process.stdout.write(
    `\nplans ${summary.plans}/${summary.personas}, violations ${summary.violations}, energy ±10 % ${pct(summary.energy.within10)}, ${Math.round((performance.now() - started) / 1000)} s → ${out}\n`,
  );
}

if (isMainThread) {
  void main();
} else {
  parentPort?.postMessage(runJob(workerData as Job));
}
