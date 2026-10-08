import type { TargetAndTransition, Variants } from 'motion/react';
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
/** Upward drift plus scale; the same functions on both ends keep the interpolation a straight one. */
const liftTo = (upPx: number, scale: number) => `translate3d(0px, ${-upPx}px, 0px) scale(${scale})`;

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

/**
 * Once sharp, the filter is removed altogether: a leftover `blur(0px)` makes the browser draw the element through an
 * extra GPU pass on every frame. Invisible: the blur has already reached 0.
 */
const SHARP_END = { filter: 'none' } as const;

/** Reduced motion: every element just cross-fades in 200 ms. */
const fade: Variants = {
  shown: {
    opacity: 1,
    transform: scaleTo(1),
    filter: blur(0),
    transition: { duration: DURATION.fade },
    transitionEnd: SHARP_END,
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
  const delay = ms(back.delayMs + index * back.staggerMs);
  return {
    // Part 1 drifts up as it dissolves (the camera moves on) and settles back with a light spring.
    hidden: {
      opacity: 0,
      transform: liftTo(out.liftPx, out.scale),
      filter: blur(out.blurPx),
      transition: leaving(ms(out.durationMs), ms(index * out.staggerMs)),
    },
    shown: {
      opacity: 1,
      transform: liftTo(0, 1),
      filter: blur(0),
      transition: {
        default: { ...SPRING.heroIn, delay },
        ...appearing(ms(back.durationMs), delay),
      },
      transitionEnd: SHARP_END,
    },
  };
}

/** The two states of a block's variants, each split into the given properties (the transition goes along). */
function split(variants: Variants, keys: readonly string[], withEnd: boolean): Variants {
  const part = (state: 'hidden' | 'shown') => {
    const target = variants[state] as TargetAndTransition;
    const picked: Record<string, unknown> = { transition: target.transition };
    for (const key of keys) picked[key] = (target as Record<string, unknown>)[key];
    if (withEnd && state === 'shown' && 'filter' in picked) picked.transitionEnd = SHARP_END;
    return picked as TargetAndTransition;
  };
  return { hidden: part('hidden'), shown: part('shown') };
}

/**
 * Blocks that hold a glass button (the header, the slot of «Создать меню») only move: a filter or an opacity below 1
 * on an ancestor would cut the glass off from the food behind it — it would turn see-through for the length of the
 * transition. Their logo and buttons fade and blur themselves (heroFadeVariants), on the same timing.
 */
export const heroLiftVariants = (index: number, calm: boolean): Variants =>
  split(heroVariants(index, calm), ['transform'], false);

export const heroFadeVariants = (index: number, calm: boolean): Variants =>
  split(heroVariants(index, calm), ['opacity', 'filter'], true);

/** Part 2 title: comes into focus from a blur, at its own size. */
export function aboutTitleVariants(calm: boolean): Variants {
  if (calm) return fade;
  const into = SCENE.aboutTitleIn;
  const out = ms(SCENE.aboutTitleOut.durationMs);
  return {
    hidden: {
      opacity: 0,
      filter: blur(into.fromBlurPx),
      transition: {
        filter: { duration: out, ease: EASE_OUT_SOFT },
        opacity: { duration: out, ease: EASE_IN_OUT },
      },
    },
    shown: {
      opacity: 1,
      filter: blur(0),
      transition: {
        filter: { duration: ms(into.blurMs), ease: EASE_OUT_SOFT, delay: ms(into.delayMs) },
        opacity: { duration: ms(into.fadeMs), ease: EASE_OUT_SOFT, delay: ms(into.delayMs) },
      },
      transitionEnd: SHARP_END,
    },
  };
}

/**
 * Part 2 cards come into focus: a light blur resolves to sharp at their own size — they neither grow nor dim.
 * The way back is a mirror (ТЗ 6.6): the card that came last blurs away first.
 */
export function aboutCardVariants(index: number, count: number, calm: boolean): Variants {
  if (calm) return fade;
  const into = SCENE.aboutCardsIn;
  const out = SCENE.aboutCardsOut;
  const delay = ms(into.delayMs + index * into.staggerMs);
  const exitDelay = ms((count - 1 - index) * into.staggerMs);
  return {
    hidden: {
      opacity: 0,
      filter: blur(into.fromBlurPx),
      transition: {
        filter: { duration: ms(out.durationMs), ease: EASE_OUT_SOFT, delay: exitDelay },
        opacity: {
          duration: ms(out.fadeMs),
          ease: EASE_IN_OUT,
          delay: exitDelay + ms(out.durationMs - out.fadeMs),
        },
      },
    },
    shown: {
      opacity: 1,
      filter: blur(0),
      transition: {
        filter: { duration: ms(into.blurMs), ease: EASE_OUT_SOFT, delay },
        opacity: { duration: ms(into.fadeMs), ease: EASE_OUT_SOFT, delay },
      },
      transitionEnd: SHARP_END,
    },
  };
}
