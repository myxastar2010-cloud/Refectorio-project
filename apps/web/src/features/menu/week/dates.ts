import {
  addDays,
  dayStatus,
  weekdayIndex,
  weekStart,
  type DayStatus,
  type Plan,
  type Tracking,
} from '@refectorio/menu-core';
import { menu } from '../../../content/menu.ru';

/** The seven dates of the week that holds `date` (Monday first). */
export const weekOf = (date: string): string[] =>
  Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));

const parts = (date: string) => {
  const [y, mo, d] = date.split('-').map(Number);
  return { year: y ?? 0, month: (mo ?? 1) - 1, day: d ?? 1 };
};

export const dayNumber = (date: string) => parts(date).day;
export const yearOf = (date: string) => parts(date).year;
/** «22 июля» (lower-case month: the mockup's «Июля» is a typo). */
export const dayMonth = (date: string) => {
  const { month, day } = parts(date);
  return `${String(day)}\u00a0${menu.week.monthsGenitive[month] ?? ''}`;
};
export const weekdayShort = (date: string) => menu.week.weekdays[weekdayIndex(date)] ?? '';
export const weekdayLong = (date: string) => menu.week.weekdaysLong[weekdayIndex(date)] ?? '';

export type DayKind = 'beforeMenu' | 'past' | 'today' | 'future';

export function dayKind(plan: Plan, date: string, today: string): DayKind {
  const first = plan.days[0]?.date ?? today;
  if (date < first && date < today) return 'beforeMenu';
  if (date < today) return 'past';
  return date === today ? 'today' : 'future';
}

/** The status dot of a past day with a menu (green / orange / red), or none. */
export function statusOf(plan: Plan, date: string, tracking: Tracking, today: string): DayStatus {
  return dayStatus(plan, date, tracking, today);
}
