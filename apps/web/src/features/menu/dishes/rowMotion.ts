import type { Variants } from 'motion/react';
import { useState } from 'react';
import { EASE_OUT_EXPO, MENU } from '../../../motion/tokens';

/**
 * Where the next dish row comes from (ТЗ фаза 4 §14): another day slides in from the side of its date
 * (`MENU.day`), another meal from the side of its tab (`MENU.tab`). A pure function of the previous and the new slot.
 */
export function slideFrom(
  from: { readonly date: string; readonly mealIndex: number },
  to: { readonly date: string; readonly mealIndex: number },
): number {
  if (from.date !== to.date) return (to.date > from.date ? 1 : -1) * MENU.day.slidePx;
  if (from.mealIndex !== to.mealIndex)
    return (to.mealIndex > from.mealIndex ? 1 : -1) * MENU.tab.slidePx;
  return 0;
}

/** The row's offset for the slot now on screen; kept until the date or the meal changes. */
export function useRowSlide(date: string, mealId: string, mealIndex: number): number {
  const [shown, setShown] = useState({ date, mealId, mealIndex, dx: 0 });
  if (shown.date !== date || shown.mealId !== mealId) {
    const dx = slideFrom(shown, { date, mealIndex });
    setShown({ date, mealId, mealIndex, dx });
    return dx;
  }
  return shown.dx;
}

/** The row cross-fades; its cards slide in from `dx`, 30 ms apart. `custom` = dx (the exiting row moves away). */
export const rowVariants = (calm: boolean): Variants => ({
  enter: { opacity: calm ? 0 : 1 },
  show: {
    opacity: 1,
    transition: { duration: MENU.tab.durationS, staggerChildren: calm ? 0 : MENU.tab.staggerS },
  },
  exit: (dx: number) => ({
    opacity: 0,
    x: calm ? 0 : -dx / 2,
    transition: { duration: MENU.tab.durationS / 2 },
  }),
});

export const cardVariants = (calm: boolean): Variants => ({
  enter: (dx: number) => (calm ? { opacity: 1 } : { opacity: 0, x: dx }),
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: MENU.tab.durationS, ease: EASE_OUT_EXPO },
  },
});
