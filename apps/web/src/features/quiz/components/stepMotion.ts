import type { TargetAndTransition, Variants } from 'motion/react';
import { createContext } from 'react';
import { DURATION, EASE_IN_OUT, EASE_OUT_SOFT, QUIZ } from '../../../motion/tokens';
import type { IconKey } from '../flow/steps';

/** How the current screen entered: direction (Back mirrors the rise), delay, and whether its icon stays still. */
export type StepMotion = {
  readonly direction: 1 | -1;
  readonly enterDelayMs: number;
  /** The previous screen had the same icon: it does not animate (parent ↔ sub-step, 7 ↔ 8; ТЗ §7.6). */
  readonly iconStill: boolean;
};

/** AnimatePresence custom data: what the new screen looks like (read by the leaving one). */
export type PresenceInfo = { readonly icon: IconKey | null };

export const StepMotionContext = createContext<StepMotion>({
  direction: 1,
  enterDelayMs: 0,
  iconStill: false,
});

const blur = (px: number) => `blur(${px}px)`;
const move = (y: number, scale: number) => `translateY(${y}px) scale(${scale})`;

/**
 * «Blur dissolve» of a block (ТЗ §7.6, stage-1 radii and curves, D-030): out — blur 12 px, fade, scale 0.98
 * (EASE_IN_OUT, 320 ms); in — from blur 10 px, opacity 0, 12 px lower (higher when going back) → sharp
 * (EASE_OUT_SOFT, 500 ms), cascade 50 ms; the filter is removed afterwards (a leftover blur(0) costs a GPU pass).
 */
export function blockVariants(
  calm: boolean,
  motion: StepMotion,
  order: number,
  still = false,
): Variants {
  if (calm) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1, transition: { duration: DURATION.fade } },
      exit: { opacity: 0, transition: { duration: DURATION.fade } },
    };
  }
  const into = QUIZ.stepIn;
  const out = QUIZ.stepOut;
  const delay = (motion.enterDelayMs + order * into.staggerMs) / 1000;
  const center: TargetAndTransition = {
    opacity: 1,
    filter: blur(0),
    transform: move(0, 1),
    transition: {
      duration: into.durationMs / 1000,
      ease: EASE_OUT_SOFT,
      delay,
    },
    transitionEnd: { filter: 'none' },
  };
  if (still) {
    return {
      enter: { opacity: 1, transform: move(0, 1) },
      center: { opacity: 1, transform: move(0, 1), transition: { duration: 0 } },
      exit: { opacity: 1, transition: { duration: out.durationMs / 1000 } },
    };
  }
  return {
    enter: {
      opacity: 0,
      filter: blur(into.blurPx),
      transform: move(into.risePx * motion.direction, 1),
    },
    center,
    exit: {
      opacity: 0,
      filter: blur(out.blurPx),
      transform: move(0, out.scale),
      transition: { duration: out.durationMs / 1000, ease: EASE_IN_OUT },
    },
  };
}
