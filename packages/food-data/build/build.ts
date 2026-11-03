// The food data build (stage 4, phase 2; ADR 0015). Inputs: the USDA SR Legacy archive and the USDA Table of Nutrient
// Retention Factors (Release 6) unpacked in refectorio-app/.cache/usda; the research recipes (refectorio-workspace);
// the authored facts (data/src/items.json, texts.json). Outputs: the committed sources data/src/{ingredients,
// retention,recipes}.json, the browser chunks data/food-core.json and data/food-text.json, and the report
// refectorio-workspace/reports/stage-4/food-data-report.md. Run: `npm run food-data`. The AI never writes these numbers.
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { gzipSync } from 'node:zlib';
import { catalogSchema, dishTextSchema, type Dish } from '@refectorio/taste-core';
import { assemble } from '../src/assemble';
import { WATER_ID } from '../src/compute';
import {
  emptyVector,
  NUTRIENT_KEYS,
  toArray,
  type NutrientKey,
  type NutrientVector,
} from '../src/nutrients';
import { RETENTION_CODES, type Heat, type RetentionClass } from '../src/retention';
import { itemsFileSchema, type ItemsFile, type Role } from '../src/schema';
import {
  textsFileSchema,
  type IngredientsFile,
  type RecipeSource,
  type RecipesFile,
  type RetentionFile,
} from '../src/sources';

const APP = path.resolve(process.argv[2] ?? '.');
const PKG = path.join(APP, 'packages', 'food-data');
const USDA = path.join(APP, '.cache', 'usda');
const TASTE = path.join(APP, 'packages', 'taste-core', 'data');
const WS = path.join(APP, '..', 'refectorio-workspace');
const STAGE3 = path.join(WS, 'research', 'stage-3-dish-data');
const STAGE4 = path.join(WS, 'research', 'stage-4-food-data');
const REPORT = path.join(WS, 'reports', 'stage-4', 'food-data-report.md');
const TODAY = new Date().toISOString().slice(0, 10);

// ── FoodData Central nutrient ids (nutrient.csv) ────────────────────────────────────────────────────────────────
const F = {
  energy: 1008,
  protein: 1003,
  fat: 1004,
  carbsDiff: 1005,
  fibre: 1079,
  satFat: 1258,
  sugars: 2000,
  sucrose: 1210,
  water: 1051,
  sodium: 1093,
  potassium: 1092,
  calcium: 1087,
  iron: 1089,
  magnesium: 1090,
  zinc: 1095,
  phosphorus: 1091,
  selenium: 1103,
  iodine: 1100,
  vitA: 1106,
  vitC: 1162,
  vitD: 1114,
  vitE: 1109,
  vitK: 1185,
  thiamin: 1165,
  riboflavin: 1166,
  niacin: 1167,
  b6: 1175,
  b12: 1178,
  folateDfe: 1190,
  folateTotal: 1177,
  folicAcid: 1186,
  folateFood: 1187,
  cholesterol: 1253,
  caffeine: 1057,
  ala: 1404,
  c18_3: 1270,
  epa: 1278,
  dha: 1272,
} as const;
const DIRECT: Partial<Record<NutrientKey, number>> = {
  energyKcal: F.energy,
  proteinG: F.protein,
  fatG: F.fat,
  satFatG: F.satFat,
  sugarsG: F.sugars,
  fibreG: F.fibre,
  waterG: F.water,
  sodiumMg: F.sodium,
  potassiumMg: F.potassium,
  calciumMg: F.calcium,
  ironMg: F.iron,
  magnesiumMg: F.magnesium,
  zincMg: F.zinc,
  phosphorusMg: F.phosphorus,
  seleniumUg: F.selenium,
  iodineUg: F.iodine,
  vitaminAUg: F.vitA,
  vitaminCMg: F.vitC,
  vitaminDUg: F.vitD,
  vitaminEMg: F.vitE,
  vitaminKUg: F.vitK,
  thiaminMg: F.thiamin,
  riboflavinMg: F.riboflavin,
  niacinMg: F.niacin,
  vitaminB6Mg: F.b6,
  vitaminB12Ug: F.b12,
  cholesterolMg: F.cholesterol,
  caffeineMg: F.caffeine,
};
const MACROS = new Set<NutrientKey>([
  'energyKcal',
  'proteinG',
  'fatG',
  'satFatG',
  'carbsG',
  'sugarsG',
  'fibreG',
  'waterG',
]);
/** Retention table nutrient numbers (SR «Nutr_No») → our keys; folate: food folate, else total folate. */
const RETN_NUTRIENT: Readonly<Record<string, NutrientKey>> = {
  '301': 'calciumMg',
  '303': 'ironMg',
  '304': 'magnesiumMg',
  '305': 'phosphorusMg',
  '306': 'potassiumMg',
  '307': 'sodiumMg',
  '309': 'zincMg',
  '392': 'vitaminAUg',
  '401': 'vitaminCMg',
  '404': 'thiaminMg',
  '405': 'riboflavinMg',
  '406': 'niacinMg',
  '415': 'vitaminB6Mg',
  '418': 'vitaminB12Ug',
  '432': 'folateUgDfe',
};

