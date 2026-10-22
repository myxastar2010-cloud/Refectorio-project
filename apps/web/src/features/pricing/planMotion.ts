import type { Transition, Variants } from 'motion/react';
import { DURATION, EASE_IN_OUT, EASE_OUT_EXPO, EASE_OUT_SOFT, PRICING } from '../../motion/tokens';

/**
 * The motion inside «Цены»: the hover ring, a new price, and Premium's «Ещё...». Opacity, transform and a short blur
 * only; every state is a variant, so a second click half-way simply turns the motion around.
 */

const ms = (value: number) => value / 1000;
const blur = (px: number) => `blur(${px}px)`;
const SHARP_END = { filter: 'none' } as const;
const quick: Transition = { duration: DURATION.fade };

/** The ring eases out of the card's edge while it draws itself; it leaves by fading, and is undrawn only then. */
export function ringVariants(calm: boolean): Variants {
  const { growMs, fromScale, outMs } = PRICING.ring;
  if (calm) {
    return { shown: { opacity: 1, transition: quick }, hidden: { opacity: 0, transition: quick } };
  }
  return {
    shown: {
      opacity: 1,
      transform: 'scale(1)',
      transition: {
        transform: { duration: ms(growMs), ease: EASE_OUT_EXPO },
        opacity: { duration: DURATION.micro, ease: EASE_OUT_SOFT },
      },
    },
    hidden: {
      opacity: 0,
      transition: { duration: ms(outMs), ease: EASE_IN_OUT },
      transitionEnd: { transform: `scale(${String(fromScale)})` },
    },
  };
}

/** Each half of the ring runs from the top centre to the bottom centre. */
export function ringStrokeVariants(calm: boolean): Variants {
  if (calm) return { shown: { pathLength: 1 }, hidden: { pathLength: 1 } };
  return {
    shown: {
      pathLength: 1,
      transition: { duration: ms(PRICING.ring.drawMs), ease: EASE_OUT_EXPO },
    },
    hidden: {
      pathLength: 1,
      transition: { duration: ms(PRICING.ring.outMs) },
      transitionEnd: { pathLength: 0 },
    },
  };
}

/** A new price rises out of a blur while the old one leaves upwards into one. */
export function priceMotion(calm: boolean) {
  const { durationMs, risePx, blurPx } = PRICING.price;
  if (calm) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: quick },
      exit: { opacity: 0, transition: quick },
    } as const;
  }
  const transition = { duration: ms(durationMs), ease: EASE_OUT_EXPO };
  return {
    initial: { opacity: 0, transform: `translateY(${String(risePx)}px)`, filter: blur(blurPx) },
    animate: {
      opacity: 1,
      transform: 'translateY(0px)',
      filter: blur(0),
      transition,
      transitionEnd: SHARP_END,
    },
    exit: {
      opacity: 0,
      transform: `translateY(${String(-risePx)}px)`,
      filter: blur(blurPx),
      transition: { ...transition, duration: ms(durationMs * 0.7), ease: EASE_IN_OUT },
    },
  } as const;
}

/** The card's own text: it dissolves upwards when «Ещё...» opens and settles back when it closes. */
export function bodyVariants(calm: boolean): Variants {
  const { outMs, backMs, risePx, blurPx } = PRICING.more;
  if (calm)
    return { here: { opacity: 1, transition: quick }, away: { opacity: 0, transition: quick } };
  return {
    here: {
      opacity: 1,
      transform: 'translateY(0px)',
      filter: blur(0),
      transition: { duration: ms(backMs), ease: EASE_OUT_SOFT, delay: ms(PRICING.more.outMs) },
      transitionEnd: SHARP_END,
    },
    away: {
      opacity: 0,
      transform: `translateY(${String(-risePx)}px)`,
      filter: blur(blurPx),
      transition: { duration: ms(outMs), ease: EASE_IN_OUT },
    },
  };
}

/** The fully blurred picture cross-fades over the sharp one (both share the card's shape: a seamless join). */
export function openPictureVariants(calm: boolean): Variants {
  const duration = calm ? DURATION.fade : ms(PRICING.more.pictureMs);
  return {
    here: { opacity: 0, transition: { duration, ease: EASE_IN_OUT } },
    away: { opacity: 1, transition: { duration, ease: EASE_IN_OUT } },
  };
}

/**
 * The rest of Premium's list: it rises line by line after the card's text has gone; closing, all of it goes at once.
 * Its visibility follows the card's data-open in CSS (pricing.css), so focus can move into it in the same render.
 */
export function extraVariants(calm: boolean): Variants {
  const { inDelayMs, staggerMs, outMs } = PRICING.more;
  if (calm) {
    return {
      here: { opacity: 0, transition: quick },
      away: { opacity: 1, transition: quick },
    };
  }
  return {
    here: {
      opacity: 0,
      transition: { duration: ms(outMs), ease: EASE_IN_OUT },
    },
    away: {
      opacity: 1,
      transition: {
        duration: DURATION.micro,
        delayChildren: ms(inDelayMs),
        staggerChildren: ms(staggerMs),
      },
    },
  };
}

export function extraItemVariants(calm: boolean): Variants {
  const { inMs, risePx, blurPx, outMs } = PRICING.more;
  if (calm) return { here: {}, away: {} };
  return {
    // Reset only once the list has faded out as a whole.
    here: {
      opacity: 0,
      transform: `translateY(${String(risePx)}px)`,
      filter: blur(blurPx),
      transition: { duration: 0, delay: ms(outMs) },
    },
    away: {
      opacity: 1,
      transform: 'translateY(0px)',
      filter: blur(0),
      transition: {
        default: { duration: ms(inMs), ease: EASE_OUT_EXPO },
        opacity: { duration: ms(inMs) * 0.7, ease: EASE_OUT_SOFT },
      },
      transitionEnd: SHARP_END,
    },
  };
}

/** The card's own × turns in as it appears. */
export function lessButtonVariants(calm: boolean): Variants {
  if (calm)
    return { here: { opacity: 0, transition: quick }, away: { opacity: 1, transition: quick } };
  return {
    here: {
      opacity: 0,
      transform: 'rotate(-90deg) scale(0.6)',
      transition: { duration: ms(PRICING.more.outMs), ease: EASE_IN_OUT },
    },
    away: {
      opacity: 1,
      transform: 'rotate(0deg) scale(1)',
      transition: {
        duration: ms(PRICING.more.inMs),
        ease: EASE_OUT_EXPO,
        delay: ms(PRICING.more.inDelayMs),
      },
    },
  };
}
