import type { Variants } from 'motion/react';
import { DURATION, EASE_OUT_EXPO, SCENE, SPRING } from '../motion/tokens';

/**
 * Scene transition choreography (ТЗ 6.6). Elements use variants "shown" / "hidden"; Motion interpolates from the
 * current values, so a transition reversed half-way simply turns around (interruptible by design).
 */
export type Phase = 'shown' | 'hidden';

const ms = (value: number) => value / 1000;
const blur = (px: number) => `blur(${px}px)`;

/** Reduced motion: every element just cross-fades in 200 ms. */
const fade: Variants = {
  shown: { opacity: 1, scale: 1, filter: blur(0), transition: { duration: DURATION.fade } },
  hidden: { opacity: 0, scale: 1, filter: blur(0), transition: { duration: DURATION.fade } },
};

/** Part 1 blocks in cascade order: 0 header → 1 title → 2 lead and button → 3 cards. */
export function heroVariants(index: number, calm: boolean): Variants {
  if (calm) return fade;
  const out = SCENE.heroOut;
  const back = SCENE.heroIn;
  return {
    hidden: {
      opacity: 0,
      scale: out.scale,
      filter: blur(out.blurPx),
      transition: {
        duration: ms(out.durationMs),
        ease: EASE_OUT_EXPO,
        delay: ms(index * out.staggerMs),
      },
    },
    shown: {
      opacity: 1,
      scale: 1,
      filter: blur(0),
      transition: {
        duration: ms(back.durationMs),
        ease: EASE_OUT_EXPO,
        delay: ms(back.delayMs + index * back.staggerMs),
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
      scale: into.fromScale,
      filter: blur(into.fromBlurPx),
      transition: { duration: ms(SCENE.aboutTitleOut.durationMs), ease: EASE_OUT_EXPO },
    },
    shown: {
      opacity: 1,
      scale: 1,
      filter: blur(0),
      transition: {
        default: { ...SPRING.aboutTitle, delay: ms(into.delayMs) },
        filter: { duration: ms(into.blurMs), ease: EASE_OUT_EXPO, delay: ms(into.delayMs) },
        opacity: { duration: ms(into.blurMs), ease: EASE_OUT_EXPO, delay: ms(into.delayMs) },
      },
    },
  };
}

/** Part 2 cards «fly in from the first person» and leave towards the viewer. */
export function aboutCardVariants(index: number, calm: boolean): Variants {
  if (calm) return fade;
  const into = SCENE.aboutCardsIn;
  const out = SCENE.aboutCardsOut;
  const delay = ms(into.delayMs + index * into.staggerMs);
  return {
    // One hidden state for both directions: entering from it and leaving to it both mean "close to the viewer".
    hidden: {
      opacity: 0,
      scale: into.fromScale,
      filter: blur(into.fromBlurPx),
      transition: { duration: ms(out.durationMs), ease: EASE_OUT_EXPO },
    },
    shown: {
      opacity: 1,
      scale: 1,
      filter: blur(0),
      transition: {
        default: { ...SPRING.aboutCards, delay },
        filter: { duration: ms(into.blurMs), ease: EASE_OUT_EXPO, delay },
        opacity: { duration: ms(into.blurMs), ease: EASE_OUT_EXPO, delay },
      },
    },
  };
}