// ── US fortification (ADR 0015): Russian flour, rice, pasta, milk are not fortified ─────────────────────────────
/** Enriched or fortified SR rows → their unenriched/unfortified twin (micronutrients from the twin). */
const TWINS: Readonly<Record<string, string>> = {
  'Wheat flour, white, all-purpose, enriched, unbleached':
    'Wheat flour, white, all-purpose, unenriched',
  'Rice, white, short-grain, enriched, uncooked': 'Rice, white, short-grain, raw, unenriched',
  'Rice, white, long-grain, regular, raw, enriched':
    'Rice, white, long-grain, regular, raw, unenriched',
  'Pasta, dry, enriched': 'Pasta, dry, unenriched',
  'Semolina, enriched': 'Semolina, unenriched',
  'Bread, pita, white, enriched': 'Bread, pita, white, unenriched',
  'Noodles, egg, dry, enriched': 'Noodles, egg, dry, unenriched',
  'Milk, whole, 3.25% milkfat, with added vitamin D':
    'Milk, whole, 3.25% milkfat, without added vitamin A and vitamin D',
  'Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D':
    'Milk, reduced fat, fluid, 2% milkfat, without added vitamin A and vitamin D',
  'Cheese, pasteurized process, American, fortified with vitamin D':
    'Cheese, pasteurized process, American, without added vitamin D',
  // US commercial breads carry added calcium salts (144–684 mg Ca/100 g); a lean bread is the Russian loaf's match.
  'Bread, white, commercially prepared (includes soft bread crumbs)':
    'Bread, french or vienna (includes sourdough)',
  'Bread, white wheat': 'Bread, french or vienna (includes sourdough)',
  'Rolls, hamburger or hotdog, plain': 'Bread, french or vienna (includes sourdough)',
  'Bread, crumbs, dry, grated, plain': 'Bread, french or vienna (includes sourdough)',
  'Bread, whole-wheat, commercially prepared': 'Bread, whole-wheat, prepared from recipe',
  // Calcium-sulfate firm tofu has 683 mg Ca/100 g; nigari tofu is the cautious choice for an unknown coagulant.
  'Tofu, raw, firm, prepared with calcium sulfate': 'Tofu, extra firm, prepared with nigari',
};
/**
 * Twins that are another product, not a drier or wetter form of the same one: their values per 100 g as they are. The
 * firm tofu row's minerals are imputed (n = 0); scaled to its dry matter, the nigari row's iron rose above both rows
 * (research/fact-check-food-data.md, С3).
 */
const TWIN_AS_IS = new Set(['Tofu, raw, firm, prepared with calcium sulfate']);
const ENRICHED_FLOUR = 'Wheat flour, white, all-purpose, enriched, unbleached';
const PLAIN_FLOUR = 'Wheat flour, white, all-purpose, unenriched';
/** What US enrichment adds to flour (21 CFR 137.165): iron, thiamin, riboflavin, niacin (+ folic acid). */
const ENRICHMENT: readonly NutrientKey[] = ['ironMg', 'thiaminMg', 'riboflavinMg', 'niacinMg'];

// ── Label foods: macronutrients from Russian labels, the rest from the nearest USDA row (approx) ───────────────
const LABEL_ANALOGUE: Readonly<Record<string, string | null>> = {
  'ru:mayonnaise-67': 'Salad dressing, mayonnaise, regular',
  'ru:kefir-2.5': 'Milk, reduced fat, fluid, 2% milkfat, without added vitamin A and vitamin D',
  'ru:ryazhenka-4': 'Milk, whole, 3.25% milkfat, without added vitamin A and vitamin D',
  'ru:tvorog-5': 'Cheese, cottage, creamed, large or small curd',
  'ru:tvorog-9': 'Cheese, cottage, creamed, large or small curd',
  // Mascarpone is cream set with acid, unsalted; US cream cheese is salted (314 mg Na/100 g).
  'ru:mascarpone-42': 'Cream, fluid, heavy whipping',
  // The nearest fermented soybean paste; the label medians below replace what labels give.
  'ru:gochujang': 'Miso',
  // The nearest fermented grain drink in SR Legacy (fact-check С1): without it, the kvass of an okroshka (185 of
  // 300 g) left the dish without sodium, though its salt is known.
  'ru:kvass': 'Alcoholic beverage, beer, regular, all',
};
/**
 * Russian butter and curd (творог) are unsalted, their US rows are salted (643 and 315 mg Na/100 g): the sodium alone
 * comes from the unsalted US row, per dry matter (salt lives in the solids). Also applies to a label food's analogue.
 */
const UNSALTED: Readonly<Record<string, string>> = {
  'Butter, salted': 'Butter, without salt',
  'Cheese, cottage, creamed, large or small curd':
    'Cheese, cottage, lowfat, 1% milkfat, no sodium added',
};
/**
 * Label values beyond the macronutrients, where no USDA row stands in: the median of the labels, with the query.
 * Gochujang is salty (20 g in a bibimbap); without its sodium the dish had none.
 */
const LABEL_MICROS: Readonly<
  Record<string, { values: Partial<Record<NutrientKey, number>>; source: string }>
> = {
  'ru:gochujang': {
    values: { sodiumMg: 2480, sugarsG: 25, potassiumMg: 375, ironMg: 1.1 },
    source:
      'натрий, сахара — медианы 34 этикеток пасты кочуджан, калий — 8, железо — 10; Open Food Facts (поиск «gochujang», 2026-11-03; research/_sources/stage4/food-data/off-gochujang.json); остальное — мисо (approx)',
  },
};
/** Values that live in the milk fat: scaled by label fat / analogue fat. */
const FAT_BOUND = new Set<NutrientKey>([
  'satFatG',
  'cholesterolMg',
  'vitaminAUg',
  'vitaminDUg',
  'vitaminEMg',
  'alaG',
  'epaDhaG',
]);
/** Plain dairy: all carbohydrate is lactose. */
const PLAIN_DAIRY = new Set([
  'ru:kefir-2.5',
  'ru:ryazhenka-4',
  'ru:tvorog-5',
  'ru:tvorog-9',
  'ru:mascarpone-42',
]);

/** Batch-recipe names that are label foods or need a USDA row other than their own wording. */
const BATCH_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^water$/i, 'Beverages, water, tap, drinking'],
  [/tvorog 5/i, 'ru:tvorog-5'],
  [/tvorog 9/i, 'ru:tvorog-9'],
  [/ryazhenka/i, 'ru:ryazhenka-4'],
  [/kefir 2[.,]5/i, 'ru:kefir-2.5'],
  [/mayonnaise 67/i, 'ru:mayonnaise-67'],
  [/smetana|sour cream 20/i, 'Cream, sour, cultured'],
];

