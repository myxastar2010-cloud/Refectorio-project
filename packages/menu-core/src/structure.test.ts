import { describe, expect, it } from 'vitest';
import { rule } from './rules';
import {
  addMeal,
  canRemoveMeal,
  checkStructure,
  DEFAULT_STRUCTURE,
  isMainMeal,
  kindOfMealId,
  mealHours,
  mealShares,
  moveMeal,
  removeMeal,
  structureFromKinds,
} from './structure';

const sum = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0);

describe('structureFromKinds', () => {
  it('titles the main meals and numbers several snacks', () => {
    const meals = structureFromKinds(['breakfast', 'snack', 'lunch', 'snack', 'dinner']);
    expect(meals.map((m) => m.titleRu)).toEqual([
      'Завтрак',
      'Перекус 1',
      'Обед',
      'Перекус 2',
      'Ужин',
    ]);
    expect(meals.map((m) => m.id)).toEqual(['breakfast', 'snack-1', 'lunch', 'snack-2', 'dinner']);
    expect(meals.map((m) => m.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('leaves a single snack without a number', () => {
    expect(structureFromKinds(['lunch', 'snack']).map((m) => m.titleRu)).toEqual([
      'Обед',
      'Перекус',
    ]);
  });

  it('has a default day of four meals', () => {
    expect(DEFAULT_STRUCTURE.map((m) => m.kind)).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
  });

  it('knows main meals', () => {
    expect(isMainMeal('lunch')).toBe(true);
    expect(isMainMeal('snack')).toBe(false);
  });
});

describe('mealShares', () => {
  it('follows R17 E17: 25 / 35 / 15 / 25 for the default day', () => {
    const shares = mealShares(DEFAULT_STRUCTURE);
    expect(shares.get('breakfast')).toBeCloseTo(0.25);
    expect(shares.get('lunch')).toBeCloseTo(0.35);
    expect(shares.get('snack-1')).toBeCloseTo(0.15);
    expect(shares.get('dinner')).toBeCloseTo(0.25);
  });

  it('shares the snack allowance between snacks and sums to 1', () => {
    const shares = mealShares(
      structureFromKinds(['breakfast', 'snack', 'lunch', 'snack', 'dinner']),
    );
    expect(shares.get('snack-1')).toBeCloseTo(shares.get('snack-2') ?? -1);
    expect(sum(shares.values())).toBeCloseTo(1);
  });

  it('is renormalised when meals are missing', () => {
    const shares = mealShares(structureFromKinds(['lunch', 'dinner']));
    expect(sum(shares.values())).toBeCloseTo(1);
    expect(shares.get('lunch')).toBeCloseTo(0.35 / 0.6);
  });
});

describe('mealHours', () => {
  it('puts main meals at their R17 E14 hours', () => {
    const hours = mealHours(DEFAULT_STRUCTURE);
    expect(hours.get('breakfast')).toBe(rule('E14.mealHour.breakfast'));
    expect(hours.get('dinner')).toBe(rule('E14.mealHour.dinner'));
  });

  it('puts a snack halfway between its neighbours', () => {
    const hours = mealHours(DEFAULT_STRUCTURE);
    expect(hours.get('snack-1')).toBeCloseTo(
      (rule('E14.mealHour.lunch') + rule('E14.mealHour.dinner')) / 2,
    );
  });

  it('puts a last snack 3 h after the last meal and a first snack 3 h before the first', () => {
    const last = mealHours(structureFromKinds(['lunch', 'snack']));
    expect(last.get('snack-1')).toBe(rule('E14.mealHour.lunch') + 3);
    const first = mealHours(structureFromKinds(['snack', 'lunch']));
    expect(first.get('snack-1')).toBe(rule('E14.mealHour.lunch') - 3);
  });

  it('uses the snack hour when there is nothing else', () => {
    expect(mealHours(structureFromKinds(['snack'])).get('snack-1')).toBe(
      rule('E14.mealHour.snack'),
    );
  });
});

describe('checkStructure', () => {
  it('accepts the default day', () => {
    expect(checkStructure(DEFAULT_STRUCTURE, 3).ok).toBe(true);
  });

  it('rejects an empty day', () => {
    expect(checkStructure([], 2)).toEqual({ ok: false, error: { code: 'EMPTY' } });
  });

  it('rejects too many meals', () => {
    const many = structureFromKinds([
      'breakfast',
      'snack',
      'lunch',
      'snack',
      'dinner',
      'snack',
      'snack',
    ]);
    expect(many.length).toBeGreaterThan(rule('E16.maxMeals'));
    expect(checkStructure(many, 2)).toEqual({ ok: false, error: { code: 'TOO_MANY_MEALS' } });
  });

  it('rejects a repeated main meal', () => {
    expect(checkStructure(structureFromKinds(['lunch', 'lunch', 'dinner']), 2)).toEqual({
      ok: false,
      error: { code: 'DUPLICATE_MAIN_MEAL' },
    });
  });

  it('rejects fewer main meals than the person needs', () => {
    expect(checkStructure(structureFromKinds(['lunch', 'dinner', 'snack']), 3)).toEqual({
      ok: false,
      error: { code: 'TOO_FEW_MAIN_MEALS', minMainMeals: 3 },
    });
  });
});

describe('canRemoveMeal', () => {
  it('lets a snack go', () => {
    expect(canRemoveMeal(DEFAULT_STRUCTURE, 'snack-1', 3)).toBe(true);
  });

  it('keeps main meals at the minimum', () => {
    expect(canRemoveMeal(DEFAULT_STRUCTURE, 'lunch', 3)).toBe(false);
    expect(canRemoveMeal(DEFAULT_STRUCTURE, 'lunch', 2)).toBe(true);
  });

  it('is false for an unknown meal', () => {
    expect(canRemoveMeal(DEFAULT_STRUCTURE, 'brunch', 2)).toBe(false);
  });
});

describe('stable meal ids (review of phase 3, M6)', () => {
  const ids = (meals: readonly { id: string }[]) => meals.map((m) => m.id);
  const value = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.value;
  };

  it('adds a snack into the longest gap with a new number; the old snack keeps its id', () => {
    const next = value(addMeal(DEFAULT_STRUCTURE, 'snack'));
    expect(ids(next)).toEqual(['breakfast', 'snack-2', 'lunch', 'snack-1', 'dinner']);
    expect(next.map((m) => m.titleRu)).toEqual([
      'Завтрак',
      'Перекус 1',
      'Обед',
      'Перекус 2',
      'Ужин',
    ]);
    expect(next.map((m) => m.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('puts a main meal back at its hour', () => {
    const noLunch = structureFromKinds(['breakfast', 'snack', 'dinner']);
    expect(ids(value(addMeal(noLunch, 'lunch')))).toEqual([
      'breakfast',
      'lunch',
      'snack-1',
      'dinner',
    ]);
    const noDinner = structureFromKinds(['breakfast', 'lunch', 'snack']);
    expect(ids(value(addMeal(noDinner, 'dinner')))).toEqual([
      'breakfast',
      'lunch',
      'snack-1',
      'dinner',
    ]);
    expect(ids(value(addMeal(structureFromKinds(['lunch']), 'snack')))).toEqual([
      'lunch',
      'snack-1',
    ]);
  });

  it('refuses a second main meal of a kind and a seventh meal', () => {
    expect(addMeal(DEFAULT_STRUCTURE, 'lunch')).toEqual({
      ok: false,
      error: { code: 'DUPLICATE_MAIN_MEAL' },
    });
    let six = DEFAULT_STRUCTURE;
    six = value(addMeal(six, 'snack'));
    six = value(addMeal(six, 'snack'));
    expect(six).toHaveLength(6);
    expect(addMeal(six, 'snack')).toEqual({ ok: false, error: { code: 'TOO_MANY_MEALS' } });
  });

  it('removes and moves meals without renaming the others', () => {
    const five = value(addMeal(DEFAULT_STRUCTURE, 'snack'));
    const four = value(removeMeal(five, 'snack-2', 2));
    expect(ids(four)).toEqual(['breakfast', 'lunch', 'snack-1', 'dinner']);
    expect(four[2]?.titleRu).toBe('Перекус');
    expect(ids(value(addMeal(four, 'snack')))).toContain('snack-2');
    const moved = value(moveMeal(five, 'snack-1', 0));
    expect(ids(moved)).toEqual(['snack-1', 'breakfast', 'snack-2', 'lunch', 'dinner']);
    expect(moved.map((m) => m.order)).toEqual([0, 1, 2, 3, 4]);
    expect(removeMeal(five, 'snack-9', 2)).toEqual({
      ok: false,
      error: { code: 'NO_SUCH_MEAL', mealId: 'snack-9' },
    });
    expect(moveMeal(five, 'brunch', 1).ok).toBe(false);
    expect(removeMeal(four, 'lunch', 3)).toEqual({
      ok: false,
      error: { code: 'TOO_FEW_MAIN_MEALS', minMainMeals: 3 },
    });
  });

  it('checks ids against kinds, duplicates and positions', () => {
    const [breakfast, lunch] = DEFAULT_STRUCTURE;
    if (!breakfast || !lunch) throw new Error('no meals');
    expect(kindOfMealId('snack-12')).toBe('snack');
    expect(kindOfMealId('snack-0')).toBeNull();
    expect(kindOfMealId('lunch')).toBe('lunch');
    expect(checkStructure([{ ...breakfast, id: 'snack-1' }], 0)).toEqual({
      ok: false,
      error: { code: 'BAD_ID', mealId: 'snack-1' },
    });
    const snack = { id: 'snack-1', kind: 'snack', titleRu: 'Перекус', order: 1 } as const;
    expect(checkStructure([breakfast, snack, { ...snack, order: 2 }], 0)).toEqual({
      ok: false,
      error: { code: 'DUPLICATE_ID', mealId: 'snack-1' },
    });
    expect(checkStructure([lunch, breakfast], 0)).toEqual({
      ok: false,
      error: { code: 'BAD_ORDER', mealId: 'lunch' },
    });
  });
});
