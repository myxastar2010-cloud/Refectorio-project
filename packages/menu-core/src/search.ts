/**
 * Search over the plan's items (ТЗ фаза 3 §7): names, descriptions, ingredients, tags (вегетарианское, острое, без
 * глютена, высокобелковое, быстро, ланч-бокс), cuisine, meal and day labels. Russian normalisation and stems, category
 * synonyms («молочка» → dairy, «пшёнка» → millet), one typo in words of five letters or more; ranked hits with the
 * matched spans for highlighting. Every word of the query must match (stop words aside).
 */
import type { FoodTextFile } from '@refectorio/food-data';
import { weekdayIndex, type IsoDate } from './dates';
import type { FoodIndex, MenuFood } from './foods';
import { CATEGORIES, resolveTerms, withAncestors, type CategoryId } from './taxonomy';
import { stem, tokenize, withinOneEdit, type Token } from './text';
import type { Plan } from './types';

export const SEARCH_FIELDS = [
  'name',
  'tags',
  'ingredients',
  'cuisine',
  'meal',
  'day',
  'description',
] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

const FIELD_WEIGHT: Readonly<Record<SearchField, number>> = {
  name: 3,
  tags: 2,
  ingredients: 1.5,
  cuisine: 1.5,
  meal: 1.5,
  day: 1.5,
  description: 0.8,
};
const CATEGORY_WEIGHT = 2.5;
const PREFIX_FACTOR = 0.7;
const TYPO_FACTOR = 0.5;
const MIN_PREFIX = 3;
const MIN_TYPO = 5;

const TAG_CATEGORIES: readonly CategoryId[] = [
  'vegetarian',
  'vegan',
  'spicy',
  'glutenFree',
  'highProtein',
  'quick',
  'lunchBox',
  'soup',
  'salad',
  'dessert',
  'porridge',
  'baking',
  'drink',
  'side',
  'fried',
];

const CUISINES_RU: Readonly<Record<string, string>> = {
  russian: 'русская кухня',
  eastEuropean: 'восточноевропейская кухня',
  european: 'европейская кухня',
  italian: 'итальянская кухня',
  french: 'французская кухня',
  mediterranean: 'средиземноморская кухня',
  caucasian: 'кавказская грузинская кухня',
  centralAsian: 'среднеазиатская узбекская кухня',
  middleEastern: 'ближневосточная кухня',
  japanese: 'японская кухня',
  chinese: 'китайская кухня',
  korean: 'корейская кухня',
  southeastAsian: 'азиатская тайская вьетнамская кухня',
  indian: 'индийская кухня',
  american: 'американская кухня',
  mexican: 'мексиканская кухня',
};

const WEEKDAYS_RU = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
];
const STOP = new Set(
  [
    'и',
    'или',
    'с',
    'со',
    'в',
    'на',
    'для',
    'по',
    'из',
    'к',
    'что',
    'где',
    'есть',
    'блюдо',
    'блюда',
  ].map(stem),
);

type Field = { readonly text: string; readonly tokens: readonly Token[] };
type Doc = {
  readonly itemId: string;
  readonly categories: ReadonlySet<CategoryId>;
  readonly fields: Readonly<Record<SearchField, Field>>;
  readonly occurrences: readonly { readonly date: IsoDate; readonly mealId: string }[];
};

export type SearchIndex = { readonly docs: readonly Doc[] };

export type SearchSpan = {
  readonly field: SearchField;
  readonly start: number;
  readonly end: number;
};
export type SearchHit = {
  readonly itemId: string;
  readonly score: number;
  readonly occurrences: Doc['occurrences'];
  readonly spans: readonly SearchSpan[];
};

const field = (text: string): Field => ({ text, tokens: tokenize(text) });

function docFor(
  food: MenuFood,
  occurrences: Doc['occurrences'],
  mealTitles: readonly string[],
  texts?: FoodTextFile,
): Doc {
  const tags = TAG_CATEGORIES.filter((c) => food.categories.has(c)).map(
    (c) => CATEGORIES[c].labelRu,
  );
  const days = [...new Set(occurrences.map((o) => WEEKDAYS_RU[weekdayIndex(o.date)] ?? ''))];
  return {
    itemId: food.id,
    categories: food.categories,
    occurrences,
    fields: {
      name: field(food.nameRu),
      tags: field(tags.join(', ')),
      ingredients: field([...new Set(food.item.ingredients.map((i) => i.nameRu))].join(', ')),
      cuisine: field(food.cuisine ? (CUISINES_RU[food.cuisine] ?? '') : ''),
      meal: field([...new Set(mealTitles)].join(', ')),
      day: field(days.join(', ')),
      description: field(texts?.items[food.id]?.[2] ?? ''),
    },
  };
}

