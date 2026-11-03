/**
 * Allergens and diet facts derived from the ingredients (ADR 0015): the menu items without a taste-catalog entry take
 * their allergens from here, and the catalog's declared allergens and diet flags are checked against it (a «vegan»
 * dish with butter, a gluten-free one with flour, a missing EGG or MILK). The 14 EU / TR CU 022/2011 groups as in
 * nutrition-core (research/R07); pine nuts count as tree nuts (the cautious side), coconut does not.
 */
import type { AllergenCode } from '@refectorio/nutrition-core';
import type { IngredientRecord } from './compute';

const RULES: readonly (readonly [AllergenCode, RegExp])[] = [
  [
    'GLUTEN',
    /wheat|semolina|bulgur|couscous|barley|\brye\b|spelt|^bread|rolls?, |^pasta|spaghetti|macaroni|noodles, egg|lasagna|crackers|cookies|pastry|dough|pie crust|soy sauce made from soy and wheat|teriyaki|beer|malt|oats|seitan|bran\b|croutons|flour(?!, (rice|corn|potato|soy|chickpea|buckwheat|almond|coconut))/,
  ],
  [
    'MILK',
    /^milk|cheese|^butter|buttermilk|^cream|sour cream|yogurt|kefir|tvorog|whey|ice cream|ghee|ryazhenka|mascarpone|condensed|custard|milk chocolate/,
  ],
  ['EGG', /^egg|eggs|mayonnaise|noodles, egg|meringue|ladyfingers|custard/],
  ['FISH', /^fish|anchovy|fish sauce|sauce, fish|caviar|\broe\b|worcestershire/],
  ['CRUSTACEAN', /crustaceans|shrimp|crab|lobster|crayfish|prawn/],
  ['MOLLUSC', /mollusks|squid|octopus|mussel|clam|oyster|scallop|snail|cuttlefish/],
  ['PEANUT', /peanut/],
  [
    'TREE_NUT',
    /almond|walnut|hazelnut|filbert|cashew|pistachio|pecan|macadamia|brazilnut|brazil nut|pine nut|pinyon/,
  ],
  ['SOY', /soy(?!bean oil)|tofu|edamame|miso|natto|tempeh/],
  ['CELERY', /celery|celeriac/],
  ['MUSTARD', /mustard/],
  ['SESAME', /sesame|tahini|hummus/],
  // Sulfured dried fruit and wine as a cooking ingredient. A spoon of wine vinegar in a salad stays far below the
  // 10 mg/kg SO₂ of EU 1169/2011 Annex II; sake is mostly unsulphited.
  ['SULPHITES', /sulfured|^alcoholic beverage, wine/],
  ['LUPIN', /lupin/],
];

/** Label foods: their allergens by the product (mayonnaise with egg and mustard, gochujang with wheat and soy…). */
const LABEL_FOODS: Readonly<Record<string, readonly AllergenCode[]>> = {
  'ru:mayonnaise-67': ['EGG', 'MUSTARD'],
  'ru:kefir-2.5': ['MILK'],
  'ru:ryazhenka-4': ['MILK'],
  'ru:tvorog-5': ['MILK'],
  'ru:tvorog-9': ['MILK'],
  'ru:mascarpone-42': ['MILK'],
  'ru:gochujang': ['GLUTEN', 'SOY'],
  'ru:kvass': ['GLUTEN'],
};

// Exceptions of the patterns above: refined oils, cocoa butter, plant «milks», cream of tartar, nutmeg.
const NOT_ALLERGEN: readonly (readonly [AllergenCode, RegExp])[] = [
  [
    'MILK',
    /cocoa butter|peanut butter|nut butter|coconut milk|soymilk|almond milk|rice milk|oat milk|cream of tartar|butternut/,
  ],
  ['TREE_NUT', /nutmeg|butternut|coconut/],
  ['GLUTEN', /buckwheat|rice noodles|cornstarch|tortillas, ready-to-bake or -fry, corn/],
  ['EGG', /eggplant/],
  ['MOLLUSC', /mushrooms, oyster/],
];

