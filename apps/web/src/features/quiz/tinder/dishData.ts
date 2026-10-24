import { dishNumbersSchema, dishTextSchema, type Dish } from '@refectorio/taste-core';
import numbersJson from '@refectorio/taste-core/data/dish-numbers.json';
import { quiz } from '../../../content/quiz.ru';

/**
 * The dish info of a game card (stage 3, §5). The numbers (≈ 3 KB gz) come with the game — loadQuiz fetches them as a
 * chunk of their own; the descriptions are a second chunk, fetched on idle after the first card.
 */
// Checked by the data's own tests; a broken file shows no numbers rather than breaking the game.
const numbers = dishNumbersSchema.safeParse(numbersJson).data?.dishes ?? {};

export type DishNumbers = {
  readonly energyKcal: number;
  readonly proteinG: number;
  readonly fatG: number;
  readonly carbsG: number;
};

export function numbersFor(dishId: string): DishNumbers | null {
  const row = numbers[dishId];
  if (!row) return null;
  const [energyKcal, proteinG, fatG, carbsG] = row;
  return { energyKcal, proteinG, fatG, carbsG };
}

export type DishText = { readonly long: string; readonly short: string };
export type DishTexts = Readonly<Record<string, DishText>>;

let texts: Promise<DishTexts> | null = null;

/** The descriptions chunk (once; a failed fetch may be tried again). */
export function loadDishTexts(): Promise<DishTexts> {
  texts ??= import('@refectorio/taste-core/data/dish-text.json').then(
    (module) => {
      const file = dishTextSchema.parse(module.default);
      return Object.fromEntries(
        Object.entries(file.dishes).map(([id, [long, short]]) => [id, { long, short }]),
      );
    },
    (error: unknown) => {
      texts = null;
      throw error;
    },
  );
  return texts;
}

const NBSP = ' ';
const kcalFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const gramsFormat = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** «197 ккал» — an integer with a no-break space. */
export const formatEnergy = (kcal: number) =>
  `${kcalFormat.format(Math.round(kcal))}${NBSP}${quiz.taste.info.kcal}`;

/** «8,4 г», «0 г» for none. */
export const formatGrams = (grams: number) =>
  `${grams === 0 ? '0' : gramsFormat.format(grams)}${NBSP}${quiz.taste.info.grams}`;

/**
 * The cuisine line for dishes less familiar in Russia (familiarityRu below this, D-056); «Европейская кухня» says too
 * little and is never shown.
 */
export const CUISINE_FAMILIARITY_BELOW = 0.7;

export function cuisineLine(dish: Dish): string | null {
  if (dish.cuisine === 'european' || dish.traits.familiarityRu >= CUISINE_FAMILIARITY_BELOW) {
    return null;
  }
  return quiz.taste.info.cuisines[dish.cuisine];
}
