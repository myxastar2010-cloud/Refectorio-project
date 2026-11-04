import { describe, expect, it } from 'vitest';
import { buildMenuProfile, type MenuProfile } from './profile';
import { createTermResolver } from './taxonomy';
import { quizAnswers, testFoods, type AnswersOverrides } from './testing';

const foods = testFoods();

function profileOf(overrides: AnswersOverrides): MenuProfile {
  const result = buildMenuProfile(quizAnswers(overrides), { foods });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const custom = (...texts: string[]): AnswersOverrides => ({
  allergies: { items: [], custom: texts },
});

const ingredientIdsWith = (word: string) =>
  [...new Set(foods.foods.flatMap((f) => f.item.ingredients))]
    .filter((i) => i.nameRu.toLowerCase().startsWith(word))
    .map((i) => i.id);

describe('buildMenuProfile — words people type (review of phase 3, C1 and M7)', () => {
  it('«корица» excludes cinnamon, not chicken', () => {
    const p = profileOf(custom('корица'));
    const cinnamon = ingredientIdsWith('корица');
    expect(cinnamon.length).toBeGreaterThan(0);
    for (const id of cinnamon) expect(p.safety.excluded.ingredientIds.has(id)).toBe(true);
    expect(p.safety.excluded.categories.has('chicken')).toBe(false);
    expect(p.unmatchedAllergies).toEqual([]);
  });

  it('a typo never excludes another food: it stays unmatched for Kiki to ask', () => {
    const resolver = createTermResolver({
      ingredients: [
        ...new Map(
          foods.foods.flatMap((f) => f.item.ingredients.map((i) => [i.id, i] as const)),
        ).values(),
      ],
      items: foods.foods.map((f) => ({ id: f.id, nameRu: f.nameRu })),
    });
    for (const word of [
      'варёная',
      'грецкие',
      'светлое',
      'слоёное',
      'молотый',
      'сгущённое',
      'курецу',
    ]) {
      const p = profileOf({ dislikesText: word });
      const excluded = p.safety.excluded;
      for (const m of resolver(word).filter((x) => x.confidence < 0.8)) {
        expect(excluded.categories.has(m.id as never)).toBe(false);
        expect(excluded.ingredientIds.has(m.id)).toBe(false);
        expect(excluded.itemIds.has(m.id)).toBe(false);
      }
    }
    expect(profileOf({ dislikesText: 'курецу' }).unmatchedDislikes).toEqual(['курецу']);
  });

  it('allergens typed in words become allergens of the person', () => {
    expect(profileOf(custom('лактоза')).safety.allergens.get('MILK')).toBe('allergy');
    expect(profileOf(custom('непереносимость глютена')).safety.allergens.get('GLUTEN')).toBe(
      'allergy',
    );
    expect(profileOf(custom('фундук')).safety.allergens.get('TREE_NUT')).toBe('allergy');
    expect(profileOf(custom('устрицы')).safety.allergens.get('MOLLUSC')).toBe('allergy');
    const nuts = profileOf(custom('орехи')).safety.allergens;
    expect(nuts.get('TREE_NUT')).toBe('allergy');
    expect(nuts.get('PEANUT')).toBe('allergy');
  });

  it('keeps a stricter level from the checkboxes and maps only substances from the dislikes', () => {
    const p = profileOf({
      allergies: { items: [{ code: 'MILK', level: 'severeAllergy' }], custom: ['лактоза'] },
    });
    expect(p.safety.allergens.get('MILK')).toBe('severeAllergy');
    expect(profileOf({ dislikesText: 'не ем глютен' }).safety.allergens.get('GLUTEN')).toBe(
      'intolerance',
    );
    expect(profileOf({ dislikesText: 'не люблю сыр' }).safety.allergens.has('MILK')).toBe(false);
  });

  it('reports allergy text it cannot map apart from the dislikes', () => {
    const p = profileOf({ ...custom('арахиз'), dislikesText: 'оливки' });
    expect(p.unmatchedAllergies).toEqual(['арахиз']);
    expect(p.safety.allergens.has('PEANUT')).toBe(false);
  });
});
