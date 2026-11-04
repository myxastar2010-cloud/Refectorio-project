/**
 * Eaten marks, water and the day status (ТЗ фаза 3 §6). Marks are per planned item (eaten at its planned portion)
 * and per glass of water, with timestamps; only today and the past seven days can be marked. A day is «done» when
 * every planned item is eaten, energy is within 90–110 % of the target and the drinking target is reached;
 * «partial» — any mark but not done; «missed» — a past day with a menu and no marks; «none» — today, the future,
 * days before the menu.
 */
import { NUTRIENT_KEYS, type NutrientKey, type NutrientVector } from '@refectorio/food-data';
import { compareDates, daysBetween, isIsoDate, weekStart, type IsoDate } from './dates';
import { rule } from './rules';
import { mealShares } from './structure';
import { err, ok, type DayPlan, type DayTargets, type Plan, type Result } from './types';

export type DayTracking = {
  /** `${mealId}:${itemId}` → when it was marked (ISO date-time). */
  readonly eaten: Readonly<Record<string, string>>;
  readonly waterGlasses: number;
  /** When each glass was added. */
  readonly waterAt: readonly string[];
};

export type Tracking = {
  readonly schema: 1;
  readonly days: Readonly<Record<IsoDate, DayTracking>>;
};

export const EMPTY_TRACKING: Tracking = { schema: 1, days: {} };
const EMPTY_DAY: DayTracking = { eaten: {}, waterGlasses: 0, waterAt: [] };

export const markKey = (mealId: string, itemId: string): string => `${mealId}:${itemId}`;

export type TrackingError = {
  readonly code: 'futureDay' | 'tooOld' | 'noSuchItem' | 'invalidDate' | 'negativeWater';
};

/** Only today and the previous seven days are editable. */
export function editable(date: IsoDate, today: IsoDate): TrackingError | null {
  if (!isIsoDate(date) || !isIsoDate(today)) return { code: 'invalidDate' };
  if (compareDates(date, today) > 0) return { code: 'futureDay' };
  if (daysBetween(date, today) > rule('S.editablePastDays')) return { code: 'tooOld' };
  return null;
}

export function markEaten(
  tracking: Tracking,
  plan: Plan,
  date: IsoDate,
  mealId: string,
  itemId: string,
  eaten: boolean,
  at: string,
  today: IsoDate,
): Result<Tracking, TrackingError> {
  const blocked = editable(date, today);
  if (blocked) return err(blocked);
  const day = plan.days.find((d) => d.date === date);
  if (!day || !(day.meals[mealId] ?? []).some((i) => i.itemId === itemId))
    return err({ code: 'noSuchItem' });
  const current = tracking.days[date] ?? EMPTY_DAY;
  const key = markKey(mealId, itemId);
  const marks = Object.fromEntries(Object.entries(current.eaten).filter(([k]) => k !== key));
  if (eaten) marks[key] = at;
  return ok({ ...tracking, days: { ...tracking.days, [date]: { ...current, eaten: marks } } });
}

export function addWater(
  tracking: Tracking,
  date: IsoDate,
  delta: 1 | -1,
  at: string,
  today: IsoDate,
): Result<Tracking, TrackingError> {
  const blocked = editable(date, today);
  if (blocked) return err(blocked);
  const current = tracking.days[date] ?? EMPTY_DAY;
  if (delta < 0 && current.waterGlasses === 0) return err({ code: 'negativeWater' });
  const waterAt = delta > 0 ? [...current.waterAt, at] : current.waterAt.slice(0, -1);
  return ok({
    ...tracking,
    days: {
      ...tracking.days,
      [date]: { ...current, waterGlasses: current.waterGlasses + delta, waterAt },
    },
  });
}

const sumInto = (out: Record<NutrientKey, number>, v: NutrientVector) => {
  for (const key of NUTRIENT_KEYS) out[key] += v[key] ?? 0;
};
const zero = (): Record<NutrientKey, number> =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Record<NutrientKey, number>;

/** Totals of a day or one meal: planned, or only what is marked eaten. */
export function totals(
  day: DayPlan,
  options: {
    readonly mealId?: string;
    readonly eatenOnly?: boolean;
    readonly tracking?: DayTracking;
  } = {},
): Record<NutrientKey, number> {
  const out = zero();
  for (const [mealId, items] of Object.entries(day.meals)) {
    if (options.mealId !== undefined && mealId !== options.mealId) continue;
    for (const item of items) {
      if (options.eatenOnly && !options.tracking?.eaten[markKey(mealId, item.itemId)]) continue;
      sumInto(out, item.nutrients);
    }
  }
  return out;
}

const isDrink = (role: string) => role === 'drink';

/**
 * Drinking target (R17 E18): total water (EFSA) minus the water of the day's planned food, soups included; drinks
 * count towards the target when marked, by their water. In glasses of R17's 250 ml.
 */
