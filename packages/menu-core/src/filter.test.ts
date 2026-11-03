import type { AllergenCode, AllergenLevel } from '@refectorio/nutrition-core';
import { describe, expect, it } from 'vitest';
import { checkFood, HARD_REASONS } from './filter';
import type { MenuFood } from './foods';
import { buildMenuProfile, type MenuProfile, type SafetyContext } from './profile';
import { quizAnswers, type AnswersOverrides, testFoods } from './testing';

const foods = testFoods();

function profileFor(overrides: AnswersOverrides = {}): MenuProfile {
  const result = buildMenuProfile(quizAnswers(overrides), { foods });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const base = profileFor();
const withSafety = (patch: Partial<SafetyContext>): SafetyContext => ({ ...base.safety, ...patch });
const allergic = (code: AllergenCode, level: AllergenLevel): AnswersOverrides => ({
  allergies: { items: [{ code, level }], custom: [] },
});

const food = (id: string): MenuFood => {
  const found = foods.byId.get(id);
  if (!found) throw new Error(`no food ${id}`);
  return found;
};
const flagged = (flag: Parameters<MenuFood['item']['flags']['has']>[0]) =>
  foods.foods.filter((f) => f.item.flags.has(flag));
const reasons = (f: MenuFood, safety: SafetyContext): readonly string[] => {
  const v = checkFood(f, safety);
  return v.ok ? [] : v.reasons;
};

describe('checkFood', () => {
  it('lets ordinary food through for an omnivore with no restrictions', () => {
    const verdict = checkFood(food('d_buckwheat_porridge'), base.safety);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.servedWithout).toEqual([]);
      expect(verdict.fixedPortion).toBe(false);
    }
  });

  it('has a list of hard reasons', () => {
    expect(HARD_REASONS).toContain('allergen');
  });
});

describe('allergens', () => {
  it('excludes every item that contains the allergen', () => {
    const { safety } = profileFor(allergic('EGG', 'allergy'));
    const withEgg = foods.foods.filter((f) => f.item.allergens.includes('EGG'));
    expect(withEgg.length).toBeGreaterThan(0);
    for (const f of withEgg) expect(reasons(f, safety)).toContain('allergen');
  });

  it('excludes by traces only for a severe allergy', () => {
    const traced = foods.foods.find(
      (f) => f.item.traces.includes('GLUTEN') && !f.item.allergens.includes('GLUTEN'),
    );
    if (!traced) throw new Error('no item with gluten traces');
    expect(checkFood(traced, profileFor(allergic('GLUTEN', 'allergy')).safety).ok).toBe(true);
    expect(reasons(traced, profileFor(allergic('GLUTEN', 'severeAllergy')).safety)).toContain(
      'allergenTrace',
    );
  });

  it('excludes by serving allergens for a severe allergy', () => {
    const served = foods.foods.find(
      (f) => f.item.servingAllergens.includes('TREE_NUT') && !f.item.allergens.includes('TREE_NUT'),
    );
    if (!served) throw new Error('no item served with nuts');
    expect(reasons(served, profileFor(allergic('TREE_NUT', 'severeAllergy')).safety)).toContain(
      'allergenServing',
    );
  });

  it('keeps an item with only a serving allergen and leaves the add-on out', () => {
    const served = foods.foods.find(
      (f) =>
        f.item.servingAllergens.includes('TREE_NUT') &&
        !f.item.allergens.includes('TREE_NUT') &&
        !f.item.traces.includes('TREE_NUT'),
    );
    if (!served) throw new Error('no item served with nuts');
    const verdict = checkFood(served, profileFor(allergic('TREE_NUT', 'allergy')).safety);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.servedWithout).toEqual(['TREE_NUT']);
  });

  it('treats an intolerance like an allergy', () => {
    const { safety } = profileFor(allergic('MILK', 'intolerance'));
    expect(reasons(food('d_kefir'), safety)).toContain('allergen');
  });
});

