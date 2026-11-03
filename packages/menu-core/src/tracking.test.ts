import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { buildMenuProfile } from './profile';
import { quizAnswers, testFoods } from './testing';
import {
  addWater,
  dayStatus,
  drinking,
  EMPTY_TRACKING,
  markEaten,
  markKey,
  totals,
  widgetValue,
  type Tracking,
} from './tracking';
import type { Plan, Result } from './types';

const TODAY = '2026-11-04';
const foods = testFoods();

function makePlan(): Plan {
  const profile = buildMenuProfile(quizAnswers(), { foods });
  if (!profile.ok) throw new Error(JSON.stringify(profile.error));
  const result = generate({
    profile: profile.value,
    foods,
    today: TODAY,
    seed: 1,
    iterationsPerDay: 20,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value.plan;
}

const plan = makePlan();
const firstDay = plan.days[0];
if (!firstDay) throw new Error('no days');
const DAY = firstDay.date;
const NOW = '2026-11-05T12:00:00.000Z';
/** The day after the first planned day: the first day is then in the past. */
const LATER = '2026-11-05';

const unwrap = <T>(r: Result<T, unknown>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

const slots = firstDay.meals;
const entries = Object.entries(slots).flatMap(([mealId, items]) =>
  items.map((i) => ({ mealId, itemId: i.itemId })),
);
const firstEntry = entries[0];
if (!firstEntry) throw new Error('empty day');

function eatAll(tracking: Tracking, today = LATER): Tracking {
  let t = tracking;
  for (const e of entries)
    t = unwrap(markEaten(t, plan, DAY, e.mealId, e.itemId, true, NOW, today));
  return t;
}

describe('markEaten', () => {
  it('marks an item and toggles it off', () => {
    const marked = unwrap(
      markEaten(EMPTY_TRACKING, plan, DAY, firstEntry.mealId, firstEntry.itemId, true, NOW, LATER),
    );
    expect(marked.days[DAY]?.eaten[markKey(firstEntry.mealId, firstEntry.itemId)]).toBe(NOW);
    const off = unwrap(
      markEaten(marked, plan, DAY, firstEntry.mealId, firstEntry.itemId, false, NOW, LATER),
    );
    expect(Object.keys(off.days[DAY]?.eaten ?? {})).toEqual([]);
    expect(Object.keys(marked.days[DAY]?.eaten ?? {})).toHaveLength(1);
  });

  it('refuses a future day', () => {
    const r = markEaten(
      EMPTY_TRACKING,
      plan,
      DAY,
      firstEntry.mealId,
      firstEntry.itemId,
      true,
      NOW,
      '2026-11-03',
    );
    expect(r).toEqual({ ok: false, error: { code: 'futureDay' } });
  });

  it('refuses a day more than seven days ago', () => {
    const r = markEaten(
      EMPTY_TRACKING,
      plan,
      DAY,
      firstEntry.mealId,
      firstEntry.itemId,
      true,
      NOW,
      '2026-11-12',
    );
    expect(r).toEqual({ ok: false, error: { code: 'tooOld' } });
    const edge = markEaten(
      EMPTY_TRACKING,
      plan,
      DAY,
      firstEntry.mealId,
      firstEntry.itemId,
      true,
      NOW,
      '2026-11-11',
    );
    expect(edge.ok).toBe(true);
  });

  it('refuses an item the day does not have and an invalid date', () => {
    expect(
      markEaten(EMPTY_TRACKING, plan, DAY, firstEntry.mealId, 'd_nothing', true, NOW, LATER),
    ).toEqual({
      ok: false,
      error: { code: 'noSuchItem' },
    });
    expect(markEaten(EMPTY_TRACKING, plan, '2026-02-30', 'lunch', 'd_x', true, NOW, LATER)).toEqual(
      {
        ok: false,
        error: { code: 'invalidDate' },
      },
    );
  });
});

describe('addWater', () => {
  it('adds and removes glasses with timestamps', () => {
    const one = unwrap(addWater(EMPTY_TRACKING, DAY, 1, NOW, LATER));
    const two = unwrap(addWater(one, DAY, 1, `${NOW}2`, LATER));
    expect(two.days[DAY]?.waterGlasses).toBe(2);
    expect(two.days[DAY]?.waterAt).toEqual([NOW, `${NOW}2`]);
    const back = unwrap(addWater(two, DAY, -1, NOW, LATER));
    expect(back.days[DAY]?.waterGlasses).toBe(1);
    expect(back.days[DAY]?.waterAt).toEqual([NOW]);
  });

  it('refuses to go below zero and outside the editable days', () => {
    expect(addWater(EMPTY_TRACKING, DAY, -1, NOW, LATER)).toEqual({
      ok: false,
      error: { code: 'negativeWater' },
    });
    expect(addWater(EMPTY_TRACKING, DAY, 1, NOW, '2026-11-03').ok).toBe(false);
  });
});

describe('totals', () => {
  it('sums the planned day and one meal', () => {
    const all = totals(firstDay);
    expect(all.energyKcal).toBeCloseTo(firstDay.totals.energyKcal ?? 0, 3);
    const meal = totals(firstDay, { mealId: firstEntry.mealId });
    expect(meal.energyKcal).toBeGreaterThan(0);
    expect(meal.energyKcal).toBeLessThan(all.energyKcal);
  });

  it('counts only eaten items with eatenOnly', () => {
    expect(totals(firstDay, { eatenOnly: true }).energyKcal).toBe(0);
    const t = unwrap(
      markEaten(EMPTY_TRACKING, plan, DAY, firstEntry.mealId, firstEntry.itemId, true, NOW, LATER),
    );
    const dayTracking = t.days[DAY];
    if (!dayTracking) throw new Error('no tracking');
    const eaten = totals(firstDay, { eatenOnly: true, tracking: dayTracking });
    const item = (firstDay.meals[firstEntry.mealId] ?? []).find(
      (i) => i.itemId === firstEntry.itemId,
    );
    expect(eaten.energyKcal).toBeCloseTo(item?.nutrients.energyKcal ?? -1, 6);
  });
});

describe('drinking', () => {
  it('sets the target as total water minus the water of food', () => {
    const d = drinking(firstDay, plan.targets);
    const foodWater = Object.values(firstDay.meals)
      .flat()
      .filter((i) => i.role !== 'drink')
      .reduce((sum, i) => sum + (i.nutrients.waterG ?? 0), 0);
    expect(d.targetMl).toBeCloseTo(Math.max(0, plan.targets.waterTotalMl - foodWater), 6);
    expect(d.targetGlasses).toBeGreaterThanOrEqual(1);
    expect(d.drunkMl).toBe(0);
  });

  it('counts glasses and eaten drinks', () => {
    const t = unwrap(addWater(EMPTY_TRACKING, DAY, 1, NOW, LATER));
    const d = drinking(firstDay, plan.targets, t.days[DAY]);
    expect(d.drunkMl).toBe(plan.targets.glassMl);
    expect(d.drunkGlasses).toBe(1);
    const drinkEntry = Object.entries(firstDay.meals)
      .flatMap(([mealId, items]) => items.map((i) => ({ mealId, i })))
      .find((e) => e.i.role === 'drink');
    if (!drinkEntry) return;
    const marked = unwrap(
      markEaten(
        EMPTY_TRACKING,
        plan,
        DAY,
        drinkEntry.mealId,
        drinkEntry.i.itemId,
        true,
        NOW,
        LATER,
      ),
    );
    const withDrink = drinking(firstDay, plan.targets, marked.days[DAY]);
    expect(withDrink.drunkMl).toBeCloseTo(drinkEntry.i.nutrients.waterG ?? 0, 6);
  });
});

describe('dayStatus', () => {
  it('is none for today, the future and days before the plan', () => {
    expect(dayStatus(plan, DAY, EMPTY_TRACKING, DAY)).toBe('none');
    expect(dayStatus(plan, DAY, EMPTY_TRACKING, '2026-11-01')).toBe('none');
    expect(dayStatus(plan, '2026-11-01', EMPTY_TRACKING, LATER)).toBe('none');
  });

  it('is missed for a past day without marks', () => {
    expect(dayStatus(plan, DAY, EMPTY_TRACKING, LATER)).toBe('missed');
  });

  it('is partial with some marks, or with only water', () => {
    const one = unwrap(
      markEaten(EMPTY_TRACKING, plan, DAY, firstEntry.mealId, firstEntry.itemId, true, NOW, LATER),
    );
    expect(dayStatus(plan, DAY, one, LATER)).toBe('partial');
    const water = unwrap(addWater(EMPTY_TRACKING, DAY, 1, NOW, LATER));
    expect(dayStatus(plan, DAY, water, LATER)).toBe('partial');
  });

  it('is partial when everything is eaten but the water is short', () => {
    // A water need the day's food and planned drinks cannot cover, whatever the planner put on the day.
    const thirsty: Plan = {
      ...plan,
      targets: { ...plan.targets, waterTotalMl: plan.targets.waterTotalMl + 3000 },
    };
    expect(dayStatus(thirsty, DAY, eatAll(EMPTY_TRACKING), LATER)).toBe('partial');
  });

  it('is done when all is eaten, energy is within 90-110 % and the water is drunk', () => {
    let t = eatAll(EMPTY_TRACKING);
    const need = drinking(firstDay, plan.targets, t.days[DAY]).targetMl;
    for (let i = 0; i < Math.ceil(need / plan.targets.glassMl); i += 1)
      t = unwrap(addWater(t, DAY, 1, NOW, LATER));
    // Energy of the day as the target: exactly 100 %.
    const exact: Plan = {
      ...plan,
      targets: { ...plan.targets, energyKcal: totals(firstDay).energyKcal },
    };
    expect(dayStatus(exact, DAY, t, LATER)).toBe('done');
    const tooMuch: Plan = {
      ...plan,
      targets: { ...plan.targets, energyKcal: totals(firstDay).energyKcal / 1.5 },
    };
    expect(dayStatus(tooMuch, DAY, t, LATER)).toBe('partial');
    const tooLittle: Plan = {
      ...plan,
      targets: { ...plan.targets, energyKcal: totals(firstDay).energyKcal * 1.5 },
    };
    expect(dayStatus(tooLittle, DAY, t, LATER)).toBe('partial');
  });
});

describe('widgetValue', () => {
  it('gives eaten, planned and the day norm for the day scope', () => {
    const t = unwrap(
      markEaten(EMPTY_TRACKING, plan, DAY, firstEntry.mealId, firstEntry.itemId, true, NOW, LATER),
    );
    const v = widgetValue(plan, 'energyKcal', 'day', DAY, t);
    expect(v.planned).toBeCloseTo(totals(firstDay).energyKcal, 3);
    expect(v.eaten).toBeGreaterThan(0);
    expect(v.eaten).toBeLessThan(v.planned);
    expect(v.norm).toBe(plan.targets.energyKcal);
    expect(v.known).toBe(true);
    expect(v.nutrient).toBe('energyKcal');
  });

  it('scopes a meal to its share of the day', () => {
    const v = widgetValue(plan, 'energyKcal', 'meal', DAY, EMPTY_TRACKING, firstEntry.mealId);
    expect(v.planned).toBeCloseTo(totals(firstDay, { mealId: firstEntry.mealId }).energyKcal, 3);
    expect(v.norm).toBeGreaterThan(0);
    expect(v.norm).toBeLessThan(plan.targets.energyKcal);
  });

  it('sums the week of the date and scales the norm by the days in it', () => {
    const v = widgetValue(plan, 'energyKcal', 'week', DAY, EMPTY_TRACKING);
    const weekDays = plan.days.filter((d) => d.date <= '2026-11-08');
    expect(v.planned).toBeCloseTo(
      weekDays.reduce((s, d) => s + totals(d).energyKcal, 0),
      3,
    );
    expect(v.norm).toBeCloseTo(plan.targets.energyKcal * weekDays.length, 6);
  });

  it('maps the other nutrients to their norms', () => {
    const pick = (n: Parameters<typeof widgetValue>[1]) =>
      widgetValue(plan, n, 'day', DAY, EMPTY_TRACKING).norm;
    expect(pick('proteinG')).toBe(plan.targets.proteinG.target);
    expect(pick('fatG')).toBe(plan.targets.fatG.target);
    expect(pick('carbsG')).toBe(plan.targets.carbsG.target);
    expect(pick('fibreG')).toBe(plan.targets.fibreG.target);
    expect(pick('sodiumMg')).toBe(plan.targets.sodiumMaxMg);
    expect(pick('freeSugarsG')).toBe(plan.targets.freeSugarsMaxG);
    expect(pick('addedSugarsG')).toBe(plan.targets.freeSugarsMaxG);
    expect(pick('satFatG')).toBe(plan.targets.satFatMaxG);
    expect(pick('caffeineMg')).toBe(plan.targets.caffeineMaxMg);
    expect(pick('waterG')).toBe(plan.targets.waterTotalMl);
    expect(pick('calciumMg')).toBe(plan.targets.micros.calciumMg?.norm ?? null);
  });

  it('is null without a norm', () => {
    const noNorm: Plan = { ...plan, targets: { ...plan.targets, micros: {} } };
    expect(widgetValue(noNorm, 'calciumMg', 'day', DAY, EMPTY_TRACKING).norm).toBeNull();
  });

  it('is not known when a planned item has no data', () => {
    const item = (firstDay.meals[firstEntry.mealId] ?? [])[0];
    if (!item) throw new Error('no item');
    const holed: Plan = {
      ...plan,
      days: plan.days.map((d) =>
        d.date !== DAY
          ? d
          : {
              ...d,
              meals: {
                ...d.meals,
                [firstEntry.mealId]: (d.meals[firstEntry.mealId] ?? []).map((i, k) =>
                  k === 0 ? { ...i, nutrients: { ...i.nutrients, vitaminCMg: null } } : i,
                ),
              },
            },
      ),
    };
    const v = widgetValue(holed, 'vitaminCMg', 'day', DAY, EMPTY_TRACKING);
    expect(v.known).toBe(false);
  });
});
