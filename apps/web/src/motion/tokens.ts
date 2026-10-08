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
/**
 * Blur of content coming into focus: it holds the blur and sharpens at the end. A small blur (≈0.5–4 px) is the most
 * expensive one for the GPU — it is computed at full resolution, a larger one on a smaller copy — so blurs pass
 * through that range quickly: coming in with this curve, going away with EASE_OUT_SOFT (D-029, GPU traces on an
 * integrated Intel GPU: ≈4× less GPU time per transition).
 */
export const EASE_FOCUS_IN = [0.55, 0, 0.8, 0.25] as const;

export const DURATION = {
  /** Hover/press feedback of small controls. */
  micro: 0.22,
  /** WaveHover: the circle grows to the far corner / shrinks to the exit point. */
  wave: 0.42,
  /** Tap wave on touch screens: it fills the button, then the button acts (WAVE). */
  waveTap: 0.34,
  /** Reduced motion: every transition becomes a cross-fade of this length. */
  fade: 0.2,
  scrim: 0.35,
  /** The scrim leaves with the closing card (1.5× faster than opening). */
  scrimOut: 0.26,
  toast: 0.3,
} as const;

/** The wave on touch screens (motion/useWave.ts): a tap fills the button completely before its action runs. */
export const WAVE = {
  /** Even, visible growth all the way (the expo curve would look finished long before it is). */
  tapEase: [0.3, 0, 0.2, 1],
  /** A click this soon after a touch on the same button is that tap. */
  tapClickWindowMs: 1000,
  /** The filled button stays filled this long after its action. */
  tapHoldMs: 140,
  /** Safety margin over the fill duration before the action runs anyway. */
  tapGraceMs: 80,
  /** A touch that ends without a click (a scroll, a long press): the wave goes after this. */
  tapNoClickMs: 500,
} as const;

export const SPRING = {
  press: { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 },
  tilt: { type: 'spring', stiffness: 180, damping: 20, mass: 0.6 },
  /** The glare glides after the pointer, softer than the tilt. */
  glare: { type: 'spring', stiffness: 110, damping: 21, mass: 0.6 },
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
    /** …that point, in shares of the viewport (mirror of --food-about-origin-x/y in tokens.css). */
    originX: 0.4026,
    originY: 1.3741,
    opacity: 0.6,
    blurCrossfadeStartMs: 100,
    blurCrossfadeEndMs: 600,
    /** The about scene may slow the food down. */
    speedFactor: 0.7,
  },
  heroOut: { durationMs: 450, staggerMs: 40, blurPx: 8, scale: 0.96, liftPx: 28 },
  /** Reverse path: part 1 reappears while the about cards fly towards the viewer. */
  heroIn: { delayMs: 320, durationMs: 620, staggerMs: 40 },
  /** Part 2 title comes into focus like the cards: blur only, no change of size. */
  aboutTitleIn: { delayMs: 330, fromBlurPx: 6, blurMs: 440, fadeMs: 260 },
  aboutTitleOut: { durationMs: 320 },
  /**
   * Part 2 cards come into focus from a light blur — no scale, no dimming (D-028: calmer than the first 28 px):
   * a soft fade, then they sharpen (EASE_FOCUS_IN).
   */
  aboutCardsIn: { delayMs: 380, staggerMs: 60, fromBlurPx: 8, blurMs: 480, fadeMs: 280 },
  /** Reverse: the cards blur away at once (an ease-out: the scroll gets an answer right away) and fade. */
  aboutCardsOut: { durationMs: 340, fadeMs: 260 },
} as const;

export const DIALOG = {
  /** The text comes in once the card is this far open (by its shape, see useCornerMorph onReveal). */
  contentRevealAt: 0.7,
  contentStaggerMs: 50,
  /** On closing the text goes first and fast: the card it lies on starts shrinking at once. */
  contentExitS: 0.12,
  /** The icon's logo on top of the card fades out over this first share of the way (it is the same picture). */
  logoCrossfadeEnd: 0.16,
  /** Up to this openness the picture stays docked on the icon, then it glides to its open-card place. */
  dockedBelow: 0.08,
  /**
   * The card picture — «дизайн раскрытой команды для телефона» (958×1521), the same star as the team icon: the icon is
   * its square at (138.5, 129) of side 694 (matched pixel by pixel, design/analysis/08_star_dock.py). Phones show the
   * whole picture; landscape cards (desktop, tablets) show a band of it at the card's width with the star near the
   * top, as in the desktop mockup (object-position y = focusY). Mirror of .team-surface-picture in components.css.
   */
  picture: {
    width: 958,
    height: 1521,
    focusY: 0.3543,
    icon: { x: 138.5, y: 129, size: 694 },
  },
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

/**
 * Wheel/touchpad and swipe gestures (ТЗ 6.5). One wheel notch must be enough whatever the system setting: with
 * «1 line per notch» in Windows a notch is ≈33 px in Chromium and 1 line (16 px) in Firefox.
 */
export const GESTURE = {
  wheelThresholdPx: 8,
  wheelWindowMs: 200,
  /** Inertia silencer: a new transition needs this much silence in wheel events. */
  wheelQuietMs: 220,
  /** A delta this big against the current gesture starts a new one (inertia never reverses). */
  wheelReverseMinPx: 4,
  /** A short swipe is enough; it switches as soon as the finger has moved this far (not on release). */
  swipeMinPx: 24,
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
 * The team name «translates» itself under the mouse (features/team-dialog/NameFlip.tsx): a light wave runs from the
 * cursor through the letters — each one drifts a few pixels away from it and fades, the nearest first — and the
 * letters of the other name settle into place behind the wave. Only transform and opacity: no filters on the
 * letters (a blur animated per letter left bright rectangles on some GPUs and cost frames).
 */
export const NAME_FLIP = {
  /** How fast the wave runs from the cursor through the letters (≈0.25 s across the name). */
  waveSpeedPxS: 1400,
  pushPx: 7,
  outScale: 0.97,
  outS: 0.22,
  outEase: [0.33, 1, 0.68, 1],
  /** Incoming letters come from a little behind the wave (towards the cursor) and settle without a bounce. */
  inFromShare: 0.7,
  inScale: 1.03,
  inS: 0.38,
  inEase: [0.16, 1, 0.3, 1],
  inLagS: 0.05,
  /** The way back starts only if the cursor stays away this long (no flicker at the edge). */
  leaveDelayMs: 90,
} as const;
