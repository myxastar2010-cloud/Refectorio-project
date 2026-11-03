import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_IDS,
  createTermResolver,
  ingredientCategories,
  resolveTerms,
  UNCATEGORISED_INGREDIENTS,
  unmatchedWords,
  withAncestors,
} from './taxonomy';
import { testFoods } from './testing';
import { normalize } from './text';

const cats = (nameRu: string, group: number) => ingredientCategories({ nameRu, group });

describe('ingredientCategories', () => {
  it('sorts fish by group 15', () => {
    const salmon = cats('Лосось атлантический, сырой', 15);
    expect(salmon).toContain('fish');
    expect(salmon).toContain('oilyFish');
    expect(cats('Треска', 15)).toEqual(['fish']);
    expect(cats('Креветки', 15)).toEqual(['shrimp']);
    expect(cats('Тунец, стейк', 15)).toEqual(expect.arrayContaining(['fish', 'tuna', 'oilyFish']));
    expect(cats('Мидии', 15)).toEqual(['seafood']);
  });

  it('keeps an egg (group 1) out of chicken', () => {
    const egg = cats('Яйцо куриное', 1);
    expect(egg).toContain('eggs');
    expect(egg).not.toContain('chicken');
  });

  it('puts chicken fillet (group 5) into chicken, turkey and duck apart', () => {
    expect(cats('Куриное филе', 5)).toContain('chicken');
    expect(cats('Индейка', 5)).toContain('turkey');
    expect(cats('Утка', 5)).toContain('duck');
  });

  it('marks sausages (group 7) as processed meat', () => {
    expect(cats('Колбаса копчёная', 7)).toContain('processedMeat');
  });

  it('handles red meat groups', () => {
    expect(cats('Свинина', 10)).toContain('pork');
    expect(cats('Бекон', 10)).toContain('processedMeat');
    expect(cats('Говядина', 13)).toContain('beef');
    expect(cats('Печень говяжья', 13)).toEqual(expect.arrayContaining(['beef', 'liver']));
    expect(cats('Баранина', 17)).toContain('lamb');
  });

  it('keeps potatoes out of vegetables', () => {
    const potato = cats('Картофель', 11);
    expect(potato).toContain('potatoes');
    expect(potato).not.toContain('vegetables');
  });

  it('tells juice from fruit', () => {
    const juice = cats('Сок яблочный', 9);
    expect(juice).toContain('juice');
    expect(juice).not.toContain('fruit');
    expect(cats('Яблоко', 9)).toEqual(expect.arrayContaining(['fruit', 'apples']));
  });

  it('treats soy sauce as soy, sauce and high tyramine, not legumes', () => {
    const sauce = cats('Соевый соус', 16);
    expect(sauce).toEqual(expect.arrayContaining(['soy', 'sauces', 'highTyramine']));
    expect(sauce).not.toContain('legumes');
    expect(cats('Нут', 16)).toContain('legumes');
    expect(cats('Арахис', 16)).toContain('peanuts');
  });

  it('knows buckwheat as a whole grain', () => {
    expect(cats('Гречневая крупа', 20)).toEqual(
      expect.arrayContaining(['buckwheat', 'wholeGrain']),
    );
    expect(cats('Пшено', 20)).toEqual(expect.arrayContaining(['millet', 'wholeGrain']));
    expect(cats('Рис белый', 20)).toContain('rice');
  });

  it('classifies vegetables, nuts, drinks, dairy, fats and sweets', () => {
    expect(cats('Шампиньоны', 11)).toContain('mushrooms');
    expect(cats('Квашеная капуста', 11)).toContain('highTyramine');
    expect(cats('Миндаль', 12)).toContain('nuts');
    expect(cats('Семена кунжута', 12)).toContain('seeds');
    expect(cats('Кофе', 14)).toContain('coffee');
    expect(cats('Красное вино', 14)).toContain('alcohol');
    expect(cats('Кефир', 1)).toContain('fermentedDairy');
    expect(cats('Сыр пармезан', 1)).toEqual(expect.arrayContaining(['cheese', 'agedCheese']));
    expect(cats('Творог', 1)).toContain('tvorog');
    expect(cats('Оливковое масло', 4)).toContain('oils');
    expect(cats('Мёд', 19)).toContain('honey');
    expect(cats('Сахар', 19)).toContain('sugar');
    expect(cats('Белый хлеб', 18)).toContain('bread');
  });

  it('classifies broth by its meat', () => {
    expect(cats('Куриный бульон', 6)).toEqual(expect.arrayContaining(['meatBroth', 'chicken']));
    expect(cats('Томатный соус', 6)).toEqual(expect.arrayContaining(['sauces', 'tomatoes']));
  });

  it('returns nothing for an unknown group', () => {
    expect(cats('Вода', 14)).toEqual([]);
    expect(cats('Что-то', 99)).toEqual([]);
  });

  it('categorises every ingredient of the food data or lists it as uncategorised', () => {
    const seen = new Map<string, { nameRu: string; group: number }>();
    for (const food of testFoods().foods)
      for (const i of food.item.ingredients) seen.set(i.id, { nameRu: i.nameRu, group: i.group });
    expect(seen.size).toBeGreaterThan(100);
    const bad = [...seen.values()]
      .filter(
        (i) =>
          ingredientCategories(i).length === 0 &&
          !UNCATEGORISED_INGREDIENTS.test(normalize(i.nameRu)),
      )
      .map((i) => i.nameRu);
    expect(bad).toEqual([]);
  });
});

