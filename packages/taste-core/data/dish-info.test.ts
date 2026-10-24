import { describe, expect, it } from 'vitest';
import { catalogSchema } from '../src/catalog';
import { dishNumbersSchema, dishTextSchema } from '../src/dishInfo';
import catalogJson from './catalog.json';
import numbersJson from './dish-numbers.json';
import textJson from './dish-text.json';

const ids = catalogSchema.parse(catalogJson).dishes.map((dish) => dish.id);
const texts = dishTextSchema.parse(textJson).dishes;
const numbers = dishNumbersSchema.parse(numbersJson).dishes;

describe('dish info of the game cards (stage 3, §5)', () => {
  it('every dish of the catalog has both descriptions, and no other dish has one', () => {
    expect(Object.keys(texts).sort()).toEqual([...ids].sort());
  });

  it('a description continues the name: lower case, a whole sentence, no numbers, no advice', () => {
    for (const [id, [long, short]] of Object.entries(texts)) {
      for (const text of [long, short]) {
        expect(text, id).toMatch(/^\p{Ll}/u);
        expect(text, id).toMatch(/\.$/);
        expect(text, id).not.toMatch(/полезн|похуде|диет|калори|витамин|здоров/iu);
      }
      expect(short.length, id).toBeLessThan(long.length);
    }
  });

  it('numbers belong to dishes of the catalog', () => {
    for (const id of Object.keys(numbers)) expect(ids).toContain(id);
  });
});
