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
  /** The scrim leaves with the closing card (1.5× faster than opening). */
  scrimOut: 0.26,
  toast: 0.3,
} as const;

export const SPRING = {
  press: { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 },
  tilt: { type: 'spring', stiffness: 180, damping: 20, mass: 0.6 },
  /** The glare glides after the pointer, softer than the tilt. */
  glare: { type: 'spring', stiffness: 110, damping: 21, mass: 0.6 },
  /** Team card expansion (shared element). */
  expand: { type: 'spring', visualDuration: 0.55, bounce: 0.12 },
  /** Text of the opened team card rises into place with a light bounce. */
  dialogContent: { type: 'spring', visualDuration: 0.45, bounce: 0.25 },
  /** Part 1 settles back with a light overshoot. */
  heroIn: { type: 'spring', visualDuration: 0.62, bounce: 0.2 },
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
  /** Part 2 title comes into focus like the cards: blur only, no change of size. */
  aboutTitleIn: { delayMs: 330, fromBlurPx: 16, blurMs: 560, fadeMs: 180 },
  aboutTitleOut: { durationMs: 320 },
  /** Part 2 cards come into focus from a strong blur — no scale, no dimming: a short fade, a long sharpening. */
  aboutCardsIn: { delayMs: 380, staggerMs: 80, fromBlurPx: 28, blurMs: 720, fadeMs: 160 },
  /** Reverse: about cards fly towards the viewer (back to their entry scale and blur). */
  /** …and leave by blurring away; they fade only in the last part of it. */
  aboutCardsOut: { durationMs: 380, fadeMs: 170 },
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
  featureCardMaxDeg: 11,
  ctaMaxDeg: 7,
  infoCardMaxDeg: 8,
  perspectivePx: 800,
  /** The glare's brightness away from the light (0…1); at the top-left corner it is full. */
  glareFloor: 0.3,
  /** Light from the top left: the full shine fades out until px + py reaches this (0…2). */
  lightReach: 1.2,
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
 * Corner morph of the team card (features/team-dialog/morph.ts), in the spirit of iOS 26: every corner is drawn to its
 * place on its own critically damped spring (damping = 2·√stiffness) — no bounce, like attracted by a magnet. Opening —
 * the corners with the longest way go first and the card stretches towards its place, the near ones follow; closing —
 * the near corners return to the icon first and the far ones trail well behind, so the card visibly stretches back.
 */
export const MORPH = {
  open: {
    near: { stiffness: 230, damping: 30.3 },
    far: { stiffness: 150, damping: 24.5 },
    lagS: 0.08,
    lead: 'far',
  },
  /*
   * Closing is 1.5× faster than opening (95 % of the way: ≈0.26 s against ≈0.39 s) and more pronounced: the near
   * corners snap back to the icon at once (≈0.17 s), the far ones trail by 70 ms — the card is visibly sucked in.
   */
  close: {
    near: { stiffness: 780, damping: 55.9 },
    far: { stiffness: 620, damping: 49.8 },
    lagS: 0.07,
    lead: 'near',
  },
  /** A corner rests when it is this close to its target (px). */
  restPx: 0.5,
  maxStepS: 0.05,
  /** Opening waits at most this long for the card picture to be decoded before the flight starts. */
  startWaitMs: 120,
} as const;

/**
 * The team name «translates» itself under the mouse (features/team-dialog/NameFlip.tsx): a blur wave runs from the
 * cursor through the letters — each one is pushed away from it, blurs and fades (nearer letters first and harder),
 * and the letters of the other name fly into place behind the wave with a light bounce.
 */
export const NAME_FLIP = {
  /** How fast the wave runs from the cursor through the letters (≈0.3 s across the name). */
  waveSpeedPxS: 1100,
  pushPx: 22,
  spinDeg: 12,
  blurPx: 8,
  outScale: 0.86,
  outS: 0.32,
  /** An impulse: a sharp start and a soft end. */
  outEase: [0.22, 1, 0.36, 1],
  /** Incoming letters start from this share of the push, slightly enlarged, and settle with a bounce. */
  inFromShare: 0.8,
  inScale: 1.14,
  inS: 0.5,
  inBounce: 0.32,
  inLagS: 0.07,
} as const;
