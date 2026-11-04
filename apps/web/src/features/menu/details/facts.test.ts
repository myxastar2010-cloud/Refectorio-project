import { emptyVector } from '@refectorio/food-data';
import type { DayTargets, ItemView, PlannedItem } from '@refectorio/menu-core';
import { quizAnswers } from '../../../../../../packages/menu-core/src/testing';
import { describe, expect, it } from 'vitest';
import { allergenChecks, macroRows, microRows, portionIngredients } from './facts';

const range = (target: number) => ({ min: target * 0.8, target, max: target * 1.2 });

const targets = {
  energyKcal: 2000,
  proteinG: range(100),
  fatG: range(70),
  carbsG: range(250),
  fibreG: { min: 25, target: 28 },
  freeSugarsMaxG: 50,
  freeSugarsGoalG: 25,
  satFatMaxG: 20,
  sodiumMaxMg: 2000,
  potassiumMinMg: 3500,
  vegFruitMinG: 400,
  waterTotalMl: 2500,
  glassMl: 250,
  caffeineMaxMg: 400,
  caffeineSingleMaxMg: 200,
  mealProteinMinG: 20,
  micros: { ironMg: { norm: 18 }, vitaminCMg: { norm: 100, ul: 2000 } },
} satisfies DayTargets;

const nutrients = {
  ...emptyVector(),
  energyKcal: 500,
  proteinG: 25,
  fatG: 14,
  satFatG: 5,
  carbsG: 60,
  fibreG: 7,
  sodiumMg: 400,
  ironMg: 4.5,
  potassiumMg: 700,
};

const item: PlannedItem = {
  itemId: 'm_test',
  role: 'main',
  slot: 'core',
  portion: { kind: 'factor', factor: 1.5 },
  grams: 300,
  nutrients,
  reasons: ['proteinRich'],
  servedWithout: ['TREE_NUT'],
};

const view: ItemView = {
  id: 'm_test',
  nameRu: 'Тест',
  unitRu: 'тарелка',
  descriptionRu: '',
  role: 'main',
  cuisine: null,
  allergens: ['MILK'],
  servingAllergens: ['TREE_NUT'],
  traces: ['SESAME'],
  flags: [],
  portion: { grams: 200, ml: null, pieces: null },
  cookMin: 20,
  per100g: { ...emptyVector(), energyKcal: 167, sodiumMg: 133 },
  ingredients: [{ id: 'i1', nameRu: 'Крупа', g: 60 }],
};

describe('dish details facts', () => {
  it('shares of the day: energy, macros, saturated fat and salt against their limits', () => {
    const rows = Object.fromEntries(macroRows(item, view, targets).map((r) => [r.id, r]));
    expect(rows.energy?.share).toBeCloseTo(0.25);
    expect(rows.protein?.share).toBeCloseTo(0.25);
    expect(rows.satFat?.share).toBeCloseTo(0.25);
    // Salt = sodium × 2.5: 400 mg → 1 g; the limit 2000 mg → 5 g.
    expect(rows.salt?.perPortion).toBeCloseTo(1);
    expect(rows.salt?.share).toBeCloseTo(0.2);
    expect(rows.sugars?.share).toBeNull();
    // Unknown is not zero.
    expect(rows.sugars?.perPortion).toBeNull();
    expect(rows.energy?.per100).toBe(167);
  });

  it('micronutrients: the person’s norm, the potassium floor, «нет нормы»', () => {
    const rows = microRows(item, targets, ['ironMg', 'potassiumMg', 'zincMg']);
    expect(rows[0]?.share).toBeCloseTo(0.25);
    expect(rows[1]?.norm).toBe(3500);
    expect(rows[2]).toMatchObject({ value: null, norm: null, share: null });
  });

  it('ingredients scale with the portion', () => {
    expect(portionIngredients(view, item)[0]?.g).toBeCloseTo(90);
  });

  it('allergies against the dish: served without, present, traces, absent', () => {
    const answers = quizAnswers({
      allergies: {
        items: [
          { code: 'TREE_NUT', level: 'allergy' },
          { code: 'MILK', level: 'intolerance' },
          { code: 'SESAME', level: 'allergy' },
          { code: 'FISH', level: 'allergy' },
        ],
        custom: ['киви'],
      },
    });
    const { checks, custom } = allergenChecks(answers, view, item);
    expect(checks.map((c) => c.state)).toEqual(['servedWithout', 'present', 'trace', 'absent']);
    expect(custom).toEqual(['киви']);
    expect(allergenChecks(null, view, item).checks).toEqual([]);
  });
});
