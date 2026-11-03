// Recipe pilot (stage 4, 06 §2): the facts both writers get for the 10 pilot items — names, portion, ingredients with
// grams FROM DATA (packages/food-data), cooking methods, flags, the research recipe sources. Writers never change grams.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.resolve(
  APP,
  '..',
  'refectorio-workspace',
  'reports',
  'stage-4',
  'recipe-pilot',
);
const read = (p) => JSON.parse(readFileSync(path.join(APP, p), 'utf8'));

export const PILOT_IDS = [
  'd_borscht', // soup
  'd_kotlety', // red meat, minced
  'd_chicken_sour_cream', // poultry
  'd_baked_salmon', // fish
  'd_chickpea_curry', // vegan main
  'd_syrniki', // breakfast, eggs
  'd_greek_salad', // salad
  'd_cabbage_pie', // baking
  'd_sharlotka', // dessert, eggs
  'd_cranberry_mors', // drink
];

const core = read('packages/food-data/data/food-core.json');
const text = read('packages/food-data/data/food-text.json');
const recipes = read('packages/food-data/data/src/recipes.json').recipes;
const catalog = new Map(read('packages/taste-core/data/catalog.json').dishes.map((d) => [d.id, d]));
const ingredientName = new Map(core.ingredients);

const items = PILOT_IDS.map((id) => {
  const item = core.items.find((i) => i.id === id);
  const recipe = recipes[id];
  if (!item || !recipe) throw new Error(`pilot: ${id} has no food-core item or research recipe`);
  const [nameRu, whatRu, descriptionRu] = text.items[id];
  const taste = catalog.get(id) ?? item.x;
  return {
    itemId: id,
    nameRu,
    portionRu: whatRu,
    descriptionRu,
    role: item.r,
    mealTypes: item.m,
    portion: { grams: item.p[0], ml: item.p[1], pieces: item.p[2] },
    cookMinEstimate: item.t,
    boxable: item.f.includes('boxable'),
    flags: item.f.filter((f) => f !== 'inGame' && f !== 'boxable'),
    allergens: item.a,
    cookingMethods: taste?.cookingMethods ?? [],
    heat: recipe.heat ?? null,
    ingredients: recipe.ingredients.map(([key, grams]) => ({
      key,
      nameRu: ingredientName.get(key) ?? key,
      grams,
    })),
    researchSources: recipe.sources ?? [],
  };
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  path.join(OUT_DIR, 'inputs.json'),
  JSON.stringify({ version: core.version, items }, null, 1) + '\n',
);
console.log(
  `pilot inputs: ${items.length} items → ${path.relative(APP, path.join(OUT_DIR, 'inputs.json'))}`,
);
