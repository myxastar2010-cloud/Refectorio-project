import { NUTRIENT_KEYS, type NutrientVector } from '@refectorio/food-data';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildContext } from './context';
import { addDays } from './dates';
import { ruleSchema, type Rule } from './dsl';
import { checkFood } from './filter';
import { generate } from './generate';
import {
  addVectors,
  alternatives,
  applyRules,
  changeTargets,
  diff,
  extendHorizon,
  planStaleness,
  regenerate,
  replaceItem,
  ruleConflicts,
  setStructure,
  type Engine,
} from './operations';
import { buildMenuProfile, type MenuProfile } from './profile';
import { RULES_FINGERPRINT } from './rules';
import { dayStateFrom } from './planner';
import { addMeal, DEFAULT_STRUCTURE, removeMeal, structureFromKinds } from './structure';
import { quizAnswers, testFoods, type AnswersOverrides } from './testing';
import { EMPTY_TRACKING, markEaten, type Tracking } from './tracking';
import type { DayPlan, Plan, SlotRef } from './types';
import { hardViolations } from './validate';

const foods = testFoods();
const START = '2026-11-02'; // Monday: the plan is made on this day
const TODAY = '2026-11-04'; // Wednesday: operations run on this day, Mon and Tue are history
const ITERATIONS = 30;

function profileOf(overrides: AnswersOverrides = {}): MenuProfile {
  const result = buildMenuProfile(quizAnswers(overrides), { foods });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function planFor(profile: MenuProfile, seed = 5): Plan {
  const result = generate({
    profile,
    foods,
    today: START,
    seed,
    iterationsPerDay: ITERATIONS,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value.plan;
}

const opts = (extra: { seed?: number; tracking?: Tracking; today?: string } = {}) => ({
  today: extra.today ?? TODAY,
  iterationsPerDay: ITERATIONS,
  ...(extra.seed !== undefined ? { seed: extra.seed } : {}),
  ...(extra.tracking ? { tracking: extra.tracking } : {}),
});

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const json = (value: unknown) => JSON.stringify(value);
const dayOf = (plan: Plan, date: string): DayPlan => {
  const day = plan.days.find((d) => d.date === date);
  if (!day) throw new Error(`no day ${date}`);
  return day;
};
const idsOf = (day: DayPlan) =>
  Object.values(day.meals)
    .flat()
    .map((i) => i.itemId);
const fromToday = (plan: Plan) => plan.days.filter((d) => d.date >= TODAY);
const beforeToday = (plan: Plan) => plan.days.filter((d) => d.date < TODAY);

let counter = 0;
function makeRule(body: Record<string, unknown>): Rule {
  counter += 1;
  return ruleSchema.parse({
    id: `t${counter}`,
    createdBy: 'user',
    textRu: 'Тестовое правило',
    active: true,
    ...body,
  });
}

/** The first core item of the meal on the date, as a slot. */
function coreSlot(plan: Plan, date: string, meal: string): SlotRef {
  const index = dayOf(plan, date).meals[meal]?.findIndex((i) => i.slot === 'core') ?? -1;
  if (index < 0) throw new Error(`no core in ${date} ${meal}`);
  return { date, meal, index };
}

const itemAt = (plan: Plan, slot: SlotRef) => {
  const item = dayOf(plan, slot.date).meals[slot.meal]?.[slot.index];
  if (!item) throw new Error('no item');
  return item;
};

function eatenTracking(plan: Plan, slot: SlotRef): Tracking {
  const item = itemAt(plan, slot);
  return unwrap(
    markEaten(
      EMPTY_TRACKING,
      plan,
      slot.date,
      slot.meal,
      item.itemId,
      true,
      '2026-11-04T08:00:00.000Z',
      TODAY,
    ),
  );
}

const office = profileOf();
const engine: Engine = { profile: office, foods };
const officeCtx = buildContext(office, foods, DEFAULT_STRUCTURE, []);
let base: Plan;
beforeAll(() => {
  base = planFor(office);
});

describe('addVectors', () => {
  const vector = (value: number | null) =>
    Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, value])) as unknown as NutrientVector;

  it('sums every nutrient', () => {
    const sum = addVectors(vector(1), vector(2));
    for (const key of NUTRIENT_KEYS) expect(sum[key]).toBe(3);
  });

  it('gives null where either side is unknown, and sums the rest', () => {
    const [k0, k1, k2] = ['energyKcal', 'proteinG', 'fatG'] as const;
    const a = { ...vector(1), [k0]: null } as unknown as NutrientVector;
    const b = { ...vector(2), [k1]: null } as unknown as NutrientVector;
    const sum = addVectors(a, b);
    expect(sum[k0]).toBeNull();
    expect(sum[k1]).toBeNull();
    expect(sum[k2]).toBe(3);
    expect(addVectors(vector(null), vector(null))[k0]).toBeNull();
  });
});

