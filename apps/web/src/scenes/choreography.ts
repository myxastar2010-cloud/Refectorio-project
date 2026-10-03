import type { Variants } from 'motion/react';
import {
  DURATION,
  EASE_IN_OUT,
  EASE_OUT_EXPO,
  EASE_OUT_SOFT,
  SCENE,
  SPRING,
} from '../motion/tokens';

/**
 * Scene transition choreography (ТЗ 6.6). Elements use variants "shown" / "hidden"; Motion interpolates from the
 * current values, so a transition reversed half-way simply turns around (interruptible by design).
 */
export type Phase = 'shown' | 'hidden';

const ms = (value: number) => value / 1000;
const blur = (px: number) => `blur(${px}px)`;
// A full transform string (not Motion's independent `scale`) lets the browser run the animation off the main thread.
const scaleTo = (value: number) => `scale(${value})`;

/** Leaving: scale on the expo curve, opacity and blur over the whole duration (see EASE_OUT_SOFT). */
const leaving = (duration: number, delay = 0) => ({
  default: { duration, ease: EASE_OUT_EXPO, delay },
  opacity: { duration, ease: EASE_IN_OUT, delay },
  filter: { duration, ease: EASE_IN_OUT, delay },
});

/** Opacity and blur of appearing content; the scale keeps its own curve or spring. */
const appearing = (duration: number, delay: number) => ({
  opacity: { duration, ease: EASE_OUT_SOFT, delay },
  filter: { duration, ease: EASE_OUT_SOFT, delay },
});

/** Reduced motion: every element just cross-fades in 200 ms. */
const fade: Variants = {
  shown: {
    opacity: 1,
    transform: scaleTo(1),
    filter: blur(0),
    transition: { duration: DURATION.fade },
  },
  hidden: {
    opacity: 0,
    transform: scaleTo(1),
    filter: blur(0),
    transition: { duration: DURATION.fade },
  },
};

/** Part 1 blocks in cascade order: 0 header → 1 title → 2 lead and button → 3 cards. */
export function heroVariants(index: number, calm: boolean): Variants {
  if (calm) return fade;
  const out = SCENE.heroOut;
  const back = SCENE.heroIn;
  return {
    hidden: {
      opacity: 0,
      transform: scaleTo(out.scale),
      filter: blur(out.blurPx),
      transition: leaving(ms(out.durationMs), ms(index * out.staggerMs)),
    },
    shown: {
      opacity: 1,
      transform: scaleTo(1),
      filter: blur(0),
      transition: {
        default: {
          duration: ms(back.durationMs),
          ease: EASE_OUT_EXPO,
          delay: ms(back.delayMs + index * back.staggerMs),
        },
        ...appearing(ms(back.durationMs), ms(back.delayMs + index * back.staggerMs)),
      },
    },
  };
}

/** Part 2 title: appears from above, slightly larger and blurred. */
export function aboutTitleVariants(calm: boolean): Variants {
  if (calm) return fade;
  const into = SCENE.aboutTitleIn;
  return {
    hidden: {
      opacity: 0,
      transform: scaleTo(into.fromScale),
      filter: blur(into.fromBlurPx),
      transition: leaving(ms(SCENE.aboutTitleOut.durationMs)),
    },
    shown: {
      opacity: 1,
      transform: scaleTo(1),
      filter: blur(0),
      transition: {
        default: { ...SPRING.aboutTitle, delay: ms(into.delayMs) },
        ...appearing(ms(into.blurMs), ms(into.delayMs)),
      },
    },
  };
}

/**
 * Part 2 cards «fly in from the first person» and leave towards the viewer. The way back is a mirror (ТЗ 6.6):
 * the card that came last leaves first.
 */
export function aboutCardVariants(index: number, count: number, calm: boolean): Variants {
  if (calm) return fade;
  const into = SCENE.aboutCardsIn;
  const out = SCENE.aboutCardsOut;
  const delay = ms(into.delayMs + index * into.staggerMs);
  return {
    // One hidden state for both directions: entering from it and leaving to it both mean "close to the viewer".
    hidden: {
      opacity: 0,
      transform: scaleTo(into.fromScale),
      filter: blur(into.fromBlurPx),
      transition: leaving(ms(out.durationMs), ms((count - 1 - index) * into.staggerMs)),
    },
    shown: {
      opacity: 1,
      transform: scaleTo(1),
      filter: blur(0),
      transition: {
        default: { ...SPRING.aboutCards, delay },
        ...appearing(ms(into.blurMs), delay),
      },
    },
  };
}
