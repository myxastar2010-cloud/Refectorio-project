import { describe, expect, it } from 'vitest';
import { MENU } from '../../../motion/tokens';
import { slideFrom } from './rowMotion';

describe('slideFrom', () => {
  const mon = { date: '2026-07-20', mealIndex: 1 };
  it('a later day comes from the right, an earlier one from the left', () => {
    expect(slideFrom(mon, { date: '2026-07-21', mealIndex: 1 })).toBe(MENU.day.slidePx);
    expect(slideFrom(mon, { date: '2026-07-13', mealIndex: 0 })).toBe(-MENU.day.slidePx);
  });
  it('another meal of the same day comes from the side of its tab', () => {
    expect(slideFrom(mon, { date: mon.date, mealIndex: 2 })).toBe(MENU.tab.slidePx);
    expect(slideFrom(mon, { date: mon.date, mealIndex: 0 })).toBe(-MENU.tab.slidePx);
  });
  it('the same slot does not move', () => {
    expect(slideFrom(mon, mon)).toBe(0);
  });
});
