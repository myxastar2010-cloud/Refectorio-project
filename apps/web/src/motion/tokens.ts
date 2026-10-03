/**
 * Motion tokens — the only place for animation timings, springs and choreography.
 * Durations for Motion are in seconds; engine/controller timings are in milliseconds (`…Ms`).
 * Starting values come from ТЗ 6.6–6.9 and the mockups; see docs/design-system.md, section «Движение».
 */

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
/**
 * Opacity and blur of appearing content. With the expo curve they reach ~90 % in the first third of the duration,
 * so a 40–80 ms cascade collapses into one frame; leaving content fades with EASE_IN_OUT for the same reason
 * (it also lingers long enough to cross-fade with the next scene instead of leaving an empty screen).
 */
export const EASE_OUT_SOFT = [0.33, 1, 0.68, 1] as const;

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
  /** Text of the opened team card rises into place with a light bounce. */
  dialogContent: { type: 'spring', visualDuration: 0.45, bounce: 0.25 },
  /** Part 1 settles back with a light overshoot. */
  heroIn: { type: 'spring', visualDuration: 0.62, bounce: 0.2 },
  aboutTitle: { type: 'spring', visualDuration: 0.6, bounce: 0.2 },
  /** Cards "fly in from the first person" with a light overshoot. */
  aboutCards: { type: 'spring', visualDuration: 0.66, bounce: 0.3 },
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
    /** …and its parallax is weaker: the layer has receded into the depth. */
    parallaxFactor: 0.5,
  },
  heroOut: { durationMs: 450, staggerMs: 40, blurPx: 12, scale: 0.96, liftPx: 28 },
  /** Reverse path: part 1 reappears while the about cards fly towards the viewer. */
  heroIn: { delayMs: 320, durationMs: 620, staggerMs: 40 },
  aboutTitleIn: { delayMs: 350, fromScale: 1.2, fromBlurPx: 12, blurMs: 450 },
  aboutTitleOut: { durationMs: 320 },
  aboutCardsIn: { delayMs: 420, staggerMs: 80, fromScale: 1.6, fromBlurPx: 20, blurMs: 520 },
  /** Reverse: about cards fly towards the viewer (back to their entry scale and blur). */
  aboutCardsOut: { durationMs: 420 },
} as const;

export const DIALOG = {
  /** Content appears after this share of the expansion. */
  contentRevealAt: 0.6,
  contentStaggerMs: 50,
  /** On closing the text goes first and fast: the card it lies on starts shrinking at once. */
  contentExitS: 0.12,
  /** The team logo cross-fades into the card background during the first part of the expansion. */
  logoCrossfadeEnd: 0.18,
  /**
   * Radii of the shared element in mockup px (mirror of --radius-tile / --radius-dialog in tokens.css, checked by
   * tokens.test.ts): Motion animates and corrects the radius only from pixel values. Phones use a sheet radius.
   */
  tileRadius: 45,
  dialogRadius: 217,
  phoneDialogRadiusPx: 28,
  /** Phone tiles scale with the screen width against this frame. */
  phoneFrameWidth: 390,
} as const;

export const TILT = {
  featureCardMaxDeg: 9,
  ctaMaxDeg: 6,
  infoCardMaxDeg: 6,
  perspectivePx: 900,
  glareOpacity: 0.28,
  glareSizeRatio: 0.9,
  /** Parallax inside a tilting card: the content floats above the surface and shifts this far (px) at the edge. */
  depthPx: 7,
  /** The card rises a little towards the pointer. */
  liftScale: 0.025,
} as const;

/** Wheel/touchpad and swipe gestures (ТЗ 6.5). */
export const GESTURE = {
  wheelThresholdPx: 40,
  wheelWindowMs: 200,
  /** Inertia silencer: a new transition needs this much silence in wheel events. */
  wheelQuietMs: 220,
  /** A delta this big against the current gesture starts a new one (inertia never reverses). */
  wheelReverseMinPx: 4,
  swipeMinPx: 50,
  swipeDominance: 1.2,
  lineHeightPx: 16,
} as const;

/**
 * Corner morph of the team card (features/team-dialog/morph.ts), in the spirit of iOS 26: every corner flies on its
 * own spring. Opening — the corners with the longest way lead and overshoot a little, the near ones follow firmly,
 * so the card stretches open; closing is faster (≈70 %), the near corners snap back first and the far ones trail.
 */
export const MORPH = {
  open: {
    near: { stiffness: 260, damping: 25 },
    far: { stiffness: 165, damping: 16 },
    lagS: 0.07,
    lead: 'far',
  },
  close: {
    near: { stiffness: 340, damping: 33 },
    far: { stiffness: 250, damping: 26 },
    lagS: 0.06,
    lead: 'near',
  },
  /** A corner rests when it is this close to its target (px). */
  restPx: 0.5,
  maxStepS: 0.05,
} as const;