/** The allergen codes of one ingredient. */
export function ingredientAllergens(
  food: Pick<IngredientRecord, 'id' | 'description'>,
): AllergenCode[] {
  const label = LABEL_FOODS[food.id];
  if (label) return [...label];
  const d = food.description.toLowerCase();
  return RULES.filter(
    ([code, re]) => re.test(d) && !NOT_ALLERGEN.some(([c, no]) => c === code && no.test(d)),
  ).map(([code]) => code);
}

/**
 * Cross-contact risk of an ingredient as it is bought (research/R07 §7, the VITAL principle: only where the risk is real
 * and known, never on everything; checked in research/fact-check-food-data.md §6). Nuts share lines with peanuts and
 * other nuts, seeds also with sesame; granola and muesli carry nuts and peanuts; chocolate and cocoa share lines with
 * milk and nuts; buckwheat, millet, sorghum and lentils carry wheat or barley grains (R07 §5: certified «без глютена»
 * only); bread and crispbread share ovens with sesame; dry pasta shares lines with egg pasta. Plain dried fruit is not
 * on the list: no data shows a nut risk outside mixes. Only `severeAllergy` excludes an item by its traces.
 */
const TRACE_RULES: readonly (readonly [
  readonly AllergenCode[],
  (d: string, category: number) => boolean,
])[] = [
  // Coconut is a «nut» of the SR food group only; its milk and flakes come from their own lines.
  [['PEANUT', 'TREE_NUT'], (d, c) => (c === 12 && !d.includes('coconut')) || /^peanuts/.test(d)],
  [['SESAME'], (d, c) => c === 12 && d.startsWith('seeds')],
  [['PEANUT', 'TREE_NUT'], (d) => /granola|muesli/.test(d)],
  [['MILK', 'PEANUT', 'TREE_NUT'], (d) => /chocolate|^cocoa/.test(d)],
  [['GLUTEN'], (d) => /buckwheat|millet|sorghum|^lentils/.test(d)],
  [['SESAME'], (d, c) => c === 18 && /^bread|crispbread|^rolls|^crackers|pita/.test(d)],
  [['EGG'], (d) => /^pasta|spaghetti|macaroni/.test(d)],
];

/** The allergens an ingredient may carry as traces (its own allergens left out). */
export function ingredientTraces(
  food: Pick<IngredientRecord, 'id' | 'description' | 'category'>,
): AllergenCode[] {
  if (LABEL_FOODS[food.id]) return [];
  const d = food.description.toLowerCase();
  const own = new Set(ingredientAllergens(food));
  const codes = TRACE_RULES.filter(([, test]) => test(d, food.category)).flatMap(([list]) => list);
  return [...new Set(codes)].filter((code) => !own.has(code));
}

/** Animal-product facts of an ingredient (SR Legacy food groups: 5 poultry, 7 sausages, 10 pork, 13 beef, 15 fish, 17 lamb). */
export function ingredientAnimal(food: Pick<IngredientRecord, 'id' | 'description' | 'category'>) {
  const d = food.description.toLowerCase();
  const fish = food.category === 15 || /^fish|anchovy|fish sauce|sauce, fish|caviar/.test(d);
  const meat =
    [5, 7, 10, 13, 17].includes(food.category) ||
    /broth|bouillon|stock|lard|gelatin|beef|chicken|pork/.test(
      d.replace(/^(soup|sauce), (beef|chicken)/, 'broth'),
    );
  const allergens = ingredientAllergens(food);
  return {
    meat: meat && !fish && !/^(beans|soy|tofu)/.test(d),
    fish,
    dairy: allergens.includes('MILK'),
    egg: allergens.includes('EGG'),
    honey: d.startsWith('honey'),
    gelatin: d.includes('gelatin'),
  };
}
