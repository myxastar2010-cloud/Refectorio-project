/**
 * Calendar dates as `YYYY-MM-DD` strings. No clock: «today» is always an input (menu-core is deterministic). UTC
 * arithmetic only, so the weekday of a date never depends on the device's time zone.
 */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const time = Date.UTC(Number(y), Number(m) - 1, Number(d));
  return toIsoDate(time) === value;
}

function toIsoDate(time: number): IsoDate {
  return new Date(time).toISOString().slice(0, 10);
}

function timeOf(date: IsoDate): number {
  const match = ISO_DATE.exec(date);
  if (!match) throw new Error(`not an ISO date: ${date}`);
  const [, y, m, d] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

export const addDays = (date: IsoDate, days: number): IsoDate =>
  toIsoDate(timeOf(date) + days * DAY_MS);

/** b − a in whole days. */
export const daysBetween = (a: IsoDate, b: IsoDate): number =>
  Math.round((timeOf(b) - timeOf(a)) / DAY_MS);

/** 0 = Monday … 6 = Sunday (the Russian week). */
export const weekdayIndex = (date: IsoDate): number => (new Date(timeOf(date)).getUTCDay() + 6) % 7;

export const isWeekend = (date: IsoDate): boolean => weekdayIndex(date) >= 5;

/** Monday of the date's week. */
export const weekStart = (date: IsoDate): IsoDate => addDays(date, -weekdayIndex(date));

/** Sunday of the week after the date's week: the first horizon of a new menu (8–14 days). */
export const endOfNextWeek = (date: IsoDate): IsoDate => addDays(weekStart(date), 13);

/** Every date from `from` to `to`, both included. */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  const n = daysBetween(from, to);
  for (let i = 0; i <= n; i += 1) out.push(addDays(from, i));
  return out;
}

export const compareDates = (a: IsoDate, b: IsoDate): number => (a < b ? -1 : a > b ? 1 : 0);
