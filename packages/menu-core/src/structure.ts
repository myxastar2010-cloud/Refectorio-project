/**
 * Meals of a day: their titles, energy shares (R17 E17, normalised over the meals that exist), clock hours (R17 E14,
 * for the caffeine cut-off) and the minimum-meals check (R17 E16).
 *
 * Meal ids are stable (review of phase 3, M6): a main meal is named by its kind, a snack `snack-N` keeps its number when
 * meals are added, removed or reordered, so eaten marks (`mealId:itemId`) and a meal's dishes stay with their meal.
 * Edit a structure with `addMeal` / `removeMeal` / `moveMeal`; `structureFromKinds` only makes a new one.
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

type MealSeed = Pick<Meal, 'id' | 'kind'>;

/** Titles and positions from day order: snacks are numbered by their place when there are several. */
function arrange(meals: readonly MealSeed[]): Meal[] {
  const snacks = meals.filter((m) => m.kind === 'snack').length;
  let snackNo = 0;
  return meals.map(({ id, kind }, order) => {
    if (kind !== 'snack') return { id, kind, titleRu: TITLES[kind], order };
    snackNo += 1;
    return { id, kind, titleRu: snacks > 1 ? `Перекус ${snackNo}` : 'Перекус', order };
  });
}

/** A new structure from the kinds in day order: snacks get ids snack-1, snack-2… */
export function structureFromKinds(kinds: readonly MealKind[]): Meal[] {
  let snackNo = 0;
  return arrange(
    kinds.map((kind) => {
      if (kind !== 'snack') return { id: kind, kind };
      snackNo += 1;
      return { id: `snack-${snackNo}`, kind };
    }),
  );
}

const SNACK_ID = /^snack-([1-9]\d{0,2})$/;

/** The kind a meal id stands for, or null for an id the engine never makes. */
export function kindOfMealId(id: string): MealKind | null {
  if (SNACK_ID.test(id)) return 'snack';
  return MAIN_KINDS.find((k) => k === id) ?? null;
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
  readonly code:
    | 'TOO_FEW_MAIN_MEALS'
    | 'TOO_MANY_MEALS'
    | 'EMPTY'
    | 'DUPLICATE_MAIN_MEAL'
    | 'DUPLICATE_ID'
    | 'BAD_ID'
    | 'BAD_ORDER'
    | 'NO_SUCH_MEAL';
  readonly minMainMeals?: number;
  readonly mealId?: string;
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
  const ids = new Set<string>();
  for (const [i, m] of structure.entries()) {
    if (kindOfMealId(m.id) !== m.kind) return err({ code: 'BAD_ID', mealId: m.id });
    if (ids.has(m.id)) return err({ code: 'DUPLICATE_ID', mealId: m.id });
    if (m.order !== i) return err({ code: 'BAD_ORDER', mealId: m.id });
    ids.add(m.id);
  }
  if (mains.length < minMainMeals) return err({ code: 'TOO_FEW_MAIN_MEALS', minMainMeals });
  return ok(structure);
}

/** Whether a meal may be removed now (the interface hides «−» otherwise and says why). */
export function canRemoveMeal(
  structure: readonly Meal[],
  mealId: string,
  minMainMeals: number,
): boolean {
  return removeMeal(structure, mealId, minMainMeals).ok;
}

/**
 * Adds a meal in its place in the day (ТЗ фаза 4 §6): a main meal by its R17 E14 hour, a snack into the longest gap
 * between meals (after the last one when there is a single meal). A new snack takes the next free number.
 */
export function addMeal(
  structure: readonly Meal[],
  kind: MealKind,
): Result<readonly Meal[], StructureError> {
  let id: string = kind;
  if (kind === 'snack') {
    const used = structure.map((m) => Number(SNACK_ID.exec(m.id)?.[1] ?? 0));
    id = `snack-${Math.max(0, ...used) + 1}`;
  }
  const hours = mealHours(structure);
  const hourOf = (m: Meal) => hours.get(m.id) ?? 0;
  let at = structure.length;
  if (kind !== 'snack') {
    const own = rule(`E14.mealHour.${kind}`);
    const later = structure.findIndex((m) => hourOf(m) > own);
    if (later >= 0) at = later;
  } else {
    let widest = 0;
    for (let i = 1; i < structure.length; i += 1) {
      const prev = structure[i - 1];
      const next = structure[i];
      const gap = prev && next ? hourOf(next) - hourOf(prev) : 0;
      if (gap > widest + 1e-9) {
        widest = gap;
        at = i;
      }
    }
  }
  const seeds: MealSeed[] = [...structure];
  seeds.splice(at, 0, { id, kind });
  return checkStructure(arrange(seeds), 0);
}

/** Removes a meal; the others keep their ids (the minimum of main meals is checked by `checkStructure`). */
export function removeMeal(
  structure: readonly Meal[],
  mealId: string,
  minMainMeals: number,
): Result<readonly Meal[], StructureError> {
  if (!structure.some((m) => m.id === mealId)) return err({ code: 'NO_SUCH_MEAL', mealId });
  return checkStructure(arrange(structure.filter((m) => m.id !== mealId)), minMainMeals);
}

/** Moves a meal to a new place in the day (drag in edit mode); its dishes and eaten marks travel with its id. */
export function moveMeal(
  structure: readonly Meal[],
  mealId: string,
  toIndex: number,
): Result<readonly Meal[], StructureError> {
  const meal = structure.find((m) => m.id === mealId);
  if (!meal) return err({ code: 'NO_SUCH_MEAL', mealId });
  const seeds: MealSeed[] = structure.filter((m) => m.id !== mealId);
  seeds.splice(Math.max(0, Math.min(seeds.length, Math.trunc(toIndex))), 0, meal);
  return checkStructure(arrange(seeds), 0);
}

export { MAIN_KINDS };
