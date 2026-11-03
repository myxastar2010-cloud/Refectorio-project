/**
 * Cooking losses of vitamins and minerals (ADR 0015): every raw ingredient of a cooked dish gets the USDA Table of
 * Nutrient Retention Factors (Release 6, 2007) code of its food group and of the way the dish is cooked; the mapping
 * follows research/R18-tables.md §T3b. Ingredients that are already cooked or processed (bread, cheese in a cold dish,
 * canned food, sauces, oils, spices) and fresh herbs added at the end keep their values (no code).
 */

/** How a dish is cooked, as far as nutrient losses go. `boil-drain`: the water is poured off; `boil-keep`: it is eaten. */
export const HEATS = [
  'none',
  'boil-drain',
  'boil-keep',
  'stew',
  'fry',
  'deepfry',
  'bake',
  'grill',
  'steam',
] as const;
export type Heat = (typeof HEATS)[number];

/** What the retention table needs to know about an ingredient. */
export type IngredientFacts = {
  /** USDA SR Legacy description (English). */
  readonly description: string;
  /** SR Legacy food_category_id (1 dairy and egg … 28 alcoholic beverages); 0 for label foods. */
  readonly category: number;
  /** Fat per 100 g — splits finfish at 5 %. */
  readonly fatG: number | null;
};

/** Food groups of the retention table. */
export type RetentionClass =
  | 'vegOther'
  | 'vegGreens'
  | 'vegRoots'
  | 'vegFrozen'
  | 'potatoes'
  | 'tomatoes'
  | 'fruit'
  | 'citrus'
  | 'driedFruit'
  | 'flour'
  | 'pasta'
  | 'rice'
  | 'cereal'
  | 'oats'
  | 'legumesQuick'
  | 'legumesLong'
  | 'legumesCanned'
  | 'beef'
  | 'beefGround'
  | 'pork'
  | 'porkGround'
  | 'bacon'
  | 'ham'
  | 'sausage'
  | 'lamb'
  | 'veal'
  | 'liver'
  | 'chicken'
  | 'turkey'
  | 'fishLean'
  | 'fishFat'
  | 'shellfish'
  | 'eggs'
  | 'milk'
  | 'cheese'
  | 'nuts';

type Codes = Partial<Record<Exclude<Heat, 'none'>, string>>;
const all = (code: string): Codes => ({
  'boil-drain': code,
  'boil-keep': code,
  stew: code,
  fry: code,
  deepfry: code,
  bake: code,
  grill: code,
  steam: code,
});