describe('diets', () => {
  const eggDish = food('d_fried_eggs');
  const meat = food('d_kotlety');
  const fish = food('d_baked_salmon');
  const porridge = food('d_buckwheat_porridge');
  const vegan = foods.foods.find((f) => f.item.flags.has('vegan'));

  it('does not restrict an omnivore', () => {
    expect(checkFood(meat, withSafety({ diet: 'omnivore' })).ok).toBe(true);
  });

  it('lets a pescatarian eat fish and no meat', () => {
    const safety = withSafety({ diet: 'pescatarian' });
    expect(checkFood(fish, safety).ok).toBe(true);
    expect(reasons(meat, safety)).toContain('diet');
  });

  it('lets a lacto-ovo vegetarian eat eggs and dairy, no fish', () => {
    const safety = withSafety({ diet: 'vegetarianLactoOvo' });
    expect(checkFood(eggDish, safety).ok).toBe(true);
    expect(reasons(fish, safety)).toContain('diet');
  });

  it('excludes eggs for a lacto vegetarian and dairy for an ovo vegetarian', () => {
    expect(reasons(eggDish, withSafety({ diet: 'vegetarianLacto' }))).toContain('diet');
    expect(checkFood(food('d_kefir'), withSafety({ diet: 'vegetarianLacto' })).ok).toBe(true);
    expect(reasons(food('d_kefir'), withSafety({ diet: 'vegetarianOvo' }))).toContain('diet');
    expect(checkFood(eggDish, withSafety({ diet: 'vegetarianOvo' })).ok).toBe(true);
  });

  it('allows only vegan items for vegan and lentLay', () => {
    if (!vegan) throw new Error('no vegan item');
    for (const diet of ['vegan', 'lentLay'] as const) {
      expect(checkFood(vegan, withSafety({ diet })).ok).toBe(true);
      expect(reasons(porridge, withSafety({ diet })).length === 0).toBe(
        porridge.item.flags.has('vegan'),
      );
      expect(reasons(eggDish, withSafety({ diet }))).toContain('diet');
    }
  });

  it('keeps pork, gelatin and alcohol away from halal', () => {
    const safety = withSafety({ diet: 'halal' });
    const pork = foods.foods.find((f) => f.categories.has('pork'));
    const alcohol = flagged('alcohol')[0];
    if (!pork || !alcohol) throw new Error('fixtures');
    expect(reasons(pork, safety)).toContain('diet');
    expect(reasons(alcohol, safety)).toContain('diet');
    expect(checkFood(fish, safety).ok).toBe(true);
    const gelatin = foods.foods.find((f) => f.features.extras?.includes('gelatin'));
    if (gelatin) expect(reasons(gelatin, safety)).toContain('diet');
  });

  it('keeps pork, seafood and meat with dairy away from kosher', () => {
    const safety = withSafety({ diet: 'kosher' });
    const pork = foods.foods.find((f) => f.categories.has('pork'));
    const seafood = foods.foods.find((f) => f.categories.has('seafood'));
    const meatWithDairy = foods.foods.find(
      (f) => f.categories.has('meat') && f.categories.has('dairy'),
    );
    if (!pork || !seafood || !meatWithDairy) throw new Error('fixtures');
    for (const f of [pork, seafood, meatWithDairy]) expect(reasons(f, safety)).toContain('diet');
    expect(checkFood(porridge, safety).ok).toBe(true);
  });
});

describe('pregnancy, lactation and age', () => {
  it('excludes raw, cured, mould and liver items and alcohol in pregnancy', () => {
    const safety = withSafety({ pregnant: true });
    for (const flag of [
      'rawFish',
      'rawEgg',
      'curedFish',
      'curedMeat',
      'mouldCheese',
      'liver',
    ] as const) {
      const items = flagged(flag);
      expect(items.length).toBeGreaterThan(0);
      for (const f of items) expect(reasons(f, safety)).toContain('pregnancy');
    }
    for (const f of flagged('alcohol')) expect(reasons(f, safety)).toContain('pregnancy');
    expect(checkFood(food('d_buckwheat_porridge'), safety).ok).toBe(true);
  });

  it('does not apply the pregnancy rules to others', () => {
    for (const f of flagged('rawFish')) expect(reasons(f, base.safety)).not.toContain('pregnancy');
  });

  it('excludes alcohol while lactating and under 18', () => {
    const alcohol = flagged('alcohol')[0];
    if (!alcohol) throw new Error('no alcohol item');
    expect(reasons(alcohol, withSafety({ lactating: true }))).toContain('alcohol');
    expect(reasons(alcohol, withSafety({ ageYears: 16 }))).toContain('alcohol');
    expect(reasons(alcohol, base.safety)).not.toContain('alcohol');
  });

  it('gives children under the age limit no caffeinated drinks', () => {
    const coffee = foods.foods.find((f) => f.role === 'drink' && f.caffeineMg >= 1);
    if (!coffee) throw new Error('no caffeinated drink');
    expect(reasons(coffee, withSafety({ ageYears: 12 }))).toContain('minorCaffeine');
    expect(reasons(coffee, withSafety({ ageYears: 32 }))).not.toContain('minorCaffeine');
    const decaf = foods.foods.find((f) => f.role === 'drink' && f.caffeineMg < 1);
    if (decaf) expect(reasons(decaf, withSafety({ ageYears: 12 }))).not.toContain('minorCaffeine');
  });
});

