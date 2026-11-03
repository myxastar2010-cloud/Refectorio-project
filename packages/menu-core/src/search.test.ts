import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { buildMenuProfile } from './profile';
import { buildSearchIndex, search, SEARCH_FIELDS, type SearchHit } from './search';
import { quizAnswers, testFoods } from './testing';
import type { DayPlan, Plan, PlannedItem } from './types';

const foods = testFoods();

function basePlan(): Plan {
  const profile = buildMenuProfile(quizAnswers(), { foods });
  if (!profile.ok) throw new Error(JSON.stringify(profile.error));
  const result = generate({
    profile: profile.value,
    foods,
    today: '2026-11-04',
    seed: 1,
    iterationsPerDay: 5,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value.plan;
}

const base = basePlan();
const firstItem = Object.values(base.days[0]?.meals ?? {})[0]?.[0];
if (!firstItem) throw new Error('empty plan');
const template: PlannedItem = firstItem;

/** A plan whose lunch (on 2026-11-04) and dinner (2026-11-05) hold exactly these items. */
function planWith(lunch: readonly string[], dinner: readonly string[] = []): Plan {
  const item = (itemId: string): PlannedItem => ({ ...template, itemId });
  const day = (date: string, ids: readonly string[], meal: string): DayPlan => ({
    date,
    meals: { [meal]: ids.map(item) },
    totals: base.days[0]?.totals ?? ({} as never),
    flags: [],
  });
  return {
    ...base,
    days: [day('2026-11-04', lunch, 'lunch'), day('2026-11-05', dinner, 'dinner')],
  };
}

const NAMES = {
  eggs: ['d_fried_eggs', 'd_omelette'],
  chickenSoup: 'd_chicken_noodle_soup',
  millet: 'd_millet_pumpkin_porridge',
  kefir: 'd_kefir',
};

const buckwheatIds = foods.foods.filter((f) => /гречк|гречнев/i.test(f.nameRu)).map((f) => f.id);
const walnuts = foods.foods.find((f) => /грецк/i.test(f.nameRu));

const fullPlan = planWith(
  [
    ...NAMES.eggs,
    NAMES.chickenSoup,
    NAMES.millet,
    NAMES.kefir,
    ...buckwheatIds,
    ...(walnuts ? [walnuts.id] : []),
  ],
  ['d_kiwi'],
);
const index = buildSearchIndex(fullPlan, foods);
const ids = (hits: readonly SearchHit[]) => hits.map((h) => h.itemId);

describe('buildSearchIndex', () => {
  it('has one document per distinct item of the plan, sorted by id', () => {
    const docIds = index.docs.map((d) => d.itemId);
    expect(docIds).toEqual([...new Set(docIds)].sort());
    expect(docIds).toContain('d_kiwi');
  });

  it('skips items unknown to the food index', () => {
    const idx = buildSearchIndex(planWith(['d_no_such_dish', 'd_kefir']), foods);
    expect(idx.docs.map((d) => d.itemId)).toEqual(['d_kefir']);
  });

  it('records where an item occurs', () => {
    const doc = index.docs.find((d) => d.itemId === 'd_kiwi');
    expect(doc?.occurrences).toEqual([{ date: '2026-11-05', mealId: 'dinner' }]);
  });

  it('lists the searchable fields', () => {
    expect(SEARCH_FIELDS).toContain('name');
  });
});

describe('search', () => {
  it('finds an egg dish for «яйца»', () => {
    const found = ids(search(index, 'яйца'));
    expect(found.some((id) => NAMES.eggs.includes(id))).toBe(true);
  });

  it('finds chicken soup for «курица»', () => {
    expect(ids(search(index, 'курица'))).toContain(NAMES.chickenSoup);
  });

  it('finds dairy for «молочка»', () => {
    expect(ids(search(index, 'молочка'))).toContain(NAMES.kefir);
  });

  it('finds millet porridge for «пшенка»', () => {
    expect(ids(search(index, 'пшенка'))).toContain(NAMES.millet);
  });

  it('finds buckwheat dishes for «гречка» and not walnuts', () => {
    const found = ids(search(index, 'гречка'));
    expect(buckwheatIds.length).toBeGreaterThan(0);
    for (const id of buckwheatIds) expect(found).toContain(id);
    if (walnuts) expect(found).not.toContain(walnuts.id);
  });

  it('forgives a typo when nothing matches exactly', () => {
    const found = ids(search(index, 'гречак'));
    for (const id of buckwheatIds) expect(found).toContain(id);
  });

  it('points spans at the matched word of the name', () => {
    const hit = search(index, 'курица').find((h) => h.itemId === NAMES.chickenSoup);
    const name = foods.byId.get(NAMES.chickenSoup)?.nameRu ?? '';
    const span = hit?.spans.find((s) => s.field === 'name');
    expect(span).toBeDefined();
    expect(name.slice(span?.start, span?.end)).toBe('Куриный');
  });

  it('requires every word of the query', () => {
    const both = ids(search(index, 'куриный суп'));
    expect(both).toContain(NAMES.chickenSoup);
    expect(ids(search(index, 'куриный киви'))).toEqual([]);
  });

  it('ignores stop words', () => {
    expect(ids(search(index, 'суп с курицей'))).toContain(NAMES.chickenSoup);
    expect(search(index, 'и на')).toEqual([]);
  });

  it('returns nothing for an empty query or an unknown word', () => {
    expect(search(index, '')).toEqual([]);
    expect(search(index, 'абракадабра')).toEqual([]);
  });

  it('ranks the better match first and is sorted by score', () => {
    const hits = search(index, 'курица');
    for (let i = 1; i < hits.length; i += 1)
      expect(hits[i - 1]?.score ?? 0).toBeGreaterThanOrEqual(hits[i]?.score ?? 0);
  });

  it('searches meals and days', () => {
    expect(ids(search(index, 'ужин'))).toContain('d_kiwi');
    expect(ids(search(index, 'четверг'))).toEqual(['d_kiwi']);
  });

  it('searches tags and cuisine', () => {
    expect(ids(search(index, 'вегетарианское'))).toContain('d_buckwheat_porridge');
    expect(search(index, 'итальянская кухня').every((h) => h.score > 0)).toBe(true);
  });

  it('finds items by ingredient', () => {
    const withText = buildSearchIndex(fullPlan, foods);
    expect(ids(search(withText, 'яйцо')).length).toBeGreaterThan(0);
  });

  it('uses descriptions when food text is given', () => {
    const texts = {
      version: '1',
      items: { d_kiwi: ['Киви', '', 'сочный зелёный фрукт'] },
    } as unknown as Parameters<typeof buildSearchIndex>[2];
    const withText = buildSearchIndex(fullPlan, foods, texts);
    expect(ids(search(withText, 'сочный'))).toEqual(['d_kiwi']);
    expect(search(index, 'сочный')).toEqual([]);
  });
});