describe('withAncestors', () => {
  it('includes the category and all its parents', () => {
    expect(withAncestors('chicken')).toEqual(
      expect.arrayContaining(['chicken', 'poultry', 'meat']),
    );
    expect(withAncestors('beef')).toEqual(expect.arrayContaining(['beef', 'redMeat', 'meat']));
    expect(withAncestors('meat')).toEqual(['meat']);
  });

  it('terminates for every category and starts with itself', () => {
    for (const id of CATEGORY_IDS) expect(withAncestors(id)[0]).toBe(id);
  });
});

describe('resolveTerms', () => {
  it('finds dairy and millet in «не ем молочку и пшёнку»', () => {
    const matches = resolveTerms('не ем молочку и пшёнку');
    expect(matches.map((m) => m.id)).toEqual(['dairy', 'millet']);
    expect(matches.every((m) => m.kind === 'category')).toBe(true);
    const text = 'не ем молочку и пшёнку';
    expect(text.slice(matches[0]?.start, matches[0]?.end)).toBe('молочку');
    expect(text.slice(matches[1]?.start, matches[1]?.end)).toBe('пшёнку');
  });

  it('prefers red meat over meat for «красное мясо»', () => {
    const ids = resolveTerms('красное мясо').map((m) => m.id);
    expect(ids).toEqual(['redMeat']);
  });

  it('forgives one typo with confidence 0.6', () => {
    const [match, ...rest] = resolveTerms('грибф');
    expect(rest).toEqual([]);
    expect(match).toMatchObject({ kind: 'category', id: 'mushrooms', confidence: 0.6 });
  });

  it('gives full confidence to an exact word and 0.8 to another form', () => {
    expect(resolveTerms('грибы')[0]?.confidence).toBeGreaterThanOrEqual(0.8);
    expect(resolveTerms('мясо')[0]?.confidence).toBe(1);
  });

  it('returns nothing for text without food words', () => {
    expect(resolveTerms('очень люблю бегать')).toEqual([]);
    expect(resolveTerms('')).toEqual([]);
  });

  it('uses a word once', () => {
    const matches = resolveTerms('мясо мясо');
    expect(matches).toHaveLength(2);
  });
});

describe('createTermResolver', () => {
  const resolver = createTermResolver({
    ingredients: [{ id: 'i_kiwi', nameRu: 'Киви' }],
    items: [
      { id: 'd_kiwi', nameRu: 'Киви' },
      { id: 'd_x', nameRu: 'Салат 200 г' },
    ],
  });

  it('finds ingredients and items by name', () => {
    const matches = resolver('аллергия на киви');
    // A word is used by one match only; ingredients rank before items.
    expect(matches.map((m) => [m.kind, m.id])).toEqual([['ingredient', 'i_kiwi']]);
  });

  it('finds an item when no ingredient has the name', () => {
    const itemsOnly = createTermResolver({
      ingredients: [],
      items: [{ id: 'd_kiwi', nameRu: 'Киви' }],
    });
    expect(itemsOnly('киви').map((m) => [m.kind, m.id])).toEqual([['item', 'd_kiwi']]);
  });

  it('matches an item whose name has numbers by its words', () => {
    expect(resolver('салат').some((m) => m.id === 'd_x' || m.kind === 'category')).toBe(true);
  });

  it('still resolves categories', () => {
    expect(resolver('не ем молочку').map((m) => m.id)).toContain('dairy');
  });
});

describe('unmatchedWords', () => {
  it('lists words nothing covers, ignoring stop words', () => {
    const text = 'не ем молочку и дуриан';
    expect(unmatchedWords(text, resolveTerms(text))).toEqual(['дуриан']);
  });

  it('is empty when everything is matched', () => {
    const text = 'не люблю грибы';
    expect(unmatchedWords(text, resolveTerms(text))).toEqual([]);
  });

  it('ignores one-letter words and non-Cyrillic tokens', () => {
    expect(unmatchedWords('x 5 а', [])).toEqual([]);
  });
});

describe('CATEGORIES', () => {
  it('has a label for every id', () => {
    for (const id of CATEGORY_IDS) expect(CATEGORIES[id].labelRu.length).toBeGreaterThan(0);
  });
});
