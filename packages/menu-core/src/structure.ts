/**
 * Meals of a day: their titles, energy shares (R17 E17, normalised over the meals that exist), clock hours (R17 E14,
 * for the caffeine cut-off) and the minimum-meals check (R17 E16).
 */
import { rule } from './rules';
import { err, ok, type Meal, type MealKind, type Result } from './types';

const MAIN_KINDS: readonly MealKind[] = ['breakfast', 'lunch', 'dinner'];
const TITLES: Readonly<Record<Exclude<MealKind, 'snack'>, string>> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
};

export const isMainMeal = (kind: MealKind): boolean => kind !== 'snack';

/** Ids and titles from the kinds in day order: snacks are numbered when there are several. */
export function structureFromKinds(kinds: readonly MealKind[]): Meal[] {
  const snacks = kinds.filter((k) => k === 'snack').length;
  let snackNo = 0;
  return kinds.map((kind, order) => {
    if (kind !== 'snack') return { id: kind, kind, titleRu: TITLES[kind], order };
    snackNo += 1;
    return {
      id: `snack-${snackNo}`,
      kind,
      titleRu: snacks > 1 ? `Перекус ${snackNo}` : 'Перекус',
      order,
    };
  });
}

/** Breakfast, lunch, an afternoon snack, dinner — the R17 E17 distribution (25 / 35 / 15 / 25 %). */
export const DEFAULT_STRUCTURE: readonly Meal[] = structureFromKinds([
  'breakfast',
  'lunch',
  'snack',
  'dinner',
]);

/** Energy share of each meal: R17 E17 (snacks share 15 % equally), normalised to the meals present. */
export function mealShares(structure: readonly Meal[]): ReadonlyMap<string, number> {
  const snacks = structure.filter((m) => m.kind === 'snack').length;
  const raw = structure.map((m): [string, number] => {
    if (m.kind === 'snack') return [m.id, rule('E17.share.snacks') / snacks];
    return [m.id, rule(`E17.share.${m.kind}`)];
  });
  const total = raw.reduce((sum, [, v]) => sum + v, 0);
  return new Map(raw.map(([id, v]) => [id, v / total]));
}

/** Clock hours: main meals at their R17 E14 hours; a snack halfway between its neighbours (or 3 h after the last). */
export function mealHours(structure: readonly Meal[]): ReadonlyMap<string, number> {
  const ordered = [...structure].sort((a, b) => a.order - b.order);
  const fixed = ordered.map((m) => (m.kind === 'snack' ? null : rule(`E14.mealHour.${m.kind}`)));
  const hours = new Map<string, number>();
  ordered.forEach((m, i) => {
    const own = fixed[i];
    if (own !== null && own !== undefined) {
      hours.set(m.id, own);
      return;
    }
    const before = fixed
      .slice(0, i)
      .filter((h): h is number => h !== null)
      .at(-1);
    const after = fixed.slice(i + 1).find((h): h is number => h !== null);
    const hour =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : before !== undefined
          ? before + 3
          : after !== undefined
            ? after - 3
            : rule('E14.mealHour.snack');
    hours.set(m.id, hour);
  });
  return hours;
}

export type StructureError = {
  readonly code: 'TOO_FEW_MAIN_MEALS' | 'TOO_MANY_MEALS' | 'EMPTY' | 'DUPLICATE_MAIN_MEAL';
  readonly minMainMeals?: number;
};

/** R17 E16 and the interface limit: at least the person's minimum of main meals, at most six meals. */
export function checkStructure(
  structure: readonly Meal[],
  minMainMeals: number,
): Result<readonly Meal[], StructureError> {
  if (structure.length === 0) return err({ code: 'EMPTY' });
  if (structure.length > rule('E16.maxMeals')) return err({ code: 'TOO_MANY_MEALS' });
  const mains = structure.filter((m) => isMainMeal(m.kind));
  if (new Set(mains.map((m) => m.kind)).size !== mains.length)
    return err({ code: 'DUPLICATE_MAIN_MEAL' });
  if (mains.length < minMainMeals) return err({ code: 'TOO_FEW_MAIN_MEALS', minMainMeals });
  return ok(structure);
}

/** Whether a meal may be removed now (the interface hides «−» otherwise and says why). */
export function canRemoveMeal(
  structure: readonly Meal[],
  mealId: string,
  minMainMeals: number,
): boolean {
  const rest = structure.filter((m) => m.id !== mealId);
  return rest.length < structure.length && checkStructure(rest, minMainMeals).ok;
}

export { MAIN_KINDS };