// ── Assumed zeros: biology, not missing data (fibre in meat, B12 and cholesterol in plants…) ──────────────────────
const ANIMAL = new Set([1, 5, 7, 10, 13, 15, 17]);
const PLANT = new Set([2, 9, 11, 12, 16, 20]);
function assumedZeros(v: NutrientVector, category: number, d: string): number {
  let filled = 0;
  const zero = (key: NutrientKey, when: boolean) => {
    if (when && v[key] === null) {
      v[key] = 0;
      filled += 1;
    }
  };
  const plantOil = category === 4 && /^oil, (?!fish)/.test(d);
  const caffeineSource =
    /coffee|\btea\b|cocoa|chocolate|cola|guarana|mate\b|espresso|energy drink/.test(d);
  zero('fibreG', ANIMAL.has(category) || category === 4);
  zero('sugarsG', [5, 10, 13, 15, 17].includes(category) || plantOil);
  zero('cholesterolMg', PLANT.has(category) || plantOil);
  zero('vitaminB12Ug', PLANT.has(category) || plantOil);
  zero('epaDhaG', PLANT.has(category) || plantOil);
  zero('vitaminDUg', (PLANT.has(category) && !d.includes('mushroom')) || plantOil);
  zero('caffeineMg', !caffeineSource);
  // Grains, pasta and oils have no vitamin C; SR leaves some of them blank (whole-wheat pasta).
  zero('vitaminCMg', category === 20 || plantOil);
  return filled;
}

// ── Added and free sugars (WHO 2015 free sugars; research/R17) ────────────────────────────────────────────────────
const ADDED_ALL =
  /^sugars?\b|^honey|syrup|^molasses|jams? and preserves|^jellies|marmalade|^candies|^frosting|^topping|dessert topping/;
const ADDED_SWEET =
  /condensed, sweetened|ice cream|chocolate|cookies|catsup|ketchup|teriyaki|sweet and sour|hoisin|barbecue|granola|cocoa mix|carbonated|cereals ready-to-eat|pudding|graham|ladyfingers|pastry|doughnut|cake|\bpie\b|croissant|sweet rolls|danish|ginger ale|lemonade/;
function sugarParts(
  d: string,
  category: number,
  sugars: number | null,
  sucrose: number | null,
  label: string | null,
) {
  if (label === 'ru:kvass') return { added: sugars, free: sugars };
  // Shop gochujang is sweetened (corn syrup and sugar head its labels' ingredients): its sugars count as added.
  if (label === 'ru:gochujang') return { added: sugars, free: sugars };
  let added: number | null = 0;
  if (ADDED_ALL.test(d)) added = sugars;
  else if (ADDED_SWEET.test(d)) added = sucrose ?? sugars;
  // Plain bread and buns: the sucrose there is added; without a sucrose value, none is counted (an underestimate).
  else if (category === 18 || category === 19) added = sucrose ?? 0;
  const juice = /juice/.test(d) && (category === 9 || category === 14);
  const free = added === null ? null : added + (juice ? (sugars ?? 0) : 0);
  return { added, free };
}

// ── CSV ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line.charAt(i);
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

type SrFood = { fdcId: number; description: string; category: number };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

async function readFoods(): Promise<{ byId: Map<number, SrFood>; byDesc: Map<string, SrFood> }> {
  const text = await readFile(path.join(USDA, 'food.csv'), 'utf8');
  const byId = new Map<number, SrFood>();
  const byDesc = new Map<string, SrFood>();
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const [id, , description, category] = splitCsvLine(line);
    const food = { fdcId: Number(id), description: description ?? '', category: Number(category) };
    byId.set(food.fdcId, food);
    byDesc.set(norm(food.description), food);
  }
  return { byId, byDesc };
}

async function readNutrients(
  fdcIds: ReadonlySet<number>,
): Promise<Map<number, Map<number, number>>> {
  const wanted = new Set<number>(Object.values(F));
  const values = new Map<number, Map<number, number>>();
  const lines = readline.createInterface({
    input: createReadStream(path.join(USDA, 'food_nutrient.csv')),
  });
  let header = true;
  for await (const line of lines) {
    if (header) {
      header = false;
      continue;
    }
    // "id","fdc_id","nutrient_id","amount",…
    const m = /^"\d+","(\d+)","(\d+)","([^"]*)"/.exec(line);
    if (!m) continue;
    const fdcId = Number(m[1]);
    const nutrientId = Number(m[2]);
    if (!fdcIds.has(fdcId) || !wanted.has(nutrientId)) continue;
    const row = values.get(fdcId) ?? new Map<number, number>();
    row.set(nutrientId, Number(m[3]));
    values.set(fdcId, row);
  }
  return values;
}

function srVector(values: ReadonlyMap<number, number> | undefined): NutrientVector {
  const g = (id: number) => values?.get(id) ?? null;
  const v = emptyVector();
  for (const [key, id] of Object.entries(DIRECT) as [NutrientKey, number][]) v[key] = g(id);
  const carbsDiff = g(F.carbsDiff);
  v.carbsG = carbsDiff === null ? null : Math.max(0, carbsDiff - (g(F.fibre) ?? 0));
  const folicAcid = g(F.folicAcid);
  v.folateUgDfe = g(F.folateDfe) ?? (folicAcid ? null : g(F.folateTotal));
  v.alaG = g(F.ala) ?? g(F.c18_3);
  const epa = g(F.epa);
  const dha = g(F.dha);
  v.epaDhaG = epa === null && dha === null ? null : (epa ?? 0) + (dha ?? 0);
  return v;
}

// ── Recipes ─────────────────────────────────────────────────────────────────────────────────────────────────────
type Stage3Recipe = {
  ingredients: { en: string; ru?: string; g: number }[];
  cooking?: { methods?: string[] };
};
type Batch9Recipe = Stage3Recipe & {
  portion: { grams: number; ml?: number | null; pieces?: number | null; what?: string };
  cookMin?: number;
  cooking?: {
    methods?: string[];
    drained?: boolean;
    cookMin?: number;
    frying?: { type: string; oil: string } | null;
    roastedMeat?: { cut: string; method: string } | null;
  };
  method: 'fetched' | 'composed';
  sources: { url: string }[];
};
type DishNutrition = {
  dishes: Record<
    string,
    {
      portion: { grams: number; pieces: number | null; what: string };
      method: 'fetched' | 'composed';
      sources: string[];
      ingredients: { key: string; g: number }[];
      cooking: {
        frying: { type: string; oil: string; category: string; fried?: string[] } | null;
        roastedMeat: { cut: string; row: string } | null;
      };
    }
  >;
};
type CookingTables = {
  frying: Record<string, Record<string, { fatGPer100g?: number }>>;
  meatFatRetention: Record<string, { fatChangeGPer100gRaw?: number }>;
};

