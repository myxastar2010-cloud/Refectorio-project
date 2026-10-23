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
  heroOut: { durationMs: 450, staggerMs: 40, blurPx: 12, scale: 0.96, liftPx: 28 },
  /** Reverse path: part 1 reappears while the about cards fly towards the viewer. */
  heroIn: { delayMs: 320, durationMs: 620, staggerMs: 40 },
  /** Part 2 title comes into focus like the cards: blur only, no change of size. */
  aboutTitleIn: { delayMs: 330, fromBlurPx: 8, blurMs: 460, fadeMs: 260 },
  aboutTitleOut: { durationMs: 320 },
  /**
   * Part 2 cards come into focus from a light blur — no scale, no dimming (D-028: calmer than the first 28 px):
   * a soft fade and a short sharpening.
   */
  aboutCardsIn: { delayMs: 380, staggerMs: 60, fromBlurPx: 10, blurMs: 540, fadeMs: 280 },
  /** Reverse: the cards blur away at once (an ease-out: the scroll gets an answer right away) and fade. */
  aboutCardsOut: { durationMs: 340, fadeMs: 260 },
} as const;

/**
 * «Цены» (#pricing): reached only by its button, left by its × or a scroll up. It comes and goes exactly like part 2
 * (SCENE.heroOut, aboutTitleIn, aboutCardsIn: the frame, then the two plans in cascade); the rest is its own.
 */
export const PRICING = {
  /** The frame and the two plan cards come into focus in this order (aboutCardVariants). */
  cards: 3,
  /** «Месяц» ⇄ «Год»: the black pill slides under the labels. */
  switchSpring: { type: 'spring', visualDuration: 0.36, bounce: 0.16 },
  /** A new price: the old one leaves upwards into a blur, the new one rises out of one. */
  price: { durationMs: 300, risePx: 12, blurPx: 6 },
  /**
   * Hover ring a little off the card: it draws itself from the top centre both ways round while easing out of the
   * card's edge, and fades back quickly.
   */
  ring: { drawMs: 560, growMs: 460, fromScale: 0.975, outMs: 200 },
  /**
   * «Ещё...»: the card's own text dissolves upwards, the fully blurred picture cross-fades in, then the rest of the
   * list rises line by line; closing is the mirror, faster.
   */
  more: {
    pictureMs: 520,
    outMs: 220,
    inDelayMs: 150,
    inMs: 440,
    staggerMs: 32,
    risePx: 14,
    blurPx: 6,
    backMs: 320,
  },
  /** The «Цены» button opens the scene once the chunk is here; it waits at most this long for the card pictures. */
  pictureWaitMs: 450,
} as const;