describe('mercury', () => {
  it('excludes a high-mercury fish for everyone', () => {
    const fish = food('d_baked_salmon');
    const shark: MenuFood = { ...fish, item: { ...fish.item, fishMercury: 'avoid' } };
    expect(reasons(shark, base.safety)).toContain('highMercury');
    expect(reasons(shark, withSafety({ pregnant: true }))).toContain('highMercury');
  });
});

describe('guardrail dish rules', () => {
  it('excludes tyramine-rich food on an MAOI inhibitor', () => {
    const { safety } = profileFor({
      health: { flags: ['maoi'], pregnancy: 'none', lactation: 'none', custom: [] },
    });
    expect(safety.dishRules.has('excludeHighTyramine')).toBe(true);
    const tyramine = foods.foods.filter((f) => f.categories.has('highTyramine'));
    expect(tyramine.length).toBeGreaterThan(0);
    for (const f of tyramine) expect(reasons(f, safety)).toContain('tyramine');
    for (const f of [...flagged('curedMeat'), ...flagged('mouldCheese')])
      expect(reasons(f, safety)).toContain('tyramine');
    expect(reasons(tyramine[0] as MenuFood, base.safety)).not.toContain('tyramine');
  });

  it('keeps vitamin-K-rich items at a fixed portion on warfarin', () => {
    const { safety } = profileFor({
      health: { flags: ['warfarin'], pregnancy: 'none', lactation: 'none', custom: [] },
    });
    expect(safety.dishRules.has('stableVitaminK')).toBe(true);
    const rich = foods.foods.find((f) => (f.item.perPortion.vitaminKUg ?? 0) >= 100);
    if (!rich) throw new Error('no vitamin K rich item');
    const verdict = checkFood(rich, safety);
    expect(verdict.ok && verdict.fixedPortion).toBe(true);
    const plain = foods.foods.find((f) => (f.item.perPortion.vitaminKUg ?? 0) < 5);
    if (!plain) throw new Error('no plain item');
    const plainVerdict = checkFood(plain, safety);
    expect(plainVerdict.ok && plainVerdict.fixedPortion).toBe(false);
    const free = checkFood(rich, base.safety);
    expect(free.ok && free.fixedPortion).toBe(false);
  });
});

describe('exclusions of the person', () => {
  it('drops mushroom dishes for «не люблю грибы»', () => {
    const { safety } = profileFor({ dislikesText: 'не люблю грибы' });
    expect(safety.excluded.categories.has('mushrooms')).toBe(true);
    const mushrooms = foods.foods.filter((f) => f.categories.has('mushrooms'));
    expect(mushrooms.length).toBeGreaterThan(0);
    for (const f of mushrooms) expect(reasons(f, safety)).toContain('excludedByPerson');
    expect(checkFood(food('d_buckwheat_porridge'), safety).ok).toBe(true);
  });

  it('excludes by ingredient id and item id', () => {
    const f = food('d_buckwheat_porridge');
    const ingredient = f.item.ingredients[0];
    if (!ingredient) throw new Error('no ingredient');
    const excluded = (patch: Partial<SafetyContext['excluded']>): SafetyContext =>
      withSafety({ excluded: { ...base.safety.excluded, ...patch } });
    expect(reasons(f, excluded({ ingredientIds: new Set([ingredient.id]) }))).toContain(
      'excludedByPerson',
    );
    expect(reasons(f, excluded({ itemIds: new Set([f.id]) }))).toContain('excludedByPerson');
  });
});

describe('water', () => {
  it('is tracked separately, never planned', () => {
    expect(reasons(food('d_water'), base.safety)).toContain('trackedSeparately');
  });
});