describe('diff', () => {
  it('lists no days for identical plans', () => {
    const d = diff(base, base);
    expect(d.days).toEqual([]);
    expect(d.structureChanged).toBe(false);
    expect(d.rulesChanged).toBe(false);
  });

  it('reports added, removed and portion changes per day and meal with totals', () => {
    const date = START;
    const day = dayOf(base, date);
    const mealId = Object.keys(day.meals).find((m) => (day.meals[m] ?? []).length >= 2);
    if (!mealId) throw new Error('no meal with two items');
    const list = day.meals[mealId] ?? [];
    const [first, second, ...rest] = list;
    if (!first || !second) throw new Error('unreachable');
    const extra = { ...first, itemId: 'x_brand_new' };
    const changed = {
      ...second,
      portion: { ...second.portion, factor: second.portion.factor + 0.5 },
    };
    const totalsAfter = { ...day.totals, energyKcal: (day.totals.energyKcal ?? 0) + 100 };
    const edited: Plan = {
      ...base,
      days: base.days.map((d) =>
        d.date === date
          ? {
              ...d,
              totals: totalsAfter,
              meals: { ...d.meals, [mealId]: [changed, ...rest, extra] },
            }
          : d,
      ),
    };
    const result = diff(base, edited);
    expect(result.days).toHaveLength(1);
    const dayDiff = result.days[0];
    expect(dayDiff?.date).toBe(date);
    expect(dayDiff?.totalsBefore).toBe(day.totals);
    expect(dayDiff?.totalsAfter).toBe(totalsAfter);
    expect(dayDiff?.meals).toEqual([
      {
        mealId,
        added: ['x_brand_new'],
        removed: [first.itemId],
        portionChanged: [
          { itemId: second.itemId, before: second.portion.factor, after: changed.portion.factor },
        ],
      },
    ]);
  });

  it('treats a day present on one side only as all added or all removed, with null totals', () => {
    const shorter: Plan = { ...base, days: base.days.slice(0, -1) };
    const last = base.days[base.days.length - 1];
    const grown = diff(shorter, base);
    expect(grown.days).toHaveLength(1);
    expect(grown.days[0]?.totalsBefore).toBeNull();
    expect(grown.days[0]?.totalsAfter).toBe(last?.totals);
    expect(grown.days[0]?.meals.every((m) => m.removed.length === 0 && m.added.length > 0)).toBe(
      true,
    );
    const cut = diff(base, shorter);
    expect(cut.days[0]?.totalsAfter).toBeNull();
    expect(cut.days[0]?.meals.every((m) => m.added.length === 0 && m.removed.length > 0)).toBe(
      true,
    );
  });

  it('flags a changed structure and changed rules', () => {
    const fewer: Plan = { ...base, structure: base.structure.slice(0, 3) };
    expect(diff(base, fewer).structureChanged).toBe(true);
    const ruled: Plan = {
      ...base,
      rules: [makeRule({ kind: 'preferMore', target: { category: 'legumes' } })],
    };
    const d = diff(base, ruled);
    expect(d.rulesChanged).toBe(true);
    expect(d.structureChanged).toBe(false);
  });
});

