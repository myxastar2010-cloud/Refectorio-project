/**
 * Re-planning around what already happened (review of phase 3, C2 and C3): eaten items are facts, and a new profile in
 * the middle of a week (the quiz taken again) keeps the week's limits.
 */
import { describe, expect, it } from 'vitest';
import { buildContext } from './context';
import { generate } from './generate';
import { changeTargets, regenerate } from './operations';
import { buildMenuProfile, type MenuProfile } from './profile';
import { quizAnswers, testFoods, type AnswersOverrides } from './testing';
import { EMPTY_TRACKING, markEaten, markKey, type Tracking } from './tracking';
import type { AllergenCode } from '@refectorio/nutrition-core';
import { hardViolations } from './validate';

const foods = testFoods();

function profileOf(overrides: AnswersOverrides = {}): MenuProfile {
  const result = buildMenuProfile(quizAnswers(overrides), { foods });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('re-planning around facts', () => {
  it('an eaten item against a new allergy: re-planning works, the future is safe, the fact stays', () => {
    const today = '2026-11-04';
    const before = profileOf();
    const generated = generate({ profile: before, foods, today, seed: 9, iterationsPerDay: 40 });
    if (!generated.ok) throw new Error(JSON.stringify(generated.error));
    const plan = generated.value.plan;
    const first = plan.days[0];
    if (!first) throw new Error('no days');
    // The first item of today that carries an allergen: the person ate it, then reports that allergy.
    let eaten: { mealId: string; itemId: string; allergen: AllergenCode } | null = null;
    for (const [mealId, items] of Object.entries(first.meals))
      for (const item of items) {
        const allergen = foods.byId.get(item.itemId)?.item.allergens[0];
        if (!eaten && allergen) eaten = { mealId, itemId: item.itemId, allergen };
      }
    if (!eaten) throw new Error('no allergen on the first day');
    const marked = markEaten(
      EMPTY_TRACKING,
      plan,
      today,
      eaten.mealId,
      eaten.itemId,
      true,
      `${today}T08:30:00.000Z`,
      today,
    );
    if (!marked.ok) throw new Error(JSON.stringify(marked.error));
    const tracking: Tracking = marked.value;
    const after = profileOf({
      allergies: { items: [{ code: eaten.allergen, level: 'allergy' }], custom: [] },
    });
    const result = regenerate({ profile: after, foods }, plan, {
      today,
      tracking,
      iterationsPerDay: 40,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const next = result.value.plan;
    const today2 = next.days.find((d) => d.date === today);
    expect(today2?.meals[eaten.mealId]?.some((i) => i.itemId === eaten.itemId)).toBe(true);
    const marks = tracking.days[today]?.eaten ?? {};
    for (const day of next.days)
      for (const [mealId, items] of Object.entries(day.meals))
        for (const item of items) {
          if (day.date === today && marks[markKey(mealId, item.itemId)] !== undefined) continue;
          expect(foods.byId.get(item.itemId)?.item.allergens).not.toContain(eaten.allergen);
        }
    const ctx = buildContext(after, foods, next.structure, next.rules);
    expect(
      hardViolations(
        ctx,
        next.days,
        [],
        (date, mealId, itemId) => date === today && marks[markKey(mealId, itemId)] !== undefined,
      ),
    ).toEqual([]);
  });

  it('the quiz taken again on Thursday: re-planning keeps the week inside the pregnancy fish budget', () => {
    const pregnant: AnswersOverrides = {
      body: { sex: 'female', ageYears: 30, heightCm: 166, weightKg: 63, mode: 'self' },
      health: { flags: [], pregnancy: 'trimester2', lactation: 'none', custom: [] },
    };
    for (const seed of [2, 3, 4]) {
      const a = generate({
        profile: profileOf(pregnant),
        foods,
        today: '2026-11-02',
        seed,
        iterationsPerDay: 40,
      });
      if (!a.ok) throw new Error(JSON.stringify(a.error));
      const later = profileOf({
        ...pregnant,
        body: { sex: 'female', ageYears: 30, heightCm: 166, weightKg: 65, mode: 'self' },
      });
      const b = changeTargets({ profile: later, foods }, a.value.plan, {
        today: '2026-11-05',
        iterationsPerDay: 40,
      });
      if (!b.ok) throw new Error(JSON.stringify(b.error));
      const ctx = buildContext(later, foods, b.value.plan.structure, b.value.plan.rules);
      const fish = hardViolations(ctx, b.value.plan.days).filter((v) => v.code === 'fishWeek');
      expect(fish).toEqual([]);
    }
  });
});
