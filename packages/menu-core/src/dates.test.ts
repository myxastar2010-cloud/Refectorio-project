import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDates,
  dateRange,
  daysBetween,
  endOfNextWeek,
  isIsoDate,
  isWeekend,
  weekStart,
  weekdayIndex,
} from './dates';

describe('isIsoDate', () => {
  it('accepts real dates, leap days included', () => {
    expect(isIsoDate('2026-11-03')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
  });

  it('rejects impossible and malformed dates', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-1')).toBe(false);
    expect(isIsoDate('03.11.2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('addDays and daysBetween', () => {
  it('crosses months and years', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-11-03', 0)).toBe('2026-11-03');
  });

  it('counts the difference with a sign', () => {
    expect(daysBetween('2026-11-03', '2026-11-10')).toBe(7);
    expect(daysBetween('2026-11-10', '2026-11-03')).toBe(-7);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2026-11-03', '2026-11-03')).toBe(0);
  });

  it('refuses a string that is not a date', () => {
    expect(() => addDays('nope', 1)).toThrow();
  });
});

describe('weekdays', () => {
  it('numbers the week from Monday', () => {
    expect(weekdayIndex('2026-11-02')).toBe(0);
    expect(weekdayIndex('2026-11-03')).toBe(1);
    expect(weekdayIndex('2026-11-08')).toBe(6);
  });

  it('knows weekends', () => {
    expect(isWeekend('2026-11-06')).toBe(false);
    expect(isWeekend('2026-11-07')).toBe(true);
    expect(isWeekend('2026-11-08')).toBe(true);
  });

  it('finds the Monday of a week', () => {
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekStart('2026-11-04')).toBe('2026-11-02');
  });
});

describe('endOfNextWeek', () => {
  it('is the Sunday of the following week, 8 to 14 days ahead', () => {
    expect(endOfNextWeek('2026-11-04')).toBe('2026-11-15');
    for (let i = 0; i < 14; i += 1) {
      const today = addDays('2026-11-02', i);
      const end = endOfNextWeek(today);
      const ahead = daysBetween(today, end);
      expect(ahead).toBeGreaterThanOrEqual(7);
      expect(ahead).toBeLessThanOrEqual(13);
      expect(weekdayIndex(end)).toBe(6);
    }
  });
});

describe('dateRange and compareDates', () => {
  it('lists both ends', () => {
    expect(dateRange('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    expect(dateRange('2026-11-03', '2026-11-03')).toEqual(['2026-11-03']);
  });

  it('is empty when the end is before the start', () => {
    expect(dateRange('2026-11-04', '2026-11-03')).toEqual([]);
  });

  it('compares dates', () => {
    expect(compareDates('2026-11-03', '2026-11-04')).toBe(-1);
    expect(compareDates('2026-11-04', '2026-11-03')).toBe(1);
    expect(compareDates('2026-11-03', '2026-11-03')).toBe(0);
  });
});