describe('regenerate and changeTargets', () => {
  it('bumps the revision, picks a new seed and keeps the past byte-identical', () => {
    const { plan, diff: d } = unwrap(regenerate(engine, base, opts()));
    expect(plan.revision).toBe(base.revision + 1);
    expect(plan.seed).not.toBe(base.seed);
    expect(json(beforeToday(plan))).toBe(json(beforeToday(base)));
    expect(plan.days.map((x) => x.date)).toEqual(base.days.map((x) => x.date));
    expect(plan.horizonEnd).toBe(base.horizonEnd);
    expect(d.days.length).toBeGreaterThan(0);
    for (const changed of d.days) expect(changed.date >= TODAY).toBe(true);
  });

  it('uses the given seed and is deterministic', () => {
    const a = unwrap(regenerate(engine, base, opts({ seed: 77 }))).plan;
    const b = unwrap(regenerate(engine, base, opts({ seed: 77 }))).plan;
    expect(a.seed).toBe(77);
    expect(json(a)).toBe(json(b));
  });

  it('does not change its input', () => {
    const before = json(base);
    unwrap(regenerate(engine, base, opts()));
    expect(json(base)).toBe(before);
  });

  it('keeps items marked eaten today and re-plans the future', () => {
    const slot = coreSlot(base, TODAY, 'breakfast');
    const eaten = itemAt(base, slot);
    const tracking = eatenTracking(base, slot);
    const { plan } = unwrap(regenerate(engine, base, opts({ tracking })));
    expect(
      plan.days.find((d) => d.date === TODAY)?.meals.breakfast?.map((i) => i.itemId),
    ).toContain(eaten.itemId);
    const future = plan.days.filter((d) => d.date > TODAY);
    const was = base.days.filter((d) => d.date > TODAY);
    expect(json(future)).not.toBe(json(was));
    const ctx = buildContext(office, foods, plan.structure, plan.rules);
    expect(hardViolations(ctx, fromToday(plan), beforeToday(plan))).toEqual([]);
  });

  it('extends the horizon to the end of next week when today is past it', () => {
    const later = '2026-11-20'; // Friday
    const { plan } = unwrap(regenerate(engine, base, opts({ today: later })));
    expect(plan.horizonEnd > base.horizonEnd).toBe(true);
    expect(plan.horizonEnd).toBe('2026-11-29');
    expect(plan.days[0]?.date).toBe(START);
    expect(json(plan.days.filter((d) => d.date < later))).toBe(json(base.days));
    expect(plan.days.some((d) => d.date === later)).toBe(true);
  });

  it('rejects an invalid today', () => {
    const result = regenerate(engine, base, opts({ today: 'soon' }));
    expect(result).toEqual({ ok: false, error: { code: 'invalidDate' } });
  });

  it('changeTargets re-plans to a new profile from today', () => {
    const heavier = profileOf({
      body: { sex: 'female', ageYears: 32, heightCm: 168, weightKg: 85, mode: 'self' },
    });
    const { plan } = unwrap(changeTargets({ profile: heavier, foods }, base, opts()));
    expect(plan.profileHash).toBe(heavier.hash);
    expect(plan.targets).toEqual(heavier.targets);
    expect(plan.revision).toBe(base.revision + 1);
    expect(json(beforeToday(plan))).toBe(json(beforeToday(base)));
  });
});

describe('setStructure', () => {
  it('plans an added snack on today and the future, leaving the past', () => {
    const noSnack = structureFromKinds(['breakfast', 'lunch', 'dinner']);
    const lean = unwrap(setStructure(engine, base, noSnack, opts())).plan;
    for (const day of fromToday(lean))
      expect(Object.keys(day.meals)).toEqual(noSnack.map((m) => m.id));
    const withSnack = structureFromKinds(['breakfast', 'lunch', 'snack', 'dinner', 'snack']);
    const { plan, diff: d } = unwrap(setStructure(engine, lean, withSnack, opts()));
    expect(plan.structure).toEqual(withSnack);
    expect(d.structureChanged).toBe(true);
    for (const day of fromToday(plan)) {
      expect((day.meals['snack-1'] ?? []).length).toBeGreaterThan(0);
      expect((day.meals['snack-2'] ?? []).length).toBeGreaterThan(0);
    }
    expect(json(beforeToday(plan))).toBe(json(beforeToday(lean)));
    expect(plan.revision).toBe(lean.revision + 1);
  });

  it('rejects a structure below the minimum of main meals', () => {
    const result = setStructure(engine, base, structureFromKinds(['snack']), opts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('structureRejected');
      if (result.error.code === 'structureRejected')
        expect(result.error.error.code).toBe('TOO_FEW_MAIN_MEALS');
    }
  });

  it('rejects an empty structure', () => {
    const result = setStructure(engine, base, [], opts());
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'structureRejected')
      expect(result.error.error.code).toBe('EMPTY');
  });
});