/** The index of a plan's items; `texts` adds descriptions (food-text). */
export function buildSearchIndex(plan: Plan, foods: FoodIndex, texts?: FoodTextFile): SearchIndex {
  const occurrences = new Map<string, { date: IsoDate; mealId: string }[]>();
  const titles = new Map<string, string[]>();
  const mealTitle = new Map(plan.structure.map((m) => [m.id, m.titleRu]));
  for (const day of plan.days) {
    for (const [mealId, items] of Object.entries(day.meals)) {
      for (const item of items) {
        const list = occurrences.get(item.itemId) ?? [];
        list.push({ date: day.date, mealId });
        occurrences.set(item.itemId, list);
        const t = titles.get(item.itemId) ?? [];
        t.push(mealTitle.get(mealId) ?? mealId);
        titles.set(item.itemId, t);
      }
    }
  }
  const docs: Doc[] = [];
  for (const [itemId, list] of occurrences) {
    const food = foods.byId.get(itemId);
    if (food) docs.push(docFor(food, list, titles.get(itemId) ?? [], texts));
  }
  return { docs: docs.sort((a, b) => (a.itemId < b.itemId ? -1 : 1)) };
}

type Match = { readonly score: number; readonly spans: SearchSpan[] };

/** The best match of one query stem in a document (exact stem, prefix, or one typo), field-weighted. */
function matchWord(doc: Doc, queryStem: string, typos = true): Match | null {
  let best: Match | null = null;
  for (const name of SEARCH_FIELDS) {
    const f = doc.fields[name];
    const spans: SearchSpan[] = [];
    let quality = 0;
    for (const t of f.tokens) {
      let q = 0;
      if (t.stem === queryStem) q = 1;
      else if (queryStem.length >= MIN_PREFIX && t.stem.startsWith(queryStem)) q = PREFIX_FACTOR;
      else if (
        typos &&
        queryStem.length >= MIN_TYPO &&
        t.stem.length >= MIN_TYPO &&
        withinOneEdit(t.stem, queryStem)
      )
        q = TYPO_FACTOR;
      if (q > 0) {
        spans.push({ field: name, start: t.start, end: t.end });
        quality = Math.max(quality, q);
      }
    }
    const score = quality * FIELD_WEIGHT[name];
    if (score > 0 && (!best || score > best.score)) best = { score, spans };
  }
  return best;
}

/** Spans of a category's synonyms in the document («Куриный» for «курица»). */
function categorySpans(doc: Doc, id: CategoryId): SearchSpan[] {
  const stems = new Set(
    [CATEGORIES[id].labelRu, ...CATEGORIES[id].synonyms].flatMap((s) =>
      tokenize(s).map((t) => t.stem),
    ),
  );
  const out: SearchSpan[] = [];
  for (const name of ['name', 'ingredients', 'tags'] as const) {
    for (const t of doc.fields[name].tokens)
      if (stems.has(t.stem)) out.push({ field: name, start: t.start, end: t.end });
  }
  return out;
}

export function search(index: SearchIndex, query: string): SearchHit[] {
  const categoryMatches = resolveTerms(query).filter((m) => m.kind === 'category');
  const tokens = tokenize(query).filter((t) => !STOP.has(t.stem));
  // Words a category phrase took («без глютена», «молочка») are matched through the category.
  const free = tokens.filter(
    (t) => !categoryMatches.some((m) => t.start >= m.start && t.end <= m.end),
  );
  if (free.length === 0 && categoryMatches.length === 0) return [];
  // A typo is forgiven only for a word nothing matches exactly («гречак» → «гречка», but «гречка» ≠ «грецкие»).
  const typoAllowed = new Set(
    free
      .filter((t) => !index.docs.some((d) => matchWord(d, t.stem, false) !== null))
      .map((t) => t.stem),
  );
  const hits: SearchHit[] = [];
  for (const doc of index.docs) {
    let score = 0;
    const spans: SearchSpan[] = [];
    let ok = true;
    for (const m of categoryMatches) {
      const id = m.id as CategoryId;
      // A word may also match directly (the name «Гречка» for the category buckwheat).
      const direct = tokenize(query.slice(m.start, m.end))
        .map((t) => matchWord(doc, t.stem, false))
        .filter((x): x is Match => x !== null);
      const inCategory = withAncestors(id).length > 0 && doc.categories.has(id);
      if (!inCategory && direct.length === 0) {
        ok = false;
        break;
      }
      score +=
        (inCategory ? CATEGORY_WEIGHT * m.confidence : 0) + direct.reduce((s, x) => s + x.score, 0);
      spans.push(...(inCategory ? categorySpans(doc, id) : []), ...direct.flatMap((x) => x.spans));
    }
    if (!ok) continue;
    for (const t of free) {
      const m = matchWord(doc, t.stem, typoAllowed.has(t.stem));
      if (!m) {
        ok = false;
        break;
      }
      score += m.score;
      spans.push(...m.spans);
    }
    if (!ok || score <= 0) continue;
    const unique = [...new Map(spans.map((s) => [`${s.field}:${s.start}`, s])).values()];
    hits.push({ itemId: doc.itemId, score, occurrences: doc.occurrences, spans: unique });
  }
  return hits.sort((a, b) => b.score - a.score || (a.itemId < b.itemId ? -1 : 1));
}