/** How a game dish is cooked, from the catalog (the recipe snapshot keeps the result; items.json can override). */
function gameHeat(dish: Dish): Heat {
  const m = new Set<string>(dish.cookingMethods);
  if (dish.course === 'soup') return m.has('boiled') || m.has('stewed') ? 'boil-keep' : 'none';
  if (m.has('stewed')) return 'stew';
  if (m.has('deepFried')) return 'deepfry';
  if (m.has('baked')) return 'bake';
  if (m.has('fried')) return 'fry';
  if (m.has('grilled')) return 'grill';
  if (m.has('steamed')) return 'steam';
  if (m.has('boiled')) {
    const drained =
      ['pasta', 'noodles', 'potato', 'dough'].includes(dish.carbBase) || dish.course === 'salad';
    return drained ? 'boil-drain' : 'boil-keep';
  }
  return 'none';
}

function batchHeat(methods: readonly string[], role: Role, drained: boolean): Heat {
  const m = new Set(methods);
  if (role === 'soup' && (m.has('boiled') || m.has('stewed'))) return 'boil-keep';
  // Coffee with steamed milk: only the milk is heated (≈ RF6 «milk, heated»); the brewed coffee row is ready as it is.
  if (m.has('steamed-milk')) return 'boil-keep';
  if (m.has('stewed')) return 'stew';
  if (m.has('deepFried')) return 'deepfry';
  if (m.has('baked')) return 'bake';
  if (m.has('fried')) return 'fry';
  if (m.has('grilled')) return 'grill';
  if (m.has('steamed')) return 'steam';
  if (m.has('boiled')) return drained ? 'boil-drain' : 'boil-keep';
  return 'none';
}

const RAW_FISH_CLASSES: RetentionClass[] = ['fishLean', 'fishFat', 'shellfish'];