describe('applyRules and ruleConflicts', () => {
  const allergic = profileOf({
    allergies: { items: [{ code: 'EGG', level: 'allergy' }], custom: [] },
  });
  const allergicEngine: Engine = { profile: allergic, foods };
  const omelette = makeRule({ kind: 'includeItem', target: { itemId: 'd_omelette' } });

  it('rejects input that is not a list of rules', () => {
    const result = applyRules(engine, base, [{ kind: 'nonsense' }], opts());
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'invalidRules')
      expect(typeof result.error.detail).toBe('string');
    expect(result.ok ? 'ok' : result.error.code).toBe('invalidRules');
    expect(applyRules(engine, base, 'no', opts()).ok).toBe(false);
  });

  it('excludes an item from today and the future but keeps history', () => {
    const pastCore =
      dayOf(base, START).meals.lunch?.find((i) => i.slot === 'core')?.itemId ??
      idsOf(dayOf(base, START))[0];
    if (!pastCore) throw new Error('no item');
    const rule = makeRule({ kind: 'excludeItem', itemId: pastCore });
    const { plan, diff: d } = unwrap(applyRules(engine, base, [rule], opts()));
    for (const day of fromToday(plan)) expect(idsOf(day)).not.toContain(pastCore);
    expect(json(dayOf(plan, START))).toBe(json(dayOf(base, START)));
    expect(idsOf(dayOf(plan, START))).toContain(pastCore);
    expect(plan.rules).toEqual([rule]);
    expect(d.rulesChanged).toBe(true);
    expect(plan.revision).toBe(base.revision + 1);
  });

  it('excludes an ingredient from today and the future', () => {
    const dish = dayOf(base, START).meals.lunch?.find((i) => i.slot === 'core');
    const food = foods.foods.find((f) => f.id === dish?.itemId);
    const ingredient = food?.item.ingredients[0]?.id;
    if (!ingredient) throw new Error('no ingredient');
    const rule = makeRule({ kind: 'excludeIngredient', target: { ingredientId: ingredient } });
    const { plan } = unwrap(applyRules(engine, base, [rule], opts()));
    for (const day of fromToday(plan))
      for (const id of idsOf(day)) {
        const item = foods.foods.find((f) => f.id === id);
        expect(item?.item.ingredients.some((i) => i.id === ingredient)).toBe(false);
      }
    expect(json(beforeToday(plan))).toBe(json(beforeToday(base)));
  });

  it('refuses an include that breaks the safety filter, with a typed conflict', () => {
    const allergicPlan = planFor(allergic);
    const result = applyRules(allergicEngine, allergicPlan, [omelette], opts());
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'rulesConflict') {
      expect(result.error.conflicts.map((c) => c.code)).toContain('RULE_CONFLICTS_SAFETY');
      expect(result.error.conflicts[0]?.ruleId).toBe(omelette.id);
    } else {
      throw new Error('expected rulesConflict');
    }
  });

  it('ruleConflicts reports a safety conflict without changing the plan', () => {
    const conflicts = ruleConflicts(allergicEngine, base, [omelette]);
    expect(conflicts.map((c) => [c.ruleId, c.code])).toEqual([
      [omelette.id, 'RULE_CONFLICTS_SAFETY'],
    ]);
  });

  it('ruleConflicts reports include and exclude of the same item as contradicting', () => {
    const id = idsOf(dayOf(base, START))[0] ?? '';
    const include = makeRule({ kind: 'includeItem', target: { itemId: id } });
    const exclude = makeRule({ kind: 'excludeItem', itemId: id });
    const codes = ruleConflicts(engine, base, [include, exclude]).map((c) => c.code);
    expect(codes).toContain('RULE_CONTRADICTS_RULE');
  });

  it('ruleConflicts is empty for harmless rules and flags unknown targets', () => {
    const fine = makeRule({ kind: 'preferMore', target: { category: 'legumes' } });
    expect(ruleConflicts(engine, base, [fine])).toEqual([]);
    expect(ruleConflicts(engine, base, [])).toEqual([]);
    const unknown = makeRule({ kind: 'excludeItem', itemId: 'd_no_such_dish' });
    expect(ruleConflicts(engine, base, [unknown]).map((c) => c.code)).toEqual([
      'RULE_UNKNOWN_TARGET',
    ]);
  });
});

