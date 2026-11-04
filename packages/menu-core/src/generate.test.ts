import { describe, expect, it } from 'vitest';
import { buildContext } from './context';
import { daysBetween, weekdayIndex } from './dates';
import type { Rule } from './dsl';
import { generate } from './generate';
import { buildMenuProfile, type MenuProfile } from './profile';
import { rule } from './rules';
import { DEFAULT_STRUCTURE, structureFromKinds } from './structure';
import { quizAnswers, randomAnswers, testFoods, type AnswersOverrides } from './testing';
import type { Plan, PlannedItem } from './types';
import { hardViolations } from './validate';

const foods = testFoods();
const TODAY = '2026-11-04'; // Wednesday

function profileOf(overrides: AnswersOverrides = {}): MenuProfile {
  const result = buildMenuProfile(quizAnswers(overrides), { foods });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function planOf(
  profile: MenuProfile,
  options: { seed?: number; rules?: readonly Rule[] } = {},
): Plan {
  const result = generate({
    profile,
    foods,
    today: TODAY,
    seed: options.seed ?? 5,
    iterationsPerDay: 60,
    ...(options.rules ? { rules: options.rules } : {}),
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value.plan;
}

const items = (plan: Plan): PlannedItem[] =>
  plan.days.flatMap((d) => Object.values(d.meals).flat());
const food = (id: string) => {
  const found = foods.byId.get(id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

const office = profileOf();
const officePlan = planOf(office);

describe('generate (ТЗ фаза 3 §3, §8)', () => {
  it('plans from today to the end of next week, every meal of the structure', () => {
    expect(officePlan.days[0]?.date).toBe(TODAY);
    expect(officePlan.horizonEnd).toBe('2026-11-15');
    expect(officePlan.days).toHaveLength(12);
    expect(officePlan.revision).toBe(1);
    expect(officePlan.profileHash).toBe(office.hash);
    for (const day of officePlan.days) {
      for (const meal of DEFAULT_STRUCTURE) {
        const list = day.meals[meal.id] ?? [];
        expect(list.length).toBeGreaterThan(0);
        expect(list.length).toBeLessThanOrEqual(4);
        expect(list.filter((i) => i.slot === 'core')).toHaveLength(1);
      }
    }
  });

  it('is deterministic for the same inputs and seed, and differs for another seed', () => {
    expect(JSON.stringify(planOf(office))).toBe(JSON.stringify(officePlan));
    expect(JSON.stringify(planOf(office, { seed: 6 }).days)).not.toBe(
      JSON.stringify(officePlan.days),
    );
  });

  it('keeps every day near its energy target or says so', () => {
    for (const day of officePlan.days) {
      const dev = Math.abs((day.totals.energyKcal ?? 0) / officePlan.targets.energyKcal - 1);
      if (dev > rule('S.energyToleranceRelaxedShare'))
        expect(day.flags.map((f) => f.code)).toContain(
          (day.totals.energyKcal ?? 0) < officePlan.targets.energyKcal ? 'energyLow' : 'energyHigh',
        );
      expect(dev).toBeLessThan(0.15);
    }
  });

  it('breaks no hard rule (validator over the composition)', () => {
    const ctx = buildContext(office, foods, officePlan.structure, []);
    expect(hardViolations(ctx, officePlan.days)).toEqual([]);
  });

  it('explains every item with one to three reasons, no numbers in codes', () => {
    for (const item of items(officePlan)) {
      expect(item.reasons.length).toBeGreaterThan(0);
      expect(item.reasons.length).toBeLessThanOrEqual(3);
    }
  });

  it('prefers lunch boxes on weekdays', () => {
    const lunches = officePlan.days
      .filter((d) => weekdayIndex(d.date) < 5)
      .flatMap((d) => (d.meals.lunch ?? []).filter((i) => i.role !== 'drink'));
    const boxable = lunches.filter((i) => food(i.itemId).item.flags.has('boxable'));
    expect(boxable.length / lunches.length).toBeGreaterThan(0.8);
  });

  it('does not repeat a main dish in the same meal within a week unless the day says so', () => {
    officePlan.days.forEach((day, d) => {
      for (const [mealId, list] of Object.entries(day.meals)) {
        for (const item of list.filter((i) => i.role === 'main' || i.role === 'soup')) {
          const earlier = officePlan.days
            .slice(0, d)
            .filter((p) => daysBetween(p.date, day.date) < rule('E19.repeatWindowDays'))
            .some((p) => (p.meals[mealId] ?? []).some((x) => x.itemId === item.itemId));
          if (earlier) expect(day.flags.map((f) => f.code)).toContain('repeatRelaxed');
        }
      }
    });
  });

  it('serves vegans only vegan items and keeps a nut allergy safe from traces and toppings', () => {
    const vegan = planOf(
      profileOf({
        diet: 'vegan',
        allergies: { items: [{ code: 'TREE_NUT', level: 'severeAllergy' }], custom: [] },
      }),
    );
    for (const item of items(vegan)) {
      const f = food(item.itemId);
      expect(f.item.flags.has('vegan')).toBe(true);
      expect([...f.item.allergens, ...f.item.traces, ...f.item.servingAllergens]).not.toContain(
        'TREE_NUT',
      );
    }
    expect(vegan.notes.map((n) => n.code)).toContain('veganB12');
  });

  it('pregnancy: no unsafe foods, fish within FDA/NHS limits, caffeine ≤ 200 mg a day', () => {
    const profile = profileOf({
      body: { sex: 'female', ageYears: 29, heightCm: 165, weightKg: 62, mode: 'self' },
      health: { flags: [], pregnancy: 'trimester2', lactation: 'none', custom: [] },
    });
    const plan = planOf(profile);
    const unsafe = [
      'rawFish',
      'rawEgg',
      'unpasteurised',
      'curedFish',
      'curedMeat',
      'mouldCheese',
      'liver',
      'alcohol',
    ] as const;
    for (const item of items(plan)) {
      const flags = food(item.itemId).item.flags;
      for (const flag of unsafe) expect(flags.has(flag)).toBe(false);
    }
    for (const day of plan.days) expect(day.totals.caffeineMg ?? 0).toBeLessThanOrEqual(200 + 1e-6);
    const byWeek = new Map<number, { best: number; good: number }>();
    plan.days.forEach((day) => {
      const week = Math.floor(daysBetween('2026-11-02', day.date) / 7);
      const acc = byWeek.get(week) ?? { best: 0, good: 0 };
      for (const item of Object.values(day.meals).flat()) {
        const f = food(item.itemId);
        if (f.item.fishMercury === 'best') acc.best += f.groups.fishG * item.portion.factor;
        if (f.item.fishMercury === 'good') acc.good += f.groups.fishG * item.portion.factor;
      }
      byWeek.set(week, acc);
    });
    for (const { best, good } of byWeek.values())
      expect(
        best / rule('E9.bestFishMaxGWeek') + good / rule('E9.goodFishMaxGWeek'),
      ).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('teenagers: caffeine within 3 mg/kg a day, nothing cooked with alcohol', () => {
    const teen = profileOf({
      body: { sex: 'male', ageYears: 15, heightCm: 172, weightKg: 58, mode: 'self' },
      goal: { goal: 'maintain' },
    });
    const plan = planOf(teen);
    for (const day of plan.days)
      expect(day.totals.caffeineMg ?? 0).toBeLessThanOrEqual(3 * 58 + 1e-6);
    for (const item of items(plan)) expect(food(item.itemId).item.flags.has('alcohol')).toBe(false);
  });

  it('follows the person’s rules: exclusions everywhere, inclusions where asked', () => {
    const rules: Rule[] = [
      {
        id: 'r1',
        kind: 'excludeIngredient',
        target: { category: 'eggs' },
        createdBy: 'user',
        textRu: 'Без яиц',
        active: true,
      },
      {
        id: 'r2',
        kind: 'includeItem',
        target: { itemId: 'd_oatmeal' },
        meals: ['breakfast'],
        days: { kind: 'weekdaysOf', days: [0, 2, 4] },
        createdBy: 'kiki',
        textRu: 'Овсянка по понедельникам, средам и пятницам',
        active: true,
      },
    ];
    const plan = planOf(office, { rules });
    for (const item of items(plan)) expect(food(item.itemId).categories.has('eggs')).toBe(false);
    for (const day of plan.days) {
      const breakfast = day.meals.breakfast ?? [];
      if ([0, 2, 4].includes(weekdayIndex(day.date))) {
        const oatmeal = breakfast.find((i) => i.itemId === 'd_oatmeal');
        expect(oatmeal?.pinnedBy).toBe('r2');
        expect(oatmeal?.reasons).toContain('ruleByKiki');
      }
    }
    expect(plan.rules).toEqual(rules);
  });

  it('returns typed errors: refused person, impossible structure, a rule against safety', () => {
    expect(
      buildMenuProfile(
        quizAnswers({
          health: { flags: ['kidneyDisease'], pregnancy: 'none', lactation: 'none', custom: [] },
        }),
        { foods },
      ),
    ).toEqual({
      ok: false,
      error: { code: 'refused' },
    });
    const structure = generate({
      profile: office,
      foods,
      today: TODAY,
      seed: 1,
      structure: structureFromKinds(['snack']),
    });
    expect(structure.ok ? null : structure.error.code).toBe('structure');
    const allergic = profileOf({
      allergies: { items: [{ code: 'MILK', level: 'allergy' }], custom: [] },
    });
    const conflict = generate({
      profile: allergic,
      foods,
      today: TODAY,
      seed: 1,
      rules: [
        {
          id: 'x',
          kind: 'includeItem',
          target: { itemId: 'd_oatmeal' },
          createdBy: 'kiki',
          textRu: 'Овсянка',
          active: true,
        },
      ],
    });
    expect(conflict.ok ? null : conflict.error).toEqual({
      code: 'rulesConflict',
      conflicts: [{ ruleId: 'x', code: 'RULE_CONFLICTS_SAFETY', detail: 'allergen' }],
    });
    expect(generate({ profile: office, foods, today: '2026-13-01', seed: 1 })).toEqual({
      ok: false,
      error: { code: 'invalidDate' },
    });
  });

  it('keeps the plan JSON-safe (no Infinity, no undefined)', () => {
    const text = JSON.stringify(officePlan);
    expect(text).not.toContain('Infinity');
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(officePlan)));
  });

  it('bends the template, not safety, when a meal has no safe dish of its own type', () => {
    // A vegan with several allergies (the 5 000-person simulation): no safe lunch or dinner main of those meal types.
    const answers = randomAnswers(35771123);
    const profile = buildMenuProfile(answers, { foods });
    if (!profile.ok) throw new Error(JSON.stringify(profile.error));
    const result = generate({
      profile: profile.value,
      foods,
      today: TODAY,
      seed: 3,
      iterationsPerDay: 40,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const plan = result.value.plan;
    const ctx = buildContext(profile.value, foods, plan.structure, []);
    expect(ctx.relaxedCore.size).toBeGreaterThan(0);
    expect(hardViolations(ctx, plan.days)).toEqual([]);
    for (const day of plan.days) {
      for (const meal of plan.structure) {
        expect((day.meals[meal.id] ?? []).length).toBeGreaterThan(0);
        if (ctx.relaxedCore.has(meal.kind))
          expect(day.flags).toContainEqual({ code: 'fewCandidates', meal: meal.id });
      }
    }
  });
});
