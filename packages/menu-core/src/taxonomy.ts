/**
 * Ingredient and item categories with Russian synonyms (ТЗ фаза 3 §4): what «не ем яйца», «меньше молочки», «замени
 * кофе на чай» refer to. Ingredients are classified by their SR Legacy food group (food-core) and Russian name; items
 * inherit their ingredients' categories. Kiki resolves words through `resolveTerms` and never invents ids.
 */
import { normalize, stem, tokenize, withinOneEdit } from './text';

export const CATEGORY_IDS = [
  'meat',
  'redMeat',
  'beef',
  'pork',
  'lamb',
  'poultry',
  'chicken',
  'turkey',
  'duck',
  'processedMeat',
  'liver',
  'meatBroth',
  'fish',
  'oilyFish',
  'tuna',
  'seafood',
  'shrimp',
  'eggs',
  'dairy',
  'milk',
  'fermentedDairy',
  'cheese',
  'agedCheese',
  'tvorog',
  'sourCream',
  'cream',
  'butter',
  'vegetables',
  'leafyGreens',
  'herbs',
  'garlic',
  'onion',
  'tomatoes',
  'cucumbers',
  'cabbage',
  'mushrooms',
  'potatoes',
  'carrots',
  'beets',
  'peppers',
  'pumpkin',
  'eggplant',
  'zucchini',
  'legumes',
  'soy',
  'peanuts',
  'nuts',
  'seeds',
  'fruit',
  'berries',
  'citrus',
  'apples',
  'bananas',
  'driedFruit',
  'juice',
  'grains',
  'wholeGrain',
  'rice',
  'buckwheat',
  'millet',
  'oats',
  'semolina',
  'barley',
  'bulgur',
  'pasta',
  'noodles',
  'bread',
  'flour',
  'sweets',
  'sugar',
  'honey',
  'chocolate',
  'coffee',
  'tea',
  'herbalTea',
  'cocoa',
  'alcohol',
  'mayonnaise',
  'oils',
  'sauces',
  'spicy',
  'pickles',
  'highTyramine',
  // Item-level categories (from the role, flags and features of a dish).
  'soup',
  'salad',
  'porridge',
  'dessert',
  'baking',
  'fried',
  'drink',
  'side',
  'snackItem',
  'lunchBox',
  'quick',
  'vegetarian',
  'vegan',
  'highProtein',
  'glutenFree',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

type CategoryDef = {
  readonly labelRu: string;
  readonly parents?: readonly CategoryId[];
  /** Russian words and phrases (any form: they are normalised and stemmed on load). */
  readonly synonyms: readonly string[];
};

export const CATEGORIES: Readonly<Record<CategoryId, CategoryDef>> = {
  meat: { labelRu: 'мясо', synonyms: ['мясо', 'мясное', 'мясные блюда'] },
  redMeat: { labelRu: 'красное мясо', parents: ['meat'], synonyms: ['красное мясо'] },
  beef: {
    labelRu: 'говядина',
    parents: ['redMeat'],
    synonyms: ['говядина', 'говяжий', 'телятина'],
  },
  pork: { labelRu: 'свинина', parents: ['redMeat'], synonyms: ['свинина', 'свиной', 'свиные'] },
  lamb: {
    labelRu: 'баранина',
    parents: ['redMeat'],
    synonyms: ['баранина', 'бараний', 'ягнятина'],
  },
  poultry: { labelRu: 'птица', parents: ['meat'], synonyms: ['птица', 'мясо птицы'] },
  chicken: {
    labelRu: 'курица',
    parents: ['poultry'],
    synonyms: ['курица', 'куриный', 'курятина', 'куры'],
  },
  turkey: { labelRu: 'индейка', parents: ['poultry'], synonyms: ['индейка', 'индюшатина'] },
  duck: { labelRu: 'утка', parents: ['poultry'], synonyms: ['утка', 'утиный'] },
  processedMeat: {
    labelRu: 'колбасы и копчёности',
    parents: ['meat'],
    synonyms: [
      'колбаса',
      'сосиски',
      'сардельки',
      'ветчина',
      'бекон',
      'копчености',
      'полуфабрикаты мясные',
    ],
  },
  liver: { labelRu: 'печень', parents: ['meat'], synonyms: ['печень', 'печенка', 'субпродукты'] },
  meatBroth: { labelRu: 'мясной бульон', synonyms: ['мясной бульон', 'бульон'] },
  fish: { labelRu: 'рыба', synonyms: ['рыба', 'рыбный', 'рыбные блюда'] },
  oilyFish: {
    labelRu: 'жирная рыба',
    parents: ['fish'],
    synonyms: ['жирная рыба', 'красная рыба'],
  },
  tuna: { labelRu: 'тунец', parents: ['fish'], synonyms: ['тунец'] },
  seafood: {
    labelRu: 'морепродукты',
    synonyms: ['морепродукты', 'моллюски', 'мидии', 'кальмары', 'осьминог', 'краб'],
  },
  shrimp: { labelRu: 'креветки', parents: ['seafood'], synonyms: ['креветки'] },
  eggs: { labelRu: 'яйца', synonyms: ['яйца', 'яйцо', 'яичный', 'яичница'] },
  dairy: {
    labelRu: 'молочные продукты',
    synonyms: ['молочка', 'молочное', 'молочные продукты', 'молочные'],
  },
  milk: { labelRu: 'молоко', parents: ['dairy'], synonyms: ['молоко', 'сгущенка'] },
  fermentedDairy: {
    labelRu: 'кисломолочное',
    parents: ['dairy'],
    synonyms: ['кисломолочное', 'кефир', 'ряженка', 'йогурт', 'простокваша'],
  },
  cheese: { labelRu: 'сыр', parents: ['dairy'], synonyms: ['сыр', 'сыры', 'сырный'] },
  agedCheese: {
    labelRu: 'выдержанные сыры',
    parents: ['cheese'],
    synonyms: ['твердый сыр', 'пармезан'],
  },
  tvorog: { labelRu: 'творог', parents: ['dairy'], synonyms: ['творог', 'творожный'] },
  sourCream: { labelRu: 'сметана', parents: ['dairy'], synonyms: ['сметана'] },
  cream: { labelRu: 'сливки', parents: ['dairy'], synonyms: ['сливки'] },
  butter: { labelRu: 'сливочное масло', parents: ['dairy'], synonyms: ['сливочное масло'] },
  vegetables: { labelRu: 'овощи', synonyms: ['овощи', 'овощной'] },
  leafyGreens: {
    labelRu: 'листовая зелень',
    parents: ['vegetables'],
    synonyms: ['листовая зелень', 'салатные листья', 'шпинат', 'руккола', 'листья салата'],
  },
  herbs: {
    labelRu: 'зелень и травы',
    synonyms: ['зелень', 'травы', 'укроп', 'петрушка', 'кинза', 'кориандр', 'базилик', 'мята'],
  },
  garlic: { labelRu: 'чеснок', synonyms: ['чеснок', 'чесночный'] },
  onion: { labelRu: 'лук', parents: ['vegetables'], synonyms: ['лук', 'луковый'] },
  tomatoes: {
    labelRu: 'помидоры',
    parents: ['vegetables'],
    synonyms: ['помидоры', 'томаты', 'томатный'],
  },
  cucumbers: { labelRu: 'огурцы', parents: ['vegetables'], synonyms: ['огурцы', 'огурец'] },
  cabbage: { labelRu: 'капуста', parents: ['vegetables'], synonyms: ['капуста', 'капустный'] },
  mushrooms: {
    labelRu: 'грибы',
    parents: ['vegetables'],
    synonyms: ['грибы', 'грибной', 'шампиньоны'],
  },
  potatoes: { labelRu: 'картофель', synonyms: ['картофель', 'картошка', 'картофельный'] },
  carrots: { labelRu: 'морковь', parents: ['vegetables'], synonyms: ['морковь', 'морковка'] },
  beets: { labelRu: 'свёкла', parents: ['vegetables'], synonyms: ['свекла', 'свекольный'] },
  peppers: { labelRu: 'перец', parents: ['vegetables'], synonyms: ['перец', 'болгарский перец'] },
  pumpkin: { labelRu: 'тыква', parents: ['vegetables'], synonyms: ['тыква', 'тыквенный'] },
  eggplant: { labelRu: 'баклажаны', parents: ['vegetables'], synonyms: ['баклажаны', 'баклажан'] },
  zucchini: {
    labelRu: 'кабачки',
    parents: ['vegetables'],
    synonyms: ['кабачки', 'кабачок', 'цукини'],
  },
  legumes: {
    labelRu: 'бобовые',
    synonyms: ['бобовые', 'фасоль', 'чечевица', 'нут', 'горох', 'бобы'],
  },
  soy: { labelRu: 'соя', synonyms: ['соя', 'соевый', 'тофу'] },
  peanuts: { labelRu: 'арахис', parents: ['nuts'], synonyms: ['арахис', 'арахисовый'] },
  nuts: { labelRu: 'орехи', synonyms: ['орехи', 'ореховый', 'грецкие орехи', 'миндаль', 'кешью'] },
  seeds: { labelRu: 'семечки', synonyms: ['семечки', 'семена', 'кунжут'] },
  fruit: { labelRu: 'фрукты', synonyms: ['фрукты', 'фруктовый'] },
  berries: { labelRu: 'ягоды', parents: ['fruit'], synonyms: ['ягоды', 'ягодный'] },
  citrus: {
    labelRu: 'цитрусовые',
    parents: ['fruit'],
    synonyms: ['цитрусовые', 'апельсины', 'мандарины', 'лимон'],
  },
  apples: { labelRu: 'яблоки', parents: ['fruit'], synonyms: ['яблоки', 'яблочный'] },
  bananas: { labelRu: 'бананы', parents: ['fruit'], synonyms: ['бананы', 'банан'] },
  driedFruit: {
    labelRu: 'сухофрукты',
    parents: ['fruit'],
    synonyms: ['сухофрукты', 'курага', 'чернослив', 'изюм'],
  },
  juice: { labelRu: 'соки', synonyms: ['сок', 'соки'] },
  grains: { labelRu: 'крупы и злаки', synonyms: ['крупы', 'злаки', 'каши'] },
  wholeGrain: {
    labelRu: 'цельные злаки',
    parents: ['grains'],
    synonyms: ['цельнозерновое', 'цельные злаки', 'цельнозерновые'],
  },
  rice: { labelRu: 'рис', parents: ['grains'], synonyms: ['рис', 'рисовый'] },
  buckwheat: { labelRu: 'гречка', parents: ['grains'], synonyms: ['гречка', 'греча', 'гречневый'] },
  millet: { labelRu: 'пшено', parents: ['grains'], synonyms: ['пшено', 'пшенка', 'пшенный'] },
  oats: {
    labelRu: 'овсянка',
    parents: ['grains'],
    synonyms: ['овсянка', 'овес', 'овсяный', 'геркулес'],
  },
  semolina: { labelRu: 'манка', parents: ['grains'], synonyms: ['манка', 'манный'] },
  barley: {
    labelRu: 'перловка',
    parents: ['grains'],
    synonyms: ['перловка', 'перловый', 'ячмень'],
  },
  bulgur: { labelRu: 'булгур', parents: ['grains'], synonyms: ['булгур'] },
  pasta: { labelRu: 'макароны', parents: ['grains'], synonyms: ['макароны', 'паста', 'спагетти'] },
  noodles: { labelRu: 'лапша', parents: ['grains'], synonyms: ['лапша'] },
  bread: { labelRu: 'хлеб', parents: ['grains'], synonyms: ['хлеб', 'хлебный', 'батон', 'лаваш'] },
  flour: { labelRu: 'мучное', synonyms: ['мучное', 'мука', 'тесто'] },
  sweets: {
    labelRu: 'сладкое',
    synonyms: ['сладкое', 'сладости', 'сахар', 'конфеты', 'выпечка сладкая'],
  },
  sugar: { labelRu: 'сахар', parents: ['sweets'], synonyms: ['сахар'] },
  honey: { labelRu: 'мёд', parents: ['sweets'], synonyms: ['мед', 'медовый'] },
  chocolate: {
    labelRu: 'шоколад',
    parents: ['sweets'],
    synonyms: ['шоколад', 'шоколадный', 'какао'],
  },
  coffee: {
    labelRu: 'кофе',
    synonyms: ['кофе', 'кофейный', 'капучино', 'латте', 'эспрессо', 'американо'],
  },
  tea: { labelRu: 'чай', synonyms: ['чай', 'черный чай', 'зеленый чай'] },
  herbalTea: { labelRu: 'травяной чай', synonyms: ['травяной чай', 'травяные чаи'] },
  cocoa: { labelRu: 'какао', synonyms: ['какао'] },
  alcohol: { labelRu: 'алкоголь', synonyms: ['алкоголь', 'вино', 'пиво', 'спиртное'] },
  mayonnaise: { labelRu: 'майонез', synonyms: ['майонез'] },
  oils: { labelRu: 'масло растительное', synonyms: ['растительное масло', 'подсолнечное масло'] },
  sauces: { labelRu: 'соусы', synonyms: ['соусы', 'соус'] },
  spicy: { labelRu: 'острое', synonyms: ['острое', 'острый', 'остренькое', 'перченое'] },
  pickles: { labelRu: 'соленья', synonyms: ['соленья', 'соленые огурцы', 'маринованное'] },
  highTyramine: { labelRu: 'продукты с тирамином', synonyms: [] },
  soup: { labelRu: 'супы', synonyms: ['суп', 'супы', 'первое', 'борщ', 'щи'] },
  salad: { labelRu: 'салаты', synonyms: ['салат', 'салаты'] },
  porridge: { labelRu: 'каши', parents: ['grains'], synonyms: ['каша', 'каши'] },
  dessert: {
    labelRu: 'десерты',
    parents: ['sweets'],
    synonyms: ['десерт', 'десерты', 'торт', 'пирожное'],
  },
  baking: {
    labelRu: 'выпечка',
    parents: ['flour'],
    synonyms: ['выпечка', 'пироги', 'пирожки', 'булочки'],
  },
  fried: { labelRu: 'жареное', synonyms: ['жареное', 'жареный', 'фритюр'] },
  drink: { labelRu: 'напитки', synonyms: ['напитки', 'напиток'] },
  side: { labelRu: 'гарниры', synonyms: ['гарнир', 'гарниры'] },
  snackItem: { labelRu: 'перекусы', synonyms: ['перекус', 'закуски'] },
  lunchBox: {
    labelRu: 'ланч-бокс',
    synonyms: ['ланч бокс', 'ланчбокс', 'в контейнер', 'на работу'],
  },
  quick: { labelRu: 'быстро', synonyms: ['быстро', 'быстрое', 'на скорую руку'] },
  vegetarian: {
    labelRu: 'вегетарианское',
    synonyms: ['вегетарианское', 'вегетарианский', 'без мяса'],
  },
  vegan: { labelRu: 'веганское', synonyms: ['веганское', 'веганский', 'постное'] },
  highProtein: {
    labelRu: 'высокобелковое',
    synonyms: ['высокобелковое', 'белковое', 'протеиновое'],
  },
  glutenFree: { labelRu: 'без глютена', synonyms: ['без глютена', 'безглютеновое'] },
};

/** Every ancestor of a category, the category included. */
export function withAncestors(id: CategoryId): CategoryId[] {
  const out: CategoryId[] = [];
  const visit = (c: CategoryId) => {
    if (out.includes(c)) return;
    out.push(c);
    for (const parent of CATEGORIES[c].parents ?? []) visit(parent);
  };
  visit(id);
  return out;
}

type IngredientFacts = { readonly nameRu: string; readonly group: number };

/** SR Legacy food groups (food_category_id) the rules below rely on. */
const G = {
  label: 0,
  dairyEgg: 1,
  spices: 2,
  fats: 4,
  poultry: 5,
  soupsSauces: 6,
  sausages: 7,
  cereals: 8,
  fruits: 9,
  pork: 10,
  vegetables: 11,
  nuts: 12,
  beef: 13,
  beverages: 14,
  fish: 15,
  legumes: 16,
  lamb: 17,
  baked: 18,
  sweets: 19,
  grains: 20,
} as const;

const has = (name: string, re: RegExp) => re.test(name);

/** Categories of one ingredient (its ancestors not included). */
export function ingredientCategories({ nameRu, group }: IngredientFacts): CategoryId[] {
  const n = normalize(nameRu);
  const out = new Set<CategoryId>();
  const add = (...ids: CategoryId[]) => {
    for (const id of ids) out.add(id);
  };
  const broth = has(n, /бульон/);
  if (broth) add('meatBroth');

  switch (group) {
    case G.poultry:
      add(has(n, /индей/) ? 'turkey' : has(n, /утк/) ? 'duck' : 'chicken');
      break;
    case G.sausages:
      add('processedMeat');
      break;
    case G.pork:
      add('pork');
      if (has(n, /бекон|соленое сало/)) add('processedMeat');
      break;
    case G.beef:
      add('beef');
      if (has(n, /печен/)) add('liver');
      break;
    case G.lamb:
      add('lamb');
      break;
    case G.fish:
      if (has(n, /кревет/)) add('shrimp');
      else if (has(n, /мид|кальмар|осьминог|крабовое мясо/)) add('seafood');
      else add('fish');
      if (has(n, /лосос|форел|скумбр|сельд|сардин|тунец, стейк|тунец стейк/)) add('oilyFish');
      if (has(n, /тунец/)) add('tuna');
      if (has(n, /сельдь соленая/)) add('pickles', 'highTyramine');
      break;
    case G.dairyEgg:
    case G.label:
      if (has(n, /яйц|яичн/)) add('eggs');
      else if (has(n, /кефир|ряжен|йогурт|простокваш/)) add('fermentedDairy');
      else if (has(n, /творог/)) add('tvorog');
      else if (has(n, /сметан/)) add('sourCream');
      else if (has(n, /сливочное масло|гхи/)) add('butter');
      else if (has(n, /сливочный сыр|сыр|моцарел|пармезан|рикотт|фета|маскарпоне/)) {
        add('cheese');
        if (has(n, /пармезан|твердый сыр|грюйер/)) add('agedCheese', 'highTyramine');
      } else if (has(n, /сливки/)) add('cream');
      else if (has(n, /молоко/)) add('milk');
      else if (has(n, /майонез/)) add('mayonnaise');
      else if (has(n, /квас/)) add('drink');
      else if (has(n, /кочуджан/)) add('sauces', 'spicy', 'soy', 'highTyramine');
      if (has(n, /сгущ/)) add('sweets');
      break;
    case G.spices:
      if (has(n, /чеснок|чесноч/)) add('garlic');
      else if (has(n, /укроп|петрушк|кинз|базилик|мят|розмарин|орегано|тимьян/)) add('herbs');
      else if (has(n, /каперс/)) add('pickles');
      else if (has(n, /горчиц/)) add('sauces');
      if (has(n, /перец красный|чили/)) add('spicy');
      break;
    case G.fats:
      add(has(n, /майонез/) ? 'mayonnaise' : 'oils');
      break;
    case G.soupsSauces:
      if (broth) add(has(n, /куриный/) ? 'chicken' : has(n, /говяж/) ? 'beef' : 'meat');
      else add('sauces');
      if (has(n, /рыбный соус/)) add('fish', 'highTyramine');
      if (has(n, /томат|сальса/)) add('tomatoes');
      if (has(n, /хойсин/)) add('soy');
      if (has(n, /остр/)) add('spicy');
      break;
    case G.cereals:
      add('oats', 'wholeGrain');
      break;
    case G.fruits:
      if (has(n, /лимонный сок|сок лайма|тамаринд/)) add('sauces');
      else if (has(n, /маслин|олив/)) add('pickles');
      else if (has(n, /сок/)) add('juice');
      else {
        add('fruit');
        if (has(n, /клубник|голубик|клюкв|вишн|смородин|малин|черник|брусник/)) add('berries');
        if (has(n, /апельсин|мандарин|лимон|грейпфрут/)) add('citrus');
        if (has(n, /яблок/)) add('apples');
        if (has(n, /банан/)) add('bananas');
        if (has(n, /чернослив|изюм|кураг|сушен/)) add('driedFruit');
      }
      break;
    case G.vegetables:
      if (has(n, /картоф/)) add('potatoes');
      else if (has(n, /кетчуп/)) add('sauces', 'tomatoes');
      else if (has(n, /эдамаме/)) add('legumes', 'soy');
      else {
        add('vegetables');
        if (has(n, /шпинат|салат|руккол|виноградные листья|щавел/)) add('leafyGreens');
        if (has(n, /кинза|зеленый лук|укроп|петрушк/)) add('herbs');
        if (has(n, /^лук|лук репчатый|лук-порей|порей/)) add('onion');
        if (has(n, /чеснок/)) add('garlic');
        if (has(n, /помидор|томат/)) add('tomatoes');
        if (has(n, /огур/)) add('cucumbers');
        if (has(n, /капуст/)) add('cabbage');
        if (has(n, /гриб|вешенк|шампинь|шиитаке/)) add('mushrooms');
        if (has(n, /морков/)) add('carrots');
        if (has(n, /свекл/)) add('beets');
        if (has(n, /перец|халапеньо/)) add('peppers');
        if (has(n, /халапеньо/)) add('spicy');
        if (has(n, /тыкв/)) add('pumpkin');
        if (has(n, /баклажан/)) add('eggplant');
        if (has(n, /кабач|цукини/)) add('zucchini');
        if (has(n, /соевые|ростки сои/)) add('soy');
        if (has(n, /соленые огурцы|маринован/)) add('pickles');
        if (has(n, /квашеная/)) add('pickles', 'highTyramine');
      }
      break;
    case G.nuts:
      if (has(n, /кунжут|семечк|тахини|семена/)) add('seeds');
      else if (!has(n, /кокос/)) add('nuts');
      break;
    case G.beverages:
      if (has(n, /кофе/)) add('coffee');
      else if (has(n, /травян/)) add('herbalTea');
      else if (has(n, /чай/)) add('tea');
      else if (has(n, /вино|пиво|мирин/)) add('alcohol');
      break;
    case G.legumes:
      if (has(n, /арахис/)) add('peanuts');
      else if (has(n, /соевый соус|мисо/)) add('soy', 'sauces', 'highTyramine');
      else if (has(n, /соевое молоко/)) add('soy');
      else {
        add('legumes');
        if (has(n, /тофу|соев/)) add('soy');
      }
      break;
    case G.baked:
      if (has(n, /разрыхлител|сода|дрожж/)) break;
      add(has(n, /печенье|слоеное тесто/) ? 'flour' : 'bread');
      if (has(n, /цельнозерн/)) add('wholeGrain');
      break;
    case G.sweets:
      if (has(n, /желатин/)) break;
      if (has(n, /мед/)) add('honey');
      else if (has(n, /шоколад/)) add('chocolate');
      else if (has(n, /какао/)) add('cocoa', 'chocolate');
      else add('sugar');
      break;
    case G.grains:
      if (has(n, /рис/) && !has(n, /рисовая лапша/)) add('rice');
      if (has(n, /гречн/)) add('buckwheat');
      if (has(n, /пшено/)) add('millet');
      if (has(n, /манн/)) add('semolina');
      if (has(n, /перлов/)) add('barley');
      if (has(n, /булгур/)) add('bulgur');
      if (has(n, /макарон/)) add('pasta');
      if (has(n, /лапша/)) add('noodles');
      if (has(n, /мука|крахмал/)) add('flour');
      if (has(n, /кус-кус|кускус/)) add('grains');
      if (has(n, /бурый|гречн|пшено|булгур|цельнозерн|кукуруза/)) add('wholeGrain');
      if (out.size === 0) add('grains');
      break;
    default:
      break;
  }
  return [...out].sort();
}

/** Ingredients with no category on purpose: water, salt, leavening, gelatine, vinegar, ground spices, coconut milk. */
export const UNCATEGORISED_INGREDIENTS =
  /^(вода|соль|разрыхлитель|сода|свежие дрожжи|сухие дрожжи|желатин|уксус( \d+)?|винный уксус|бальзамический уксус|ванильный экстракт|кокосовое молоко|паста тамаринда)$|молот|порошок|зира|карри|мускатный|куркума|имбирь|кукурузные чипсы/;

export type TermMatch = {
  readonly kind: 'category' | 'ingredient' | 'item';
  /** A category id, an ingredient id (food-core) or an item id. */
  readonly id: string;
  /** 1 — exact phrase; 0.8 — the same stems; 0.6 — one typo. */
  readonly confidence: number;
  readonly start: number;
  readonly end: number;
};

type Phrase = {
  readonly kind: TermMatch['kind'];
  readonly id: string;
  readonly words: readonly string[];
  readonly stems: readonly string[];
};

/** Ingredient and item names that terms may also refer to («аллергия на киви» → the kiwi). */
export type TermVocabulary = {
  readonly ingredients: readonly { readonly id: string; readonly nameRu: string }[];
  readonly items: readonly { readonly id: string; readonly nameRu: string }[];
};

const KIND_ORDER: Readonly<Record<TermMatch['kind'], number>> = {
  category: 0,
  ingredient: 1,
  item: 2,
};

function buildPhrases(vocabulary?: TermVocabulary): Phrase[] {
  const out: Phrase[] = [];
  const push = (kind: Phrase['kind'], id: string, text: string) => {
    // Numbers and units in names («молоко 2,5 %») are not part of what people call a food.
    const tokens = tokenize(text).filter((t) => /^[а-я]+$/.test(t.word));
    if (tokens.length > 0)
      out.push({ kind, id, words: tokens.map((t) => t.word), stems: tokens.map((t) => t.stem) });
  };
  for (const id of CATEGORY_IDS) {
    const def = CATEGORIES[id];
    for (const synonym of [def.labelRu, ...def.synonyms]) push('category', id, synonym);
  }
  for (const ingredient of vocabulary?.ingredients ?? [])
    push('ingredient', ingredient.id, ingredient.nameRu);
  for (const item of vocabulary?.items ?? []) push('item', item.id, item.nameRu);
  // Longer phrases first («красное мясо» wins over «мясо»); then categories before ingredients before items.
  out.sort((a, b) => b.stems.length - a.stems.length || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return out;
}

const stemsMatch = (a: string, b: string, typo: boolean) =>
  a === b || (typo && a.length >= 5 && b.length >= 5 && withinOneEdit(a, b));

export type TermResolver = (text: string) => TermMatch[];

/**
 * Words of a request → categories, ingredients and items with confidence and the matched span («не ем молочку и
 * пшёнку» → dairy, millet). Longest phrases win; a word is used by one match only; exact stems before typos.
 */
export function createTermResolver(vocabulary?: TermVocabulary): TermResolver {
  const phraseList = buildPhrases(vocabulary);
  return (text) => matchPhrases(phraseList, text);
}

let categoryResolver: TermResolver | null = null;
/** Categories only (no food data needed). */
export const resolveTerms: TermResolver = (text) => {
  categoryResolver ??= createTermResolver();
  return categoryResolver(text);
};

function matchPhrases(phraseList: readonly Phrase[], text: string): TermMatch[] {
  const tokens = tokenize(text);
  const used = new Array<boolean>(tokens.length).fill(false);
  const out: TermMatch[] = [];
  for (const pass of [false, true]) {
    for (const phrase of phraseList) {
      const n = phrase.stems.length;
      for (let i = 0; i + n <= tokens.length; i += 1) {
        let fits = true;
        let exact = true;
        for (let k = 0; k < n; k += 1) {
          const token = tokens[i + k];
          const want = phrase.stems[k] ?? '';
          if (!token || used[i + k] || !stemsMatch(token.stem, want, pass)) {
            fits = false;
            break;
          }
          if (token.stem !== want) exact = false;
        }
        if (!fits) continue;
        const first = tokens[i];
        const last = tokens[i + n - 1];
        if (!first || !last) continue;
        for (let k = 0; k < n; k += 1) used[i + k] = true;
        const sameWords = phrase.words.every((w, k) => tokens[i + k]?.word === w);
        out.push({
          kind: phrase.kind,
          id: phrase.id,
          confidence: !exact ? 0.6 : sameWords ? 1 : 0.8,
          start: first.start,
          end: last.end,
        });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Words that carry no food meaning in «не люблю…», «аллергия на…». */
const STOP_STEMS = new Set(
  [
    'не',
    'ни',
    'и',
    'или',
    'а',
    'но',
    'я',
    'мне',
    'меня',
    'мы',
    'нам',
    'люблю',
    'любим',
    'ем',
    'едим',
    'кушаю',
    'терпеть',
    'могу',
    'нельзя',
    'без',
    'с',
    'со',
    'на',
    'в',
    'во',
    'у',
    'к',
    'по',
    'от',
    'из',
    'очень',
    'совсем',
    'вообще',
    'никогда',
    'аллергия',
    'непереносимость',
    'что',
    'это',
    'все',
    'кроме',
    'особенно',
    'пожалуйста',
    'хочу',
    'нравится',
    'употребляю',
    'переношу',
    'блюда',
    'еда',
    'продукты',
    'любой',
    'любые',
    'виде',
    'сильная',
    'лёгкая',
    'реакция',
    'на',
    'нет',
    'да',
    'тоже',
    'также',
    'еще',
    'много',
    'мало',
    'всякие',
    'разные',
  ].map(stem),
);

/** Words of the text that no match covers and that are not stop words: the part Kiki should ask about. */
export function unmatchedWords(text: string, matches: readonly TermMatch[]): string[] {
  return tokenize(text)
    .filter((t) => /^[а-я]+$/.test(t.word) && t.word.length > 1)
    .filter((t) => !matches.some((m) => t.start >= m.start && t.end <= m.end))
    .filter((t) => !STOP_STEMS.has(t.stem))
    .map((t) => t.word);
}