export function drinking(day: DayPlan, targets: DayTargets, tracking?: DayTracking) {
  let foodWater = 0;
  let drunk = (tracking?.waterGlasses ?? 0) * targets.glassMl;
  for (const [mealId, items] of Object.entries(day.meals)) {
    for (const item of items) {
      const water = item.nutrients.waterG ?? 0;
      if (!isDrink(item.role)) foodWater += water;
      else if (tracking?.eaten[markKey(mealId, item.itemId)]) drunk += water;
    }
  }
  const targetMl = Math.max(0, targets.waterTotalMl - foodWater);
  return {
    targetMl,
    targetGlasses: Math.max(1, Math.round(targetMl / targets.glassMl)),
    drunkMl: drunk,
    drunkGlasses: drunk / targets.glassMl,
  };
}

export type DayStatus = 'done' | 'partial' | 'missed' | 'none';

export function dayStatus(
  plan: Plan,
  date: IsoDate,
  tracking: Tracking,
  today: IsoDate,
): DayStatus {
  const day = plan.days.find((d) => d.date === date);
  // Today, the future and the days before the menu have no status yet (ТЗ фаза 3 §6).
  if (!day || compareDates(date, today) >= 0) return 'none';
  const t = tracking.days[date];
  const marks = t ? Object.keys(t.eaten).length + t.waterGlasses : 0;
  const items = Object.entries(day.meals).flatMap(([mealId, list]) =>
    list.map((i) => markKey(mealId, i.itemId)),
  );
  const allEaten =
    t !== undefined && items.length > 0 && items.every((k) => t.eaten[k] !== undefined);
  if (allEaten) {
    const energy = totals(day, { eatenOnly: true, tracking: t }).energyKcal;
    const share = energy / plan.targets.energyKcal;
    const water = drinking(day, plan.targets, t);
    if (
      share >= rule('S.doneEnergyMinShare') &&
      share <= rule('S.doneEnergyMaxShare') &&
      water.drunkMl >= water.targetMl
    )
      return 'done';
  }
  return marks > 0 ? 'partial' : 'missed';
}

export type WidgetScope = 'day' | 'meal' | 'week';

export type WidgetValue = {
  readonly nutrient: NutrientKey;
  readonly eaten: number;
  readonly planned: number;
  /** The person's norm for the scope (МР 2021 or the day target), null when there is none. */
  readonly norm: number | null;
  /** false — some planned item has no data for this nutrient («нет данных»). */
  readonly known: boolean;
};

function dayNorm(targets: DayTargets, nutrient: NutrientKey): number | null {
  switch (nutrient) {
    case 'energyKcal':
      return targets.energyKcal;
    case 'proteinG':
      return targets.proteinG.target;
    case 'fatG':
      return targets.fatG.target;
    case 'carbsG':
      return targets.carbsG.target;
    case 'fibreG':
      return targets.fibreG.target;
    case 'sodiumMg':
      return targets.sodiumMaxMg;
    case 'freeSugarsG':
    case 'addedSugarsG':
      return targets.freeSugarsMaxG;
    case 'satFatG':
      return targets.satFatMaxG;
    case 'caffeineMg':
      return targets.caffeineMaxMg;
    case 'waterG':
      return targets.waterTotalMl;
    default: {
      const micro = (targets.micros as Partial<Record<NutrientKey, { norm: number }>>)[nutrient];
      return micro?.norm ?? null;
    }
  }
}

/** A widget's numbers: eaten vs planned vs the norm, for a day, one meal or the week of the date. */
export function widgetValue(
  plan: Plan,
  nutrient: NutrientKey,
  scope: WidgetScope,
  date: IsoDate,
  tracking: Tracking,
  mealId?: string,
): WidgetValue {
  const days =
    scope === 'week'
      ? plan.days.filter((d) => {
          const offset = daysBetween(weekStart(date), d.date);
          return offset >= 0 && offset < 7;
        })
      : plan.days.filter((d) => d.date === date);
  let eaten = 0;
  let planned = 0;
  let known = true;
  for (const day of days) {
    const t = tracking.days[day.date];
    for (const [id, items] of Object.entries(day.meals)) {
      if (scope === 'meal' && id !== mealId) continue;
      for (const item of items) {
        const v = item.nutrients[nutrient];
        if (v === null) {
          known = false;
          continue;
        }
        planned += v;
        if (t?.eaten[markKey(id, item.itemId)]) eaten += v;
      }
    }
  }
  const perDay = dayNorm(plan.targets, nutrient);
  // A meal's norm is its share of the day (R17 E17); a week's — the days of the plan in that week.
  const share =
    scope === 'meal'
      ? (mealShares(plan.structure).get(mealId ?? '') ?? 0)
      : scope === 'week'
        ? days.length
        : 1;
  return { nutrient, eaten, planned, norm: perDay === null ? null : perDay * share, known };
}