/** Retn_Code by class and heat (USDA RF6; R18 §T3b). A missing heat means: no factor applies. */
export const RETENTION_CODES: Readonly<Record<RetentionClass, Codes>> = {
  vegOther: {
    'boil-drain': '3775',
    'boil-keep': '3776',
    stew: '3776',
    fry: '3780',
    deepfry: '3780',
    bake: '3771',
    grill: '3771',
    steam: '3784',
  },
  vegGreens: {
    'boil-drain': '3005',
    'boil-keep': '3006',
    stew: '3006',
    fry: '3015',
    deepfry: '3015',
    bake: '3001',
    grill: '3001',
    steam: '3004',
  },
  vegRoots: {
    'boil-drain': '3455',
    'boil-keep': '3456',
    stew: '3456',
    fry: '3460',
    deepfry: '3460',
    bake: '3451',
    grill: '3451',
    steam: '3464',
  },
  // Frozen vegetables are blanched already: boiled, stewed or steamed from frozen → «cooked from frozen, drained».
  vegFrozen: {
    'boil-drain': '3789',
    'boil-keep': '3789',
    stew: '3789',
    steam: '3789',
    fry: '3780',
    deepfry: '3780',
    bake: '3771',
    grill: '3771',
  },
  potatoes: {
    'boil-drain': '3308',
    'boil-keep': '3309',
    stew: '3309',
    fry: '3315',
    deepfry: '3315',
    bake: '3301',
    grill: '3301',
    steam: '3307',
  },
  tomatoes: {
    'boil-drain': '3751',
    'boil-keep': '3751',
    stew: '3751',
    steam: '3751',
    bake: '3751',
    fry: '3752',
    deepfry: '3752',
    grill: '3752',
  },
  fruit: {
    'boil-drain': '0155',
    'boil-keep': '0155',
    stew: '0155',
    steam: '0155',
    bake: '0151',
    grill: '0152',
    fry: '0153',
    deepfry: '0153',
  },
  citrus: all('0270'),
  driedFruit: {
    'boil-drain': '0255',
    'boil-keep': '0255',
    stew: '0255',
    steam: '0255',
    bake: '0251',
    grill: '0251',
    fry: '0253',
    deepfry: '0253',
  },
  flour: {
    'boil-drain': '0302',
    'boil-keep': '0302',
    stew: '0302',
    steam: '0302',
    bake: '0301',
    grill: '0301',
    fry: '0305',
    deepfry: '0305',
  },
  pasta: {
    'boil-drain': '0381',
    'boil-keep': '0384',
    stew: '0384',
    steam: '0381',
    bake: '0382',
    fry: '0381',
    deepfry: '0381',
    grill: '0381',
  },
  rice: {
    'boil-drain': '0431',
    'boil-keep': '0432',
    stew: '0432',
    steam: '0432',
    bake: '0432',
    fry: '0433',
    deepfry: '0433',
    grill: '0432',
  },
  cereal: all('0358'),
  oats: all('0352'),
  // Lentils and split peas cook 15–20 min, beans and chickpeas 45–75 min (the RF6 groups by cooking time).
  legumesQuick: {
    'boil-drain': '0501',
    'boil-keep': '0502',
    stew: '0502',
    steam: '0502',
    bake: '0504',
    grill: '0504',
    fry: '0506',
    deepfry: '0506',
  },
  legumesLong: {
    'boil-drain': '0521',
    'boil-keep': '0522',
    stew: '0522',
    steam: '0522',
    bake: '0524',
    grill: '0524',
    fry: '0526',
    deepfry: '0526',
  },
  legumesCanned: all('0550'),
  beef: {
    'boil-drain': '0653',
    'boil-keep': '0654',
    stew: '0652',
    steam: '0653',
    bake: '0601',
    grill: '0602',
    fry: '0604',
    deepfry: '0605',
  },
  beefGround: {
    'boil-drain': '0753',
    'boil-keep': '0754',
    stew: '0752',
    steam: '0753',
    bake: '0750',
    grill: '0603',
    fry: '0752',
    deepfry: '0752',
  },
  pork: {
    'boil-drain': '1301',
    'boil-keep': '1302',
    stew: '1302',
    steam: '1301',
    bake: '1254',
    grill: '1251',
    fry: '1252',
    deepfry: '1253',
  },
  porkGround: {
    'boil-drain': '1405',
    'boil-keep': '1406',
    stew: '1402',
    steam: '1405',
    bake: '1402',
    grill: '1402',
    fry: '1402',
    deepfry: '1402',
  },
  bacon: all('1456'),
  ham: {
    'boil-drain': '1521',
    'boil-keep': '1522',
    stew: '1522',
    steam: '1521',
    bake: '1459',
    grill: '1451',
    fry: '1451',
    deepfry: '1451',
  },
  sausage: {
    'boil-drain': '1654',
    'boil-keep': '1655',
    stew: '1655',
    steam: '1654',
    bake: '1655',
    grill: '1657',
    fry: '1659',
    deepfry: '1659',
  },
  lamb: {
    'boil-drain': '1055',
    'boil-keep': '1056',
    stew: '1052',
    steam: '1055',
    bake: '1004',
    grill: '1001',
    fry: '1001',
    deepfry: '1001',
  },
  veal: {
    'boil-drain': '2003',
    'boil-keep': '2004',
    stew: '2002',
    steam: '2003',
    bake: '1954',
    grill: '1951',
    fry: '1952',
    deepfry: '1953',
  },
  liver: {
    'boil-drain': '1152',
    'boil-keep': '1153',
    stew: '1153',
    steam: '1152',
    bake: '1151',
    grill: '1151',
    fry: '1151',
    deepfry: '1151',
  },
  chicken: {
    'boil-drain': '0855',
    'boil-keep': '0856',
    stew: '0852',
    steam: '0855',
    bake: '0805',
    grill: '0801',
    fry: '0803',
    deepfry: '0804',
  },
  turkey: {
    'boil-drain': '1851',
    'boil-keep': '1852',
    stew: '1852',
    steam: '1851',
    bake: '1805',
    grill: '1805',
    fry: '1805',
    deepfry: '1805',
  },
  fishLean: {
    'boil-drain': '2401',
    'boil-keep': '2402',
    stew: '2402',
    steam: '2401',
    bake: '2301',
    grill: '2305',
    fry: '2309',
    deepfry: '2310',
  },
  fishFat: {
    'boil-drain': '2551',
    'boil-keep': '2552',
    stew: '2552',
    steam: '2551',
    bake: '2451',
    grill: '2455',
    fry: '2459',
    deepfry: '2460',
  },
  shellfish: {
    'boil-drain': '2761',
    'boil-keep': '2762',
    stew: '2762',
    steam: '2770',
    bake: '2750',
    grill: '2753',
    fry: '2755',
    deepfry: '2756',
  },
  eggs: {
    'boil-drain': '0105',
    'boil-keep': '0107',
    stew: '0107',
    steam: '0107',
    bake: '0101',
    grill: '0101',
    fry: '0103',
    deepfry: '0103',
  },
  // Milk on the stove ≈ 10 min, in the oven ≈ 30 min (RF6 «MILK, HEATED»); cream follows milk.
  milk: {
    'boil-drain': '2151',
    'boil-keep': '2151',
    stew: '2151',
    steam: '2151',
    fry: '2151',
    deepfry: '2151',
    bake: '2152',
    grill: '2152',
  },
  // Cheese changes only when it melts: baked, grilled, fried, or cooked in a sauce.
  cheese: {
    'boil-keep': '0005',
    stew: '0005',
    bake: '0001',
    grill: '0003',
    fry: '0003',
    deepfry: '0003',
  },
  nuts: {
    'boil-keep': '2204',
    stew: '2204',
    bake: '2201',
    grill: '2202',
    fry: '2203',
    deepfry: '2203',
  },
};

