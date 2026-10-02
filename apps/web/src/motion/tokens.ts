/**
 * Motion tokens — the only place for animation timings, springs and choreography.
 * Durations for Motion are in seconds; engine/controller timings are in milliseconds (`…Ms`).
 * Starting values come from ТЗ 6.6–6.9 and the mockups; see docs/design-system.md, section «Движение».
 */

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const DURATION = {
  /** Hover/press feedback of small controls. */
  micro: 0.22,
  /** WaveHover: the circle grows to the far corner / shrinks to the exit point. */
  wave: 0.42,
  /** Tap wave on touch screens. */
  waveTap: 0.32,
  /** Reduced motion: every transition becomes a cross-fade of this length. */
  fade: 0.2,
  scrim: 0.35,
  toast: 0.3,
} as const;

export const SPRING = {
  press: { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 },
  tilt: { type: 'spring', stiffness: 180, damping: 20, mass: 0.6 },
  /** Team card expansion (shared element). */
  expand: { type: 'spring', visualDuration: 0.55, bounce: 0.12 },
  aboutTitle: { type: 'spring', visualDuration: 0.6, bounce: 0.1 },
  /** Cards "fly in from the first person" with a light overshoot. */
  aboutCards: { type: 'spring', visualDuration: 0.66, bounce: 0.22 },
} as const;

/** Scene transition hero ↔ about (ТЗ 6.6), times in ms from the start. */
export const SCENE = {
  inputLockMs: 1150,
  food: {
    durationMs: 900,
    /** The whole layer scales about a point below the frame, exactly as in Figma (mockup №2). */
    scale: 0.8874,
    opacity: 0.6,
    blurCrossfadeStartMs: 100,
    blurCrossfadeEndMs: 600,
    /** The about scene may slow the food down. */
    speedFactor: 0.7,
  },
  heroOut: { durationMs: 450, staggerMs: 40, blurPx: 12, scale: 0.96 },
  aboutTitleIn: { delayMs: 350, fromScale: 1.2, fromBlurPx: 12 },
  aboutCardsIn: { delayMs: 420, staggerMs: 80, fromScale: 1.6, fromBlurPx: 20 },
  /** Reverse: about cards fly towards the viewer. */
  aboutCardsOut: { durationMs: 420, toScale: 1.35, toBlurPx: 16 },
} as const;

export const DIALOG = {
  /** Content appears after this share of the expansion. */
  contentRevealAt: 0.6,
  contentStaggerMs: 50,
  /** The team logo cross-fades into the card background during the first part of the expansion. */
  logoCrossfadeEnd: 0.18,
} as const;

export const TILT = {
  featureCardMaxDeg: 6,
  ctaMaxDeg: 4,
  infoCardMaxDeg: 3.5,
  perspectivePx: 1000,
  glareOpacity: 0.2,
  glareSizeRatio: 0.9,
} as const;

/** Wheel/touchpad and swipe gestures (ТЗ 6.5). */
export const GESTURE = {
  wheelThresholdPx: 40,
  wheelWindowMs: 200,
  /** Inertia silencer: a new transition needs this much silence in wheel events. */
  wheelQuietMs: 220,
  swipeMinPx: 50,
  swipeDominance: 1.2,
  lineHeightPx: 16,
} as const;