describe('extendHorizon', () => {
  it('returns the same plan and an empty diff when the date is within the horizon', () => {
    for (const to of [base.horizonEnd, START]) {
      const { plan, diff: d } = unwrap(extendHorizon(engine, base, to, opts()));
      expect(plan).toBe(base);
      expect(d.days).toEqual([]);
    }
  });

  it('appends new days, keeps the earlier ones and bumps the revision', () => {
    const to = addDays(base.horizonEnd, 7);
    const { plan, diff: d } = unwrap(extendHorizon(engine, base, to, opts()));
    expect(plan.revision).toBe(base.revision + 1);
    expect(plan.horizonEnd).toBe(to);
    expect(plan.days).toHaveLength(base.days.length + 7);
    expect(json(plan.days.slice(0, base.days.length))).toBe(json(base.days));
    expect(plan.days[base.days.length]?.date).toBe(addDays(base.horizonEnd, 1));
    expect(d.days.map((x) => x.date)).toEqual(plan.days.slice(base.days.length).map((x) => x.date));
    const ctx = buildContext(office, foods, plan.structure, plan.rules);
    expect(hardViolations(ctx, plan.days)).toEqual([]);
  });

  it('rejects an invalid date', () => {
    expect(extendHorizon(engine, base, 'later')).toEqual({
      ok: false,
      error: { code: 'invalidDate' },
    });
  });
});

describe('alternatives', () => {
  const slot = (): SlotRef => coreSlot(base, '2026-11-06', 'lunch');

  it('returns at most k safe alternatives, cheapest first, different from the current item', () => {
    const current = itemAt(base, slot());
    const result = unwrap(alternatives(engine, base, slot(), 4));
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < result.length; i++)
      expect(result[i]?.deltaCost ?? 0).toBeGreaterThanOrEqual(result[i - 1]?.deltaCost ?? 0);
    for (const alt of result) {
      expect(alt.itemId).not.toBe(current.itemId);
      const index = officeCtx.indexOf.get(alt.itemId);
      const food = index === undefined ? undefined : officeCtx.foods[index];
      expect(food).toBeDefined();
      if (food) expect(checkFood(food, office.safety).ok).toBe(true);
      expect(alt.portion.factor).toBeGreaterThan(0);
      expect(alt.reasons.length).toBeGreaterThan(0);
    }
  });

  it('uses five results by default, none for k = 0, and does not change the plan', () => {
    const before = json(base);
    expect(unwrap(alternatives(engine, base, slot())).length).toBeLessThanOrEqual(5);
    expect(unwrap(alternatives(engine, base, slot(), 0))).toEqual([]);
    expect(json(base)).toBe(before);
  });

  it('refuses an eaten slot', () => {
    const s = coreSlot(base, TODAY, 'lunch');
    const tracking = eatenTracking(base, s);
    expect(alternatives(engine, base, s, 3, tracking)).toEqual({
      ok: false,
      error: { code: 'eaten' },
    });
  });

  it('refuses slots that do not exist', () => {
    const noSlot = { ok: false, error: { code: 'noSuchSlot' } };
    expect(alternatives(engine, base, { date: '2030-01-01', meal: 'lunch', index: 0 })).toEqual(
      noSlot,
    );
    expect(alternatives(engine, base, { date: TODAY, meal: 'brunch', index: 0 })).toEqual(noSlot);
    expect(alternatives(engine, base, { date: TODAY, meal: 'lunch', index: 99 })).toEqual(noSlot);
  });
});

