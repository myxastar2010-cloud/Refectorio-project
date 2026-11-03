import { describe, expect, it } from 'vitest';
import { buildContext, compileRules } from './context';
import {
  daysScopeSchema,
  inDays,
  inMeals,
  matcher,
  parseRules,
  ruleSchema,
  type Rule,
} from './dsl';
import { generate } from './generate';
import { buildMenuProfile, type MenuProfile } from './profile';
import { DEFAULT_STRUCTURE } from './structure';
import { quizAnswers, type AnswersOverrides, testFoods } from './testing';

const foods = testFoods();

function profileFor(overrides: AnswersOverrides = {}): MenuProfile {
  const result = buildMenuProfile(quizAnswers(overrides), { foods });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
const profile = profileFor();

const common = { createdBy: 'user', textRu: 'Правило', active: true } as const;
let counter = 0;
type Body = Rule extends infer R
  ? R extends Rule
    ? Omit<R, 'id' | 'createdBy' | 'textRu' | 'active'>
    : never
  : never;
function make(body: Body, extra: Partial<Pick<Rule, 'days' | 'meals' | 'active'>> = {}): Rule {
  counter += 1;
  return ruleSchema.parse({ ...common, id: `r${counter}`, ...body, ...extra });
}
const conflictsOf = (rules: readonly Rule[], p: MenuProfile = profile) =>
  buildContext(p, foods, DEFAULT_STRUCTURE, rules).rules.conflicts;

describe('ruleSchema', () => {
  const samples: Rule[] = [
    make({ kind: 'excludeIngredient', target: { category: 'mushrooms' } }),
    make({ kind: 'excludeItem', itemId: 'd_omelette' }),
    make({ kind: 'includeItem', target: { itemId: 'd_omelette' } }),
    make({ kind: 'minNutrient', nutrient: 'proteinG', per: 'day', value: 90 }),
    make({ kind: 'maxNutrient', nutrient: 'sodiumMg', per: 'meal', value: 800 }),
    make({ kind: 'frequency', target: { category: 'fish' }, minPerWeek: 2, maxPerWeek: 4 }),
    make({ kind: 'replaceCategory', from: 'beef', to: 'chicken' }),
    make({ kind: 'preferLess', target: { ingredientId: 'i_sugar' } }),
    make({ kind: 'preferMore', target: { category: 'legumes' } }),
    make({ kind: 'goal', goal: 'maintain' }),
    make({ kind: 'mealStructure', mealKinds: ['breakfast', 'lunch', 'dinner'] }),
  ];

  it('accepts every kind', () => {
    expect(new Set(samples.map((s) => s.kind)).size).toBe(11);
    for (const sample of samples) expect(ruleSchema.safeParse(sample).success).toBe(true);
    expect(parseRules(samples).success).toBe(true);
  });

  it('rejects a bad item id, category, date and kind', () => {
    expect(
      ruleSchema.safeParse({ ...common, id: 'a', kind: 'excludeItem', itemId: 'omelette' }).success,
    ).toBe(false);
    expect(
      ruleSchema.safeParse({
        ...common,
        id: 'a',
        kind: 'excludeIngredient',
        target: { category: 'nonsense' },
      }).success,
    ).toBe(false);
    expect(
      ruleSchema.safeParse({
        ...common,
        id: 'a',
        kind: 'excludeItem',
        itemId: 'd_omelette',
        days: { kind: 'dates', dates: ['2026-02-30'] },
      }).success,
    ).toBe(false);
    expect(ruleSchema.safeParse({ ...common, id: 'a', kind: 'dance' }).success).toBe(false);
    expect(
      ruleSchema.safeParse({ ...common, id: '', kind: 'excludeItem', itemId: 'd_omelette' })
        .success,
    ).toBe(false);
    expect(
      ruleSchema.safeParse({
        ...common,
        id: 'a',
        textRu: ' ',
        kind: 'excludeItem',
        itemId: 'd_omelette',
      }).success,
    ).toBe(false);
  });

  it('rejects a list of more than 100 rules', () => {
    const one = samples[1];
    expect(parseRules(Array.from({ length: 101 }, () => one)).success).toBe(false);
  });

  it('checks day scopes', () => {
    expect(daysScopeSchema.safeParse({ kind: 'weekdaysOf', days: [0, 6] }).success).toBe(true);
    expect(daysScopeSchema.safeParse({ kind: 'weekdaysOf', days: [7] }).success).toBe(false);
    expect(daysScopeSchema.safeParse({ kind: 'weekdaysOf', days: [] }).success).toBe(false);
  });
});

describe('inDays and inMeals', () => {
  const monday = '2026-11-02';
  const saturday = '2026-11-07';

  it('covers every day without a scope', () => {
    expect(inDays(undefined, monday)).toBe(true);
    expect(inDays({ kind: 'all' }, saturday)).toBe(true);
  });

  it('separates weekdays and weekends', () => {
    expect(inDays({ kind: 'weekdays' }, monday)).toBe(true);
    expect(inDays({ kind: 'weekdays' }, saturday)).toBe(false);
    expect(inDays({ kind: 'weekends' }, monday)).toBe(false);
    expect(inDays({ kind: 'weekends' }, saturday)).toBe(true);
  });

  it('matches chosen weekdays and dates', () => {
    expect(inDays({ kind: 'weekdaysOf', days: [0, 2] }, monday)).toBe(true);
    expect(inDays({ kind: 'weekdaysOf', days: [0, 2] }, '2026-11-03')).toBe(false);
    expect(inDays({ kind: 'dates', dates: [saturday] }, saturday)).toBe(true);
    expect(inDays({ kind: 'dates', dates: [saturday] }, monday)).toBe(false);
  });

  it('matches meals', () => {
    expect(inMeals(undefined, 'lunch')).toBe(true);
    expect(inMeals(['lunch'], 'lunch')).toBe(true);
    expect(inMeals(['lunch'], 'dinner')).toBe(false);
  });
});

describe('matcher', () => {
  const view = {
    id: 'd_a',
    categories: new Set(['fish'] as const),
    ingredientIds: new Set(['i_salt']),
  };

  it('matches an item, a category or an ingredient', () => {
    expect(matcher({ itemId: 'd_a' })(view)).toBe(true);
    expect(matcher({ itemId: 'd_b' })(view)).toBe(false);
    expect(matcher({ category: 'fish' })(view)).toBe(true);
    expect(matcher({ category: 'beef' })(view)).toBe(false);
    expect(matcher({ ingredientId: 'i_salt' })(view)).toBe(true);
    expect(matcher({ ingredientId: 'i_pepper' })(view)).toBe(false);
  });
});

describe('rule compilation', () => {
  it('compiles every kind without conflicts for a valid set', () => {
    const rules = [
      make(
        { kind: 'excludeIngredient', target: { category: 'mushrooms' } },
        { days: { kind: 'weekdays' } },
      ),
      make({ kind: 'excludeItem', itemId: 'd_kiwi' }, { meals: ['snack'] }),
      make({ kind: 'frequency', target: { category: 'fish' }, minPerWeek: 2 }),
      make({ kind: 'replaceCategory', from: 'beef', to: 'chicken' }),
      make({ kind: 'preferLess', target: { category: 'sugar' } }),
      make({ kind: 'preferMore', target: { category: 'legumes' } }),
      make({ kind: 'minNutrient', nutrient: 'proteinG', per: 'day', value: 80 }),
      make({ kind: 'maxNutrient', nutrient: 'vitaminKUg', per: 'meal', value: 500 }),
      make(
        { kind: 'includeItem', target: { itemId: 'd_omelette' } },
        { meals: ['breakfast'], days: { kind: 'weekends' } },
      ),
    ];
    const compiled = buildContext(profile, foods, DEFAULT_STRUCTURE, rules).rules;
    expect(compiled.conflicts).toEqual([]);
    expect(compiled.excluders).toHaveLength(3);
    expect(compiled.includes).toHaveLength(1);
    expect(compiled.frequency).toEqual([expect.objectContaining({ min: 2, max: 21 })]);
    expect(compiled.prefer.map((p) => p.sign).sort()).toEqual([-1, -1, 1]);
    expect(compiled.limits).toHaveLength(2);
    expect(compiled.extraNutrients).toContain('vitaminKUg');
  });

  it('ignores inactive rules', () => {
    const rules = [make({ kind: 'excludeItem', itemId: 'd_not_there' }, { active: false })];
    const compiled = compileRules(rules, foods.foods, []);
    expect(compiled.excluders).toEqual([]);
    expect(compiled.conflicts).toEqual([]);
  });

  it('flags including an item the person is allergic to as a safety conflict', () => {
    const allergic = profileFor({
      allergies: { items: [{ code: 'EGG', level: 'allergy' }], custom: [] },
    });
    const rule = make({ kind: 'includeItem', target: { itemId: 'd_omelette' } });
    const conflicts = conflictsOf([rule], allergic);
    expect(conflicts.map((c) => [c.ruleId, c.code])).toEqual([[rule.id, 'RULE_CONFLICTS_SAFETY']]);
    expect(conflicts[0]?.detail).toContain('allergen');
  });

  it('flags unknown items, ingredients and excluded unknown items', () => {
    const include = make({ kind: 'includeItem', target: { itemId: 'd_no_such_dish' } });
    const ingredient = make({
      kind: 'excludeIngredient',
      target: { ingredientId: 'i_no_such_thing' },
    });
    const exclude = make({ kind: 'excludeItem', itemId: 'd_no_such_dish' });
    const conflicts = conflictsOf([include, ingredient, exclude]);
    expect(conflicts.map((c) => [c.ruleId, c.code])).toEqual([
      [include.id, 'RULE_UNKNOWN_TARGET'],
      [ingredient.id, 'RULE_UNKNOWN_TARGET'],
      [exclude.id, 'RULE_UNKNOWN_TARGET'],
    ]);
    expect(conflicts[2]?.detail).toBe('d_no_such_dish');
  });

  it('flags a known category with no items as infeasible', () => {
    const rule = make({ kind: 'excludeIngredient', target: { category: 'alcohol' } });
    const fakeFoods = foods.foods.filter((f) => !f.categories.has('alcohol'));
    const compiled = compileRules([rule], fakeFoods, []);
    expect(compiled.conflicts).toEqual([{ ruleId: rule.id, code: 'RULE_INFEASIBLE' }]);
  });

  it('flags including and excluding the same item', () => {
    const include = make({ kind: 'includeItem', target: { itemId: 'd_omelette' } });
    const exclude = make({ kind: 'excludeItem', itemId: 'd_omelette' });
    const conflicts = conflictsOf([include, exclude]);
    expect(conflicts).toEqual([
      { ruleId: include.id, code: 'RULE_CONTRADICTS_RULE', detail: exclude.id },
    ]);
  });

  it('does not flag include and exclude on different meals', () => {
    const include = make(
      { kind: 'includeItem', target: { itemId: 'd_omelette' } },
      { meals: ['breakfast'] },
    );
    const exclude = make({ kind: 'excludeItem', itemId: 'd_omelette' }, { meals: ['dinner'] });
    expect(conflictsOf([include, exclude])).toEqual([]);
  });

  it('says goal and mealStructure are not filters', () => {
    const goal = make({ kind: 'goal', goal: 'maintain' });
    const meals = make({ kind: 'mealStructure', mealKinds: ['lunch', 'dinner'] });
    expect(conflictsOf([goal, meals]).map((c) => [c.ruleId, c.code])).toEqual([
      [goal.id, 'RULE_NOT_A_FILTER'],
      [meals.id, 'RULE_NOT_A_FILTER'],
    ]);
  });
});

describe('an excludeIngredient rule in a plan', () => {
  it('removes the category from a generated plan', () => {
    const rule = make({ kind: 'excludeIngredient', target: { category: 'mushrooms' } });
    const result = generate({
      profile,
      foods,
      today: '2026-11-04',
      seed: 3,
      iterationsPerDay: 20,
      rules: [rule],
    });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const planned = result.value.plan.days.flatMap((d) => Object.values(d.meals).flat());
    expect(planned.length).toBeGreaterThan(0);
    for (const item of planned)
      expect(foods.byId.get(item.itemId)?.categories.has('mushrooms')).toBe(false);
    expect(result.value.plan.rules).toEqual([rule]);
  });

  it('is refused as a plan error when the rules conflict', () => {
    const rule = make({ kind: 'includeItem', target: { itemId: 'd_no_such_dish' } });
    const result = generate({
      profile,
      foods,
      today: '2026-11-04',
      seed: 3,
      iterationsPerDay: 5,
      rules: [rule],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('rulesConflict');
  });
});