export const DIALOG = {
  /** The text comes in once the card is this far open (by its shape, see useCornerMorph onReveal). */
  contentRevealAt: 0.7,
  /**
   * The project card grows leftwards from its icon on the right: its left edge, where the text starts, arrives last.
   * Its text comes in later, so it never shows beyond the card.
   */
  projectRevealAt: 0.9,
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
  /** A text label as the anchor (the privacy sheet): the surface fades in and out over this first share of the way. */
  labelFadeBelow: 0.16,
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

/**
 * Quiz scene (stage 2, ТЗ §7). Entry mirrors hero → about: part 1 lifts and dissolves (heroVariants), the food
 * recedes (SCENE.food), the «О проекте» pill turns into «Выйти ×»; then the quiz header draws in and the first step
 * comes into focus. Times in ms from the click.
 */
export const QUIZ = {
  /** Input is locked while the scene changes (≈ hero → about). */
  inputLockMs: 1150,
  /** Food in the quiz: the about camera, slower drift. */
  foodSpeed: 0.65,
  /** Soft avoidance of the central column (share of the viewport width) and its strength (× FIELD default). */
  foodColumn: 0.42,
  foodAvoidStrength: 0.35,
  /** «О проекте» → «Выйти ×» label cross-fade. */
  pillLabel: { delayMs: 120, durationMs: 300 },
  header: { delayMs: 420, durationMs: 420 },
  firstStepDelayMs: 560,
  /** Step transition «blur dissolve» (ТЗ §7.6; radii and curves of stage 1, D-030). */
  stepOut: { durationMs: 320, blurPx: 12, scale: 0.98 },
  stepIn: { delayMs: 170, durationMs: 500, blurPx: 10, risePx: 12, staggerMs: 50 },
  /** A step enters once its icons and photos are decoded (4.5) — or after this, whichever is first. */
  imagesWaitMs: 300,
  /** Single choice: the wave completes, a small bounce, then the step changes (≤ ≈ 450 ms). */
  choice: { bounceScale: 0.96, pressMs: 80, settleMs: 140 },
  choiceSpring: { type: 'spring', visualDuration: 0.22, bounce: 0.3 },
  /** A chip toggles with a micro-bounce from this scale. */
  chipPressScale: 0.94,
  chipSpring: { type: 'spring', visualDuration: 0.2, bounce: 0.35 },
  /** Progress fill: a spring with a tiny settle. */
  progressSpring: { type: 'spring', visualDuration: 0.55, bounce: 0.12 },
  /** …and a light band that runs along the fill once when it grows (starts as the fill begins to move). */
  progressSheen: { durationMs: 750, delayMs: 60 },
  /** «Далее» / «Готово» rise in when the answer is complete. */
  continueIn: { durationMs: 360, risePx: 14 },
  /** «+» → add panel and row → picker panel (transform-only shape morph). */
  panelSpring: { stiffness: 420, damping: 38, mass: 0.9 },
  panelContentAt: 0.6,
  /** «Продолжаем с вопроса n»: long enough to read and reach «Начать заново»; paused under the pointer or focus. */
  toastMs: 12000,
  /** The quiz chunk is fetched on idle once the landing has settled — never during its first animations. */
  prefetchAfterMs: 5000,
  /** The finale's chunks are fetched on idle during the last steps. */
  finalePrefetchIdleMs: 2000,
  /** history.go() that never arrives (the browser trimmed old entries): reset without waiting for it. */
  historyFallbackMs: 600,
  /** Notice cards and sheets. */
  sheet: { durationMs: 340, risePx: 24 },
} as const;

/** The dish game «Выберите блюдо» (ТЗ §9.1). */
export const TINDER = {
  /** A swipe commits beyond this share of the card width (or by fling speed). */
  commitShare: 0.3,
  commitDownShare: 0.22,
  flingPxS: 650,
  /** …but a fling commits only after this share of the width (a twitch of the finger is not an answer). */
  flingMinShare: 0.12,
  maxRotateDeg: 12,
  /** The matching button swells as the card moves towards it. */
  buttonSwell: 0.18,
  /** Card flying away: its own speed, at least this fast. */
  flyMinPxS: 1400,
  flyDurationMs: 380,
  /** The next card rises from slightly behind. */
  nextFromScale: 0.94,
  nextFromOpacity: 0.55,
  springBack: { type: 'spring', stiffness: 520, damping: 32, mass: 0.8 },
  rise: { type: 'spring', visualDuration: 0.42, bounce: 0.14 },
  /** A second answer sooner than this after the previous one is a double tap, not a decision. */
  answerGapMs: 160,
  /** Pointer velocity is measured over the last samples of this window (cards and the wheel). */
  velocityWindowMs: 100,
  /** The next cards' photos are fetched on idle, at most this late. */
  lookaheadIdleMs: 300,
  /** «Запомнили…» appears when the flying card is this far gone. */
  momentAtShare: 0.6,
  /** The gentle hint after this many skips in a row (ТЗ §9.1). */
  skipHintAfter: 5,
  /** «Запомнили: …» moment after the last answer. */
  rememberedMs: 1400,
  /** A photo that has not arrived by now falls back to the next source of the chain. */
  photoTimeoutMs: 4000,
} as const;

/** Wheel picker physics (ТЗ §8.3): item units, seconds. Unit-tested in components/wheelPhysics.ts. */
export const WHEEL = {
  visible: 7,
  itemDeg: 18,
  /** Exponential friction of a flick (per second). */
  friction: 4.2,
  /** Below this speed (items/s) the wheel snaps. */
  snapSpeed: 1.2,
  snap: { stiffness: 260, damping: 30 },
  /** One mouse-wheel notch = one value, after this pause a new gesture starts. */
  wheelQuietMs: 70,
  maxFlingItemsS: 60,
} as const;

/** Generation finale (ТЗ §12). */
export const FINALE = {
  fillMs: 700,
  shimmerMs: 900,
  dotMs: 520,
  glideMs: 700,
  /** The dot grows into the full core. */
  introMs: 900,
  /** The first caption appears once the core has begun to grow. */
  firstCaptionMs: 350,
  captionMinMs: 2200,
  captionMaxMs: 3200,
  captionSpring: { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 },
  honestAfterMs: 40_000,
  revealDemoAfterMs: 6000,
  revealMs: 1600,
  canvasMaxPx: 520,
  dprMax: 2,
} as const;
