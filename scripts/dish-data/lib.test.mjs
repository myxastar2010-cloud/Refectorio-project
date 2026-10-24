import { describe, expect, it } from 'vitest';
import {
  byDescription,
  checkDish,
  computeDish,
  parseCsv,
  repairMojibake,
  rounded,
  srLegacyFoods,
} from './lib.mjs';

// Made-up round numbers: these tests check the arithmetic, not food data.
const FOOD_CSV = `"fdc_id","data_type","description","food_category_id","publication_date"
"1","sr_legacy_food","Oats, test","8","2019-04-01"
"2","sr_legacy_food","Oil, test, ""quoted""","4","2019-04-01"
"3","sr_legacy_food","Beef, test, raw","13","2019-04-01"
`;
const NUTRIENT_CSV = `"id","fdc_id","nutrient_id","amount"
"10","1","1008","400"
"11","1","1003","10"
"12","1","1004","5"
"13","1","1005","70"
"14","1","1079","10"
"20","2","1008","900"
"21","2","1003","0"
"22","2","1004","100"
"23","2","1005","0"
"30","3","1008","250"
"31","3","1003","20"
"32","3","1004","20"
"33","3","1005","0"
"34","3","1062","1046"
`;

const foods = srLegacyFoods(FOOD_CSV, NUTRIENT_CSV);
const find = byDescription(foods);
const ingredients = Object.fromEntries([...foods.values()].map((food) => [food.description, food]));
const cooking = {
  frying: { batter: { shallow: { fatGPer100g: 6 }, deep: { fatGPer100g: 5 } } },
  meat: { roast: { fatChangeGPer100gRaw: -5 } },
};

describe('dish nutrition (stage 3, §5.3)', () => {
  it('reads quoted CSV and keeps available carbohydrate (by difference − fibre) with the fibre', () => {
    expect(parseCsv('a,"b ""c""",d\r\n1,2,3\n')).toEqual([
      ['a', 'b "c"', 'd'],
      ['1', '2', '3'],
    ]);
    expect(find('oats,  TEST')?.per100g).toEqual({
      energyKcal: 400,
      proteinG: 10,
      fatG: 5,
      carbsG: 60,
      fibreG: 10,
    });
    expect(find('Oil, test, "quoted"')?.fdcId).toBe(2);
    // Meat lists no fibre: null, counted as none.
    expect(find('Beef, test, raw')?.per100g.fibreG).toBeNull();
  });

  it('sums the ingredients of one portion', () => {
    const dish = computeDish(
      {
        ingredients: [
          { key: 'Oats, test', g: 50 },
          { key: 'Beef, test, raw', g: 100 },
        ],
      },
      { ingredients, cooking },
    );
    expect(rounded(dish)).toEqual({
      energyKcal: 450,
      proteinG: 25,
      fatG: 22.5,
      carbsG: 30,
      fibreG: 5,
    });
  });

  it('adds the frying fat taken up by the fried ingredients and the fat lost by roasted meat', () => {
    const fried = computeDish(
      {
        ingredients: [
          { key: 'Beef, test, raw', g: 200 },
          { key: 'Water', g: 50 },
        ],
        cooking: { frying: { type: 'shallow', category: 'batter', oil: 'Oil, test, "quoted"' } },
      },
      {
        ingredients: {
          ...ingredients,
          Water: { per100g: { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fibreG: 0 } },
        },
        cooking,
      },
    );
    // 6 g per 100 g of the 200 g fried (water is not fried) = 12 g of oil.
    expect(rounded(fried).fatG).toBe(40 + 12);
    expect(rounded(fried).energyKcal).toBe(500 + 108);
    const roast = computeDish(
      {
        ingredients: [{ key: 'Beef, test, raw', g: 200 }],
        cooking: { roastedMeat: { cut: 'Beef, test, raw', row: 'roast' } },
      },
      { ingredients, cooking },
    );
    expect(rounded(roast).fatG).toBe(40 - 10);
    expect(rounded(roast).energyKcal).toBe(500 - 90);
    expect(() =>
      computeDish({ ingredients: [{ key: 'Nope', g: 1 }] }, { ingredients, cooking }),
    ).toThrow(/unknown ingredient/);
  });

  it('checks the energy against 4P + 9F + 4C + 2 fibre and the portion against its course', () => {
    expect(
      checkDish({ energyKcal: 450, proteinG: 25, fatG: 22.5, carbsG: 30, fibreG: 5 }, 250, 'main'),
    ).toEqual([]);
    expect(
      checkDish(
        { energyKcal: 200, proteinG: 25, fatG: 22.5, carbsG: 30, fibreG: 5 },
        250,
        'main',
      )[0],
    ).toMatch(/energy/);
    expect(
      checkDish({ energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fibreG: 0 }, 900, 'soup')[0],
    ).toMatch(/portion/);
  });

  it('repairs UTF-8 read as Windows-1251 and leaves good text alone', () => {
    expect(repairMojibake('СЏР№С†Рѕ')).toBe('яйцо');
    expect(repairMojibake('РјРѕР»РѕРєРѕ 2,5 %')).toBe('молоко 2,5 %');
    expect(repairMojibake('сметана 20 %')).toBe('сметана 20 %');
    expect(repairMojibake('Рис')).toBe('Рис');
  });
});