/** Russian names of the frying oils and fats, which recipes do not list as ingredients. */
function fallbackNameRu(description: string): string | null {
  const d = description.toLowerCase();
  if (d.startsWith('oil, sunflower')) return 'подсолнечное масло';
  if (d.startsWith('oil, olive')) return 'оливковое масло';
  if (d.startsWith('oil,')) return 'растительное масло';
  if (d.startsWith('butter')) return 'сливочное масло';
  if (d.startsWith('lard')) return 'смалец';
  if (d.startsWith('beverages, water')) return 'вода';
  return null;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

/** JSON with one item per line: readable diffs without a line per number. */
function stringifyRows(value: unknown, rowsKey: string): string {
  const obj = value as Record<string, unknown>;
  const lines = Object.entries(obj).map(([k, v]) => {
    if (k !== rowsKey) return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
    if (Array.isArray(v))
      return `  ${JSON.stringify(k)}: [\n${v.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]`;
    const rows = Object.entries(v as Record<string, unknown>).map(
      ([id, r]) => `    ${JSON.stringify(id)}: ${JSON.stringify(r)}`,
    );
    return `  ${JSON.stringify(k)}: {\n${rows.join(',\n')}\n  }`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}

async function main() {
  for (const file of ['food.csv', 'food_nutrient.csv', 'retn06.txt']) {
    if (!existsSync(path.join(USDA, file)))
      throw new Error(
        `No ${file} in ${USDA}: unpack FoodData_Central_sr_legacy_food_csv_2018-04.zip (food.csv, food_nutrient.csv) and ` +
          'download https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/retn06.txt there.',
      );
  }
  const catalog = catalogSchema.parse(await readJson(path.join(TASTE, 'catalog.json')));
  const dishText = dishTextSchema.parse(await readJson(path.join(TASTE, 'dish-text.json')));
  const dishNutrition = await readJson<DishNutrition>(path.join(TASTE, 'dish-nutrition.json'));
  const stage3Ingredients = await readJson<{
    ingredients: Record<
      string,
      {
        fdcId?: number;
        per100g: Record<string, number>;
        nameRu?: string;
        source?: { url: string | null; title: string; accessed: string };
      }
    >;
  }>(path.join(TASTE, 'food', 'ingredients.json'));
  const cooking = await readJson<CookingTables>(path.join(STAGE3, 'cooking-and-ru-dairy.json'));
  const items: ItemsFile = itemsFileSchema.parse(
    await readJson(path.join(PKG, 'data', 'src', 'items.json')),
  );
  const textsPath = path.join(PKG, 'data', 'src', 'texts.json');
  const texts = existsSync(textsPath)
    ? textsFileSchema.parse(await readJson(textsPath))
    : { version: TODAY, items: {} };

  const stage3Batches: Record<string, Stage3Recipe> = {};
  for (const file of (await readdir(STAGE3))
    .filter((f) => /^batch-\d+-recipes\.json$/.test(f))
    .sort()) {
    Object.assign(
      stage3Batches,
      (await readJson<{ dishes: Record<string, Stage3Recipe> }>(path.join(STAGE3, file))).dishes,
    );
  }
  const batches = new Map<
    number,
    {
      dishes: Record<string, Batch9Recipe>;
      ruFoods: Record<
        string,
        {
          nameRu: string;
          per100g: Record<string, number | null>;
          source: { url: string; title: string; accessed: string };
        }
      >;
    }
  >();
  if (existsSync(STAGE4)) {
    for (const file of (await readdir(STAGE4)).filter((f) => /^batch-\d+-recipes\.json$/.test(f))) {
      const n = Number(/batch-(\d+)/.exec(file)?.[1]);
      const json = await readJson<{
        dishes?: Record<string, Batch9Recipe>;
        ruFoods?: Record<string, never>;
      }>(path.join(STAGE4, file));
      batches.set(n, { dishes: json.dishes ?? {}, ruFoods: json.ruFoods ?? {} });
    }
  }

  const { byId, byDesc } = await readFoods();
  const errors: string[] = [];
  // The recipe wording of an ingredient («кофе эспрессо для пропитки») stays in its recipe; the menu, the search and
  // Kiki show the canonical name (research/stage-4-food-data/ingredient-names.json, reviewed by hand).
  const canonical = (
    await readJson<{ names: Record<string, string> }>(path.join(STAGE4, 'ingredient-names.json'))
  ).names;
  const nameRu = new Map<string, string>();
  const used = new Map<string, SrFood | null>(); // id → SR food (null for label foods)

  const idOfDescription = (description: string): string | null => {
    if (description.startsWith('ru:')) {
      used.set(description, null);
      return description;
    }
    const food = byDesc.get(norm(description));
    if (!food) return null;
    const id = `i_${food.fdcId}`;
    used.set(id, food);
    return id;
  };
  const resolveBatchName = (en: string): string | null => {
    for (const [re, target] of BATCH_ALIASES) if (re.test(en)) return idOfDescription(target);
    return idOfDescription(en);
  };

  // Recipes of the game dishes: the stage-3 snapshot (taste-core/data/dish-nutrition.json).
  const recipes: Record<string, RecipeSource> = {};
  for (const dish of catalog.dishes) {
    const dn = dishNutrition.dishes[dish.id];
    if (!dn) {
      errors.push(`${dish.id}: no stage-3 recipe`);
      continue;
    }
    const facts = items.game[dish.id];
    const research = stage3Batches[dish.id];
    const list: [string, number][] = [];
    dn.ingredients.forEach((item, k) => {
      const id = idOfDescription(item.key);
      if (!id) return errors.push(`${dish.id}: no USDA row «${item.key}»`);
      list.push([id, item.g]);
      const ru = research?.ingredients[k]?.ru;
      if (ru && !nameRu.has(id)) nameRu.set(id, ru.trim());
    });
    const fry = dn.cooking.frying;
    const meat = dn.cooking.roastedMeat;
    const fryRow = fry ? cooking.frying[fry.category]?.[fry.type]?.fatGPer100g : undefined;
    if (fry && fryRow === undefined)
      errors.push(`${dish.id}: no frying row ${fry.category}/${fry.type}`);
    const meatRow = meat ? cooking.meatFatRetention[meat.row]?.fatChangeGPer100gRaw : undefined;
    if (meat && meatRow === undefined) errors.push(`${dish.id}: no meat row ${meat.row}`);
    const rawFish = facts?.rawFish === true;
    recipes[dish.id] = {
      portion: { grams: dn.portion.grams, ml: null, pieces: dn.portion.pieces },
      whatRu: dn.portion.what,
      heat: facts?.heat ?? gameHeat(dish),
      assembled: facts?.assembled ?? dish.course === 'salad',
      ...(rawFish ? { rawClasses: RAW_FISH_CLASSES } : {}),
      ingredients: list,
      frying:
        fry && fryRow !== undefined
          ? {
              oil: idOfDescription(fry.oil) ?? fry.oil,
              row: `${fry.category}/${fry.type}`,
              fatGPer100g: fryRow,
              fried: fry.fried ? fry.fried.map((k) => idOfDescription(k) ?? k) : null,
            }
          : null,
      meatFat:
        meat && meatRow !== undefined
          ? {
              cut: idOfDescription(meat.cut) ?? meat.cut,
              row: meat.row,
              fatChangeGPer100gRaw: meatRow,
            }
          : null,
      method: dn.method,
      sources: dn.sources,
    };
  }

  // Recipes of the menu items: one USDA row or label, or a research batch recipe.
  const labelFoods: Record<
    string,
    { nameRu: string; per100g: Record<string, number>; source: string }
  > = {};
  for (const [key, row] of Object.entries(stage3Ingredients.ingredients)) {
    if (!key.startsWith('ru:')) continue;
    labelFoods[key] = {
      nameRu: row.nameRu ?? key,
      per100g: row.per100g,
      source:
        `${row.source?.title ?? ''} ${row.source?.url ?? ''} (${row.source?.accessed ?? ''})`.trim(),
    };
  }
  for (const batch of batches.values()) {
    for (const [key, row] of Object.entries(batch.ruFoods)) {
      // The batch writes label values with short names (kcal, protein…); the stage-3 shape is energyKcal, proteinG…
      const p = row.per100g;
      const pick = (...names: string[]) =>
        names.map((n) => p[n]).find((v) => typeof v === 'number');
      labelFoods[key] = {
        nameRu: row.nameRu,
        per100g: Object.fromEntries(
          Object.entries({
            energyKcal: pick('energyKcal', 'kcal'),
            proteinG: pick('proteinG', 'protein'),
            fatG: pick('fatG', 'fat'),
            carbsG: pick('carbsG', 'carbs'),
            fibreG: pick('fibreG', 'fiber', 'fibre'),
          }).filter((e): e is [string, number] => e[1] !== undefined),
        ),
        source: `${row.source.title} ${row.source.url} (${row.source.accessed})`,
      };
    }
  }
  for (const [id, item] of Object.entries(items.menu)) {
    const r = item.recipe;
    if (r.kind !== 'batch') {
      const list: [string, number][] = [];
      for (const [part, g] of r.parts) {
        const ingredient =
          typeof part === 'string'
            ? idOfDescription(part)
            : idOfDescription(byId.get(part)?.description ?? '');
        if (!ingredient) {
          errors.push(`${id}: no USDA row ${part}`);
          continue;
        }
        if (!nameRu.has(ingredient) && r.kind === 'single')
          nameRu.set(ingredient, item.nameRu.toLowerCase());
        list.push([ingredient, g]);
      }
      recipes[id] = {
        portion: r.portion,
        whatRu: r.whatRu,
        heat: 'none',
        assembled: false,
        ingredients: list,
        frying: null,
        meatFat: null,
        method: 'single',
        sources: r.sources,
      };
      continue;
    }
    const recipe = batches.get(r.batch)?.dishes[id];
    if (!recipe) {
      errors.push(`${id}: not in batch ${r.batch} yet`);
      continue;
    }
    const list: [string, number][] = [];
    for (const ing of recipe.ingredients) {
      const ingredientId = resolveBatchName(ing.en);
      if (!ingredientId) {
        errors.push(`${id}: no USDA row «${ing.en}»`);
        continue;
      }
      list.push([ingredientId, ing.g]);
      if (ing.ru && !nameRu.has(ingredientId)) nameRu.set(ingredientId, ing.ru.trim());
    }
    const fry = recipe.cooking?.frying ?? null;
    // The only fried batch item is the tofu scramble: tofu and vegetables in a little oil (Bognár «sautéed vegetables»).
    const category = 'vegetables_unbreaded_sauteed';
    const fryRow = fry ? cooking.frying[category]?.[fry.type]?.fatGPer100g : undefined;
    if (fry && fryRow === undefined) errors.push(`${id}: no frying row ${category}/${fry.type}`);
    const cookMin = recipe.cooking?.cookMin ?? recipe.cookMin;
    recipes[id] = {
      portion: {
        grams: recipe.portion.grams,
        ml: recipe.portion.ml ?? null,
        pieces: recipe.portion.pieces ?? null,
      },
      whatRu: recipe.portion.what ?? '',
      heat: batchHeat(recipe.cooking?.methods ?? [], item.role, recipe.cooking?.drained === true),
      assembled: item.role === 'salad' || item.role === 'snack',
      ingredients: list,
      frying:
        fry && fryRow !== undefined
          ? {
              oil: resolveBatchName(fry.oil) ?? fry.oil,
              row: `${category}/${fry.type}`,
              fatGPer100g: fryRow,
              fried: null,
            }
          : null,
      meatFat: null,
      method: recipe.method,
      sources: recipe.sources.map((s) => s.url),
      ...(cookMin !== undefined ? { cookMin } : {}),
    };
  }
  // Frying oils are ingredients of the computation too.
  for (const r of Object.values(recipes))
    if (r.frying)
      used.set(
        r.frying.oil,
        used.get(r.frying.oil) ?? byId.get(Number(r.frying.oil.slice(2))) ?? null,
      );

  // Micronutrient rows: twins and label analogues.
  const twinOf = new Map<string, SrFood>();
  for (const [id, food] of used) {
    if (!food) continue;
    const twin = TWINS[food.description];
    if (twin) {
      const t = byDesc.get(norm(twin));
      if (!t) errors.push(`no twin row «${twin}»`);
      else twinOf.set(id, t);
    }
  }
  const analogues = new Map<string, SrFood>();
  for (const [id] of used) {
    if (!id.startsWith('ru:')) continue;
    const a = LABEL_ANALOGUE[id];
    if (a === undefined) errors.push(`${id}: no analogue decision`);
    else if (a) {
      const f = byDesc.get(norm(a));
      if (!f) errors.push(`${id}: no analogue row «${a}»`);
      else analogues.set(id, f);
    }
  }
  const unsaltedRow = new Map<string, SrFood>();
  for (const [salted, plain] of Object.entries(UNSALTED)) {
    const f = byDesc.get(norm(plain));
    if (!f) errors.push(`no unsalted row «${plain}»`);
    else unsaltedRow.set(salted, f);
  }
  const flour = [byDesc.get(norm(ENRICHED_FLOUR)), byDesc.get(norm(PLAIN_FLOUR))];
  const needed = new Set<number>([
    ...[...used.values()].filter((f): f is SrFood => f !== null).map((f) => f.fdcId),
    ...[...twinOf.values(), ...analogues.values(), ...unsaltedRow.values()].map((f) => f.fdcId),
    ...flour.filter((f): f is SrFood => f !== undefined).map((f) => f.fdcId),
  ]);
  const values = await readNutrients(needed);
  /** Sodium of the unsalted row at the dry matter of a food with `waterG` g of water per 100 g. */
  const unsaltedSodium = (row: SrFood, waterG: number | null): number | null => {
    const r = values.get(row.fdcId);
    const sodium = r?.get(F.sodium);
    const water = r?.get(F.water);
    if (sodium === undefined || water === undefined || waterG === null) return null;
    return (sodium * (100 - waterG)) / (100 - water);
  };

  // Ingredient records.
  const out: IngredientsFile['ingredients'] = {};
  const deFortified: string[] = [];
  let assumed = 0;
  const flourV = flour.map((f) => (f ? srVector(values.get(f.fdcId)) : null));
  const flourFolicAcid = flour[0] ? (values.get(flour[0].fdcId)?.get(F.folicAcid) ?? null) : null;
  for (const [id, food] of [...used].sort(([a], [b]) => a.localeCompare(b))) {
    let v: NutrientVector;
    let origin: IngredientsFile['ingredients'][string]['origin'] = 'sr';
    let microFdcId: number | null = null;
    let sodiumFdcId: number | null = null;
    let source: string | null = null;
    let description: string;
    let category: number;
    if (food) {
      description = food.description;
      category = food.category;
      const raw = values.get(food.fdcId);
      v = srVector(raw);
      // Micronutrients: the row itself, or its unfortified twin scaled to the row's dry matter (bread crumbs are drier
      // than bread); macronutrients always stay the row's own (the game cards' numbers do not move).
      const twin = twinOf.get(id);
      const microValues = twin ? values.get(twin.fdcId) : raw;
      let scale = 1;
      if (twin) {
        const t = srVector(microValues);
        if (!TWIN_AS_IS.has(food.description))
          scale = (100 - (v.waterG ?? 0)) / (100 - (t.waterG ?? 0));
        for (const key of NUTRIENT_KEYS) {
          if (MACROS.has(key)) continue;
          const value = t[key];
          v[key] = value === null ? null : value * scale;
        }
        origin = 'sr-twin';
        microFdcId = twin.fdcId;
      }
      const folicAcid = (microValues?.get(F.folicAcid) ?? 0) * scale;
      const before = v.ironMg;
      if (folicAcid > 0 && flourV[0] && flourV[1] && flourFolicAcid) {
        // The share of enriched flour in the product, from its folic acid; that share's enrichment is taken out.
        const share = Math.min(1, folicAcid / flourFolicAcid);
        for (const key of ENRICHMENT) {
          const added = (flourV[0][key] ?? 0) - (flourV[1][key] ?? 0);
          if (v[key] !== null) v[key] = Math.max(0, (v[key] ?? 0) - share * added);
        }
        const folateFood = microValues?.get(F.folateFood);
        v.folateUgDfe =
          folateFood !== undefined
            ? folateFood * scale
            : Math.max(0, (v.folateUgDfe ?? 0) - 1.7 * folicAcid);
        if (!twin) origin = 'sr-estimate';
        deFortified.push(
          `${description}${twin ? ` → twin ${twin.fdcId}` : ''}: enriched flour share ${share.toFixed(2)}, iron ${srVector(raw).ironMg?.toFixed(2)} → ${v.ironMg?.toFixed(2)} mg`,
        );
      } else if (twin) {
        deFortified.push(
          `${description} → twin ${twin.fdcId} (iron ${srVector(raw).ironMg?.toFixed(2)} → ${before?.toFixed(2)} mg)`,
        );
      }
      const plain = unsaltedRow.get(description);
      if (plain) {
        v.sodiumMg = unsaltedSodium(plain, v.waterG);
        sodiumFdcId = plain.fdcId;
      }
      assumed += assumedZeros(v, category, description.toLowerCase());
      // The analysed sugars may exceed the carbohydrate by difference (whole milk: lactose 5.05 > 4.80 g); they are a
      // part of it.
      if (v.sugarsG !== null && v.carbsG !== null && v.sugarsG > v.carbsG) v.sugarsG = v.carbsG;
      const s = sugarParts(
        description.toLowerCase(),
        category,
        v.sugarsG,
        raw?.get(F.sucrose) ?? null,
        null,
      );
      v.addedSugarsG = s.added;
      v.freeSugarsG = s.free;
    } else {
      const label = labelFoods[id];
      if (!label) {
        errors.push(`${id}: no label values`);
        continue;
      }
      description = id;
      category = 0;
      origin = 'label';
      source = label.source;
      const analogue = analogues.get(id);
      v = analogue ? srVector(values.get(analogue.fdcId)) : emptyVector();
      microFdcId = analogue?.fdcId ?? null;
      const p = label.per100g;
      const labelFat = p.fatG ?? 0;
      const analogueFat = v.fatG ?? 0;
      for (const key of FAT_BOUND) {
        const value = v[key];
        if (value !== null) v[key] = analogueFat > 0 ? (value * labelFat) / analogueFat : 0;
      }
      v.energyKcal = p.energyKcal ?? null;
      v.proteinG = p.proteinG ?? null;
      v.fatG = p.fatG ?? null;
      v.carbsG = p.carbsG ?? null;
      v.fibreG = p.fibreG ?? null;
      // Plain dairy: all carbohydrate is lactose; kvass: sugars of the fermented bread and the added sugar.
      if (PLAIN_DAIRY.has(id) || id === 'ru:kvass') v.sugarsG = p.carbsG ?? null;
      else if (!analogue) v.sugarsG = null;
      // Water: what the label's dry matter leaves, minus the analogue's ash (minerals, salt).
      const ash = analogue
        ? Math.max(
            0,
            100 -
              ((values.get(analogue.fdcId)?.get(F.water) ?? 0) +
                (values.get(analogue.fdcId)?.get(F.protein) ?? 0) +
                (values.get(analogue.fdcId)?.get(F.fat) ?? 0) +
                (values.get(analogue.fdcId)?.get(F.carbsDiff) ?? 0)),
          )
        : 0;
      v.waterG = Math.max(
        0,
        100 - (v.proteinG ?? 0) - (v.fatG ?? 0) - (v.carbsG ?? 0) - (v.fibreG ?? 0) - ash,
      );
      const plain = analogue ? unsaltedRow.get(analogue.description) : undefined;
      if (plain) {
        v.sodiumMg = unsaltedSodium(plain, v.waterG);
        sodiumFdcId = plain.fdcId;
      }
      const micros = LABEL_MICROS[id];
      if (micros) {
        for (const [key, value] of Object.entries(micros.values) as [NutrientKey, number][])
          v[key] = value;
        source = `${source}; ${micros.source}`;
      }
      assumed += assumedZeros(v, 1, '');
      const s = sugarParts('', 0, v.sugarsG, null, id);
      v.addedSugarsG = PLAIN_DAIRY.has(id) || id === 'ru:mayonnaise-67' ? 0 : s.added;
      v.freeSugarsG = PLAIN_DAIRY.has(id) || id === 'ru:mayonnaise-67' ? 0 : s.free;
    }
    if (!canonical[id])
      errors.push(`${id}: no canonical Russian name («${food?.description ?? id}»)`);
    const ru =
      canonical[id] ??
      nameRu.get(id) ??
      (food ? fallbackNameRu(food.description) : labelFoods[id]?.nameRu) ??
      null;
    if (!ru) errors.push(`${id}: no Russian name («${description}»)`);
    out[id] = {
      description,
      nameRu: ru ?? description,
      category,
      origin,
      microFdcId,
      sodiumFdcId,
      per100g: toArray(v),
      source,
    };
  }
  if (!out[WATER_ID]) {
    // Every batch recipe may use water; the computation needs its row even when no recipe does.
  }

  // Retention factors of every code the mapping can choose.
  const wantedCodes = new Set(
    Object.values(RETENTION_CODES).flatMap((codes) => Object.values(codes)),
  );
  const retention: RetentionFile = {
    version: TODAY,
    source: 'USDA Table of Nutrient Retention Factors, Release 6 (2007), retn06.txt',
    codes: {},
  };
  for (const line of (await readFile(path.join(USDA, 'retn06.txt'), 'utf8')).split(/\r?\n/)) {
    if (!line) continue;
    const [code, , desc, nutr, , factor] = line.split('^').map((s) => s.replace(/~/g, '').trim());
    if (!code || !wantedCodes.has(code) || !nutr || factor === undefined) continue;
    const key = RETN_NUTRIENT[nutr] ?? (nutr === '417' ? 'folateUgDfe' : undefined);
    if (!key) continue;
    const entry = (retention.codes[code] ??= { desc: desc ?? '', factors: {} });
    // Food folate (432) wins over total folate (417) where a code has both.
    if (nutr === '417' && entry.factors.folateUgDfe !== undefined) continue;
    entry.factors[key] = Number(factor);
  }
  for (const code of wantedCodes)
    if (!retention.codes[code]) errors.push(`retention code ${code} is not in retn06.txt`);

  if (errors.length) {
    console.log(`build errors:\n  ${errors.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }

  const ingredientsFile: IngredientsFile = {
    version: TODAY,
    source:
      'USDA FoodData Central SR Legacy (April 2018) + Russian labels (macronutrients) — ADR 0015',
    nutrients: [...NUTRIENT_KEYS],
    ingredients: out,
  };
  const recipesFile: RecipesFile = {
    version: TODAY,
    recipes: Object.fromEntries(Object.entries(recipes).sort(([a], [b]) => a.localeCompare(b))),
  };
  const result = assemble({
    version: TODAY,
    catalog,
    dishText,
    items,
    ingredients: ingredientsFile,
    retention,
    recipes: recipesFile,
    texts,
  });

  const dataDir = path.join(PKG, 'data');
  await mkdir(path.join(dataDir, 'src'), { recursive: true });
  // A rebuild on another day writes the same bytes: a file keeps its date while its content stays the same.
  const write = async (file: string, value: { version: string }, rowsKey: string) => {
    let out = value;
    if (existsSync(file)) {
      const old = JSON.parse(await readFile(file, 'utf8')) as { version: string };
      const blank = (v: object) => JSON.stringify({ ...v, version: '' });
      if (blank(old) === blank(value)) out = { ...value, version: old.version };
    }
    await writeFile(file, stringifyRows(out, rowsKey));
  };
  await write(path.join(dataDir, 'src', 'ingredients.json'), ingredientsFile, 'ingredients');
  await write(path.join(dataDir, 'src', 'retention.json'), retention, 'codes');
  await write(path.join(dataDir, 'src', 'recipes.json'), recipesFile, 'recipes');
  await write(path.join(dataDir, 'food-core.json'), result.core, 'items');
  await write(path.join(dataDir, 'food-text.json'), result.text, 'items');

  // Report.
  const gz = (o: unknown) => gzipSync(JSON.stringify(o)).length;
  const nulls = NUTRIENT_KEYS.map(
    (key, k) => [key, result.core.items.filter((i) => i.n[k] === null).length] as const,
  ).filter(([, n]) => n > 0);
  const codeUse = new Map<string, number>();
  for (const d of result.details)
    for (const c of Object.values(d.codes)) if (c) codeUse.set(c, (codeUse.get(c) ?? 0) + 1);
  const top = (key: NutrientKey) => {
    const k = NUTRIENT_KEYS.indexOf(key);
    return result.core.items
      .map((i) => [i.id, ((i.n[k] ?? 0) * 100) / i.p[0]] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, v]) => `${id} ${v.toFixed(1)}`)
      .join(', ');
  };
  const report = [
    `# Данные блюд меню — отчёт сборки (${TODAY})`,
    '',
    `Позиции: ${result.core.items.length} (игра ${catalog.dishes.length}, меню ${Object.keys(items.menu).length}); ингредиентов ${Object.keys(out).length}; кодов сохранности использовано ${codeUse.size}.`,
    `Чанки (minified gzip): food-core ${(gz(result.core) / 1024).toFixed(1)} КБ, food-text ${(gz(result.text) / 1024).toFixed(1)} КБ.`,
    `Достроено нулей по биологии (клетчатка мяса, B12 растений…): ${assumed}.`,
    '',
    `## Проблемы (${result.problems.length})`,
    ...result.problems.map((p) => `- ${p}`),
    '',
    `## Заметки (${result.notes.length})`,
    ...result.notes.map((p) => `- ${p}`),
    '',
    '## «Нет данных» по нутриентам (позиций с null)',
    nulls.map(([k, n]) => `${k} ${n}`).join(' · '),
    '',
    '## Без американского обогащения',
    ...deFortified.map((d) => `- ${d}`),
    '',
    '## Самые высокие значения на 100 г',
    ...(['ironMg', 'calciumMg', 'vitaminCMg', 'sodiumMg', 'caffeineMg', 'vitaminAUg'] as const).map(
      (k) => `- ${k}: ${top(k)}`,
    ),
    '',
    '## Ингредиенты: самые высокие значения на 100 г (проверка обогащения и ошибок строк)',
    ...(['calciumMg', 'ironMg', 'vitaminDUg', 'vitaminB12Ug', 'folateUgDfe'] as const).map(
      (key) => {
        const k = NUTRIENT_KEYS.indexOf(key);
        const rows = Object.entries(out)
          .map(([id, r]) => [id, r.description.slice(0, 40), r.per100g[k] ?? 0] as const)
          .sort((a, b) => b[2] - a[2])
          .slice(0, 8);
        return `- ${key}: ${rows.map(([, d, v]) => `${d} ${v.toFixed(1)}`).join('; ')}`;
      },
    ),
    '',
    '## Коды сохранности (сколько ингредиентов)',
    [...codeUse]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} ${retention.codes[c]?.desc ?? ''} ×${n}`)
      .join(' · '),
    '',
  ].join('\n');
  await mkdir(path.dirname(REPORT), { recursive: true });
  await writeFile(REPORT, report);
  console.log(
    `items ${result.core.items.length}, ingredients ${Object.keys(out).length}, problems ${result.problems.length}, notes ${result.notes.length}; ` +
      `food-core ${(gz(result.core) / 1024).toFixed(1)} KB gz, food-text ${(gz(result.text) / 1024).toFixed(1)} KB gz; report: ${REPORT}`,
  );
}

await main();