describe('replaceItem', () => {
  const date = '2026-11-06';

  it('refuses a past day', () => {
    const s = coreSlot(base, START, 'lunch');
    const id = itemAt(base, s).itemId;
    expect(replaceItem(engine, base, s, id, { today: TODAY })).toEqual({
      ok: false,
      error: { code: 'pastDay' },
    });
  });

  it('refuses an eaten slot and a missing slot or item', () => {
    const s = coreSlot(base, TODAY, 'lunch');
    const tracking = eatenTracking(base, s);
    const other = unwrap(alternatives(engine, base, coreSlot(base, date, 'lunch'), 1))[0];
    const id = other?.itemId ?? '';
    expect(replaceItem(engine, base, s, id, { today: TODAY, tracking })).toEqual({
      ok: false,
      error: { code: 'eaten' },
    });
    const missing = { ok: false, error: { code: 'noSuchSlot' } };
    expect(
      replaceItem(engine, base, { date, meal: 'lunch', index: 99 }, id, { today: TODAY }),
    ).toEqual(missing);
    expect(
      replaceItem(engine, base, coreSlot(base, date, 'lunch'), 'd_no_such_dish', { today: TODAY }),
    ).toEqual(missing);
  });

  it('refuses an item that fails the safety filter, with the reasons', () => {
    const allergic = profileOf({
      allergies: { items: [{ code: 'EGG', level: 'allergy' }], custom: [] },
    });
    const plan = planFor(allergic);
    const egg = foods.foods.find((f) => f.item.allergens.includes('EGG'));
    if (!egg) throw new Error('no egg item');
    const result = replaceItem(
      { profile: allergic, foods },
      plan,
      coreSlot(plan, date, 'lunch'),
      egg.id,
      {
        today: TODAY,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'notAllowed') {
      expect(result.error.reasons).toContain('allergen');
    } else {
      throw new Error('expected notAllowed');
    }
  });

  it('refuses an item that does not fit the slot role', () => {
    const s = coreSlot(base, date, 'lunch');
    const target = itemAt(base, s);
    const meal = officeCtx.structure.find((m) => m.id === s.meal);
    if (!meal) throw new Error('no meal');
    const pool = officeCtx.pools[meal.kind][target.slot] ?? [];
    const wrong = officeCtx.foods.findIndex(
      (_, i) => officeCtx.verdicts[i]?.ok === true && !pool.includes(i),
    );
    const id = officeCtx.foods[wrong]?.id;
    if (!id) throw new Error('no misfit');
    expect(replaceItem(engine, base, s, id, { today: TODAY })).toEqual({
      ok: false,
      error: { code: 'notAllowed', reasons: ['slot'] },
    });
  });

  it('puts an alternative into the slot, re-solves portions and stays valid', () => {
    const s = coreSlot(base, date, 'lunch');
    const alt = unwrap(alternatives(engine, base, s, 3))[0];
    if (!alt) throw new Error('no alternative');
    const { plan, diff: d } = unwrap(replaceItem(engine, base, s, alt.itemId, { today: TODAY }));
    expect(plan.revision).toBe(base.revision + 1);
    const lunch = dayOf(plan, date).meals.lunch ?? [];
    const placed = lunch.find((i) => i.itemId === alt.itemId);
    expect(placed).toBeDefined();
    expect(placed?.portion).toEqual(alt.portion);
    expect(d.days.map((x) => x.date)).toEqual([date]);
    expect(d.days[0]?.meals.find((m) => m.mealId === 'lunch')?.added).toContain(alt.itemId);
    expect(json(plan.days.filter((x) => x.date !== date))).toBe(
      json(base.days.filter((x) => x.date !== date)),
    );
    const ctx = buildContext(office, foods, plan.structure, plan.rules);
    expect(hardViolations(ctx, plan.days)).toEqual([]);
  });
});

describe('pregnancy: fish caps hold through replacements', () => {
  const pregnant = profileOf({
    body: { sex: 'female', ageYears: 29, heightCm: 165, weightKg: 62, mode: 'self' },
    health: { flags: [], pregnancy: 'trimester2', lactation: 'none', custom: [] },
  });
  const pEngine: Engine = { profile: pregnant, foods };
  const ctx = buildContext(pregnant, foods, DEFAULT_STRUCTURE, []);
  const isFish = (id: string) => {
    const f = foods.foods.find((x) => x.id === id);
    return (f?.groups.fishG ?? 0) > 0;
  };

  it('never builds a week over the fish caps', () => {
    let plan = planFor(pregnant);
    const dates = plan.days.filter((d) => d.date >= TODAY).map((d) => d.date);
    for (const date of dates) {
      for (const meal of ['lunch', 'dinner']) {
        const slot = coreSlot(plan, date, meal);
        const alts = unwrap(alternatives(pEngine, plan, slot, 60));
        for (const alt of alts) {
          const checkedFood = ctx.foods[ctx.indexOf.get(alt.itemId) ?? -1];
          expect(checkedFood && checkFood(checkedFood, pregnant.safety).ok).toBe(true);
        }
        const fish = alts.find((a) => isFish(a.itemId));
        if (!fish) continue;
        const result = replaceItem(pEngine, plan, slot, fish.itemId, { today: TODAY });
        if (result.ok) plan = result.value.plan;
        expect(hardViolations(ctx, plan.days, []).map((v) => v.code)).not.toContain('fishWeek');
      }
    }
    expect(hardViolations(ctx, plan.days, []).map((v) => v.code)).not.toContain('fishWeek');
  }, 120_000);
});

describe('a stale plan (review of phase 3, M5)', () => {
  const milkFree = profileOf({
    allergies: { items: [{ code: 'MILK', level: 'allergy' }], custom: [] },
  });
  const newEngine: Engine = { profile: milkFree, foods };
  const safeFor = (id: string) => {
    const food = foods.byId.get(id);
    return food !== undefined && checkFood(food, milkFree.safety).ok;
  };

  it('records the data and rules versions it was made with', () => {
    expect(planStaleness(engine, base)).toBeNull();
    expect(base.foodDataVersion).toBe(foods.version);
    expect(base.rulesVersion).toBe(RULES_FINGERPRINT);
  });

  it('refuses single-slot edits and new days for another profile', () => {
    const slot = coreSlot(base, TODAY, 'lunch');
    const refused = { ok: false, error: { code: 'stalePlan', reason: 'profile' } };
    expect(extendHorizon(newEngine, base, addDays(base.horizonEnd, 7))).toEqual(refused);
    expect(alternatives(newEngine, base, slot)).toEqual(refused);
    expect(replaceItem(newEngine, base, slot, itemAt(base, slot).itemId, { today: TODAY })).toEqual(
      refused,
    );
  });

  it('refuses them for other dish data or another rules table', () => {
    const slot = coreSlot(base, TODAY, 'lunch');
    const newData: Engine = { profile: office, foods: { ...foods, version: 'next' } };
    expect(alternatives(newData, base, slot)).toEqual({
      ok: false,
      error: { code: 'stalePlan', reason: 'foodData' },
    });
    const oldRules: Plan = { ...base, rulesVersion: 'old' };
    expect(alternatives(engine, oldRules, slot)).toEqual({
      ok: false,
      error: { code: 'stalePlan', reason: 'rules' },
    });
  });

  it('is brought up to date by changeTargets: the new profile from today, the past untouched', () => {
    const { plan } = unwrap(changeTargets(newEngine, base, opts()));
    expect(planStaleness(newEngine, plan)).toBeNull();
    expect(json(beforeToday(plan))).toBe(json(beforeToday(base)));
    for (const day of fromToday(plan)) for (const id of idsOf(day)) expect(safeFor(id)).toBe(true);
    expect(
      unwrap(extendHorizon(newEngine, plan, addDays(plan.horizonEnd, 7))).plan.days.length,
    ).toBe(plan.days.length + 7);
  });
});

describe('meal ids stay through structure edits (review of phase 3, M6)', () => {
  const ids = (plan: Plan) => plan.structure.map((m) => m.id);

  it('keeps an eaten snack in its meal when a morning snack is added', () => {
    const slot = coreSlot(base, TODAY, 'snack-1');
    const eatenId = itemAt(base, slot).itemId;
    const tracking = eatenTracking(base, slot);
    const structure = unwrap(addMeal(base.structure, 'snack'));
    const { plan } = unwrap(setStructure(engine, base, structure, opts({ tracking })));
    expect(ids(plan)).toEqual(['breakfast', 'snack-2', 'lunch', 'snack-1', 'dinner']);
    const today = dayOf(plan, TODAY);
    expect(today.meals['snack-1']?.some((i) => i.itemId === eatenId)).toBe(true);
    expect((today.meals['snack-2'] ?? []).length).toBeGreaterThan(0);
  });

  it('refuses to remove a meal with something eaten today, and removes it otherwise', () => {
    const tracking = eatenTracking(base, coreSlot(base, TODAY, 'snack-1'));
    const structure = unwrap(removeMeal(base.structure, 'snack-1', office.safety.minMainMeals));
    expect(setStructure(engine, base, structure, opts({ tracking }))).toEqual({
      ok: false,
      error: { code: 'mealHasEaten', mealId: 'snack-1' },
    });
    const { plan } = unwrap(setStructure(engine, base, structure, opts()));
    for (const day of fromToday(plan)) expect(day.meals['snack-1']).toBeUndefined();
    expect(dayOf(plan, START).meals['snack-1']?.length).toBeGreaterThan(0);
  });

  it('still counts the past days of a removed meal in caps and windows', () => {
    const noSnack = unwrap(removeMeal(DEFAULT_STRUCTURE, 'snack-1', 2));
    const ctx = buildContext(office, foods, noSnack, []);
    const monday = dayOf(base, START);
    const state = dayStateFrom(ctx, monday, { history: true });
    expect(state.meals.flat()).toHaveLength(Object.values(monday.meals).flat().length);
    expect(state.meals.flat().every((s) => s.frozen)).toBe(true);
  });
});