const has = (d: string, ...words: string[]) => words.some((w) => d.includes(w));

/** Raw-state words of SR descriptions: such an ingredient is cooked in the dish. */
const RAW_STATE = /\braw\b|, dry\b|\bdry,|uncooked|unprepared|, fresh\b|mature seeds/;
const HERB =
  /^(parsley|dill|coriander|basil|spearmint|peppermint|chives|mint|rosemary|thyme|tarragon|sage|lemon grass|chervil)/;
const GREENS =
  /^(spinach|kale|chard|collards|mustard greens|turnip greens|beet greens|sorrel|lettuce|arugula|watercress|dock)/;
const ROOTS =
  /^(carrots?|beets?\b|beets,|turnips?|radish|parsnips?|rutabagas?|celeriac|sweet potato|jerusalem|horseradish|ginger root)/;

/**
 * The retention class of an ingredient, or null when the retention table does not apply to it (spices, oils,
 * sweets, beverages, sauces, baked and other ready foods, fresh herbs, foods already cooked).
 */
export function retentionClass(food: IngredientFacts): RetentionClass | null {
  const d = food.description.toLowerCase();
  const c = food.category;
  const cooked =
    /\bcooked\b|canned|roasted|smoked|cured|pickled|fried|boiled|baked|toasted|dried\b/.test(d);
  switch (c) {
    case 1: {
      if (d.startsWith('milk,') || d.startsWith('cream, fluid')) return 'milk';
      if (d.startsWith('cheese') && !d.startsWith('cheese spread')) return 'cheese';
      if (d.startsWith('egg') && !cooked) return 'eggs';
      return null;
    }
    case 5:
      if (cooked) return null;
      if (d.includes('turkey')) return 'turkey';
      if (d.includes('liver')) return 'liver';
      return 'chicken';
    case 7:
      if (d.includes('bacon')) return 'bacon';
      if (d.includes('ham') && !d.includes('hamburger')) return 'ham';
      return 'sausage';
    case 9:
      if (has(d, 'juice', 'canned', 'syrup')) return null;
      if (has(d, 'dried', 'prunes', 'raisins', 'dates')) return 'driedFruit';
      if (has(d, 'orange', 'lemon', 'lime', 'tangerine', 'grapefruit')) return 'citrus';
      return 'fruit';
    case 10:
      if (cooked) return null;
      if (d.includes('bacon')) return 'bacon';
      if (d.includes('cured') || d.includes('ham,')) return 'ham';
      if (d.includes('ground')) return 'porkGround';
      if (d.includes('liver')) return 'liver';
      return 'pork';
    case 11: {
      if (HERB.test(d)) return null;
      if (cooked && !d.includes('frozen')) return null;
      if (d.startsWith('potato')) return 'potatoes';
      if (d.startsWith('tomato') && !d.includes('paste') && !d.includes('sauce')) return 'tomatoes';
      if (d.includes('frozen')) return 'vegFrozen';
      if (GREENS.test(d)) return 'vegGreens';
      if (ROOTS.test(d)) return 'vegRoots';
      if (has(d, 'paste', 'sauce', 'puree', 'juice', 'sauerkraut', 'pickle')) return null;
      return 'vegOther';
    }
    case 12:
      return cooked ? null : 'nuts';
    case 13:
      if (cooked) return null;
      if (d.includes('liver')) return 'liver';
      if (d.includes('ground')) return 'beefGround';
      return 'beef';
    case 15:
      if (cooked || has(d, 'salted', 'kippered')) return null;
      if (
        has(
          d,
          'shrimp',
          'crab',
          'lobster',
          'crayfish',
          'mussel',
          'clam',
          'oyster',
          'scallop',
          'squid',
          'octopus',
        )
      )
        return 'shellfish';
      return (food.fatG ?? 0) > 5 ? 'fishFat' : 'fishLean';
    case 16:
      if (d.includes('canned')) return 'legumesCanned';
      if (!RAW_STATE.test(d)) return null;
      if (has(d, 'lentils', 'split')) return 'legumesQuick';
      if (has(d, 'beans', 'chickpeas', 'peas', 'soybeans')) return 'legumesLong';
      return null;
    case 17:
      if (cooked) return null;
      if (d.includes('liver')) return 'liver';
      if (d.startsWith('veal')) return 'veal';
      return 'lamb';
    case 8:
      return d.includes('oats') && !cooked ? 'oats' : null;
    case 20: {
      if (cooked) return null;
      if (has(d, 'rice noodles', 'pasta', 'spaghetti', 'macaroni', 'noodles')) return 'pasta';
      if (d.startsWith('rice')) return 'rice';
      if (has(d, 'flour', 'meal', 'semolina', 'cornstarch')) return 'flour';
      return 'cereal';
    }
    default:
      return null;
  }
}

/**
 * The Retn_Code of an ingredient in a dish, or null (no factor). `raw` — the dish keeps this ingredient uncooked
 * (a salad's fresh vegetables, the vegetables of a shawarma, the fish of a poke bowl).
 */
export function retentionCode(food: IngredientFacts, heat: Heat, raw = false): string | null {
  if (heat === 'none' || raw) return null;
  const cls = retentionClass(food);
  if (!cls) return null;
  // A cereal porridge is boiled; a cereal in a bake (semolina in a casserole) is flour.
  if (cls === 'cereal' && heat === 'bake' && food.description.toLowerCase().startsWith('semolina'))
    return RETENTION_CODES.flour.bake ?? null;
  return RETENTION_CODES[cls][heat] ?? null;
}

/**
 * Classes that stay raw in a salad and in assembled dishes (shawarma, burger, tacos, sandwiches, poke): fresh
 * vegetables, greens and fruit. Potatoes, roots, eggs, meat, fish, grains and legumes are cooked for a salad.
 */
export const FRESH_IN_ASSEMBLED: ReadonlySet<RetentionClass> = new Set([
  'vegOther',
  'vegGreens',
  'tomatoes',
  'fruit',
  'citrus',
  'cheese',
  'milk',
  'nuts',
]);
