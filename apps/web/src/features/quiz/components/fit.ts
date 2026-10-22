/**
 * The fit of a step (stage 3, 4.11): no step ever scrolls. `--fit` (≤ 1, in steps of 0.01) scales the step's unit —
 * type, gaps, icons and controls together, down to the floors in quiz.css — to the largest value at which the step,
 * as it may still grow once shown (quiz.css «[data-fit-measure]»), fits the window. Found in at most three measuring
 * passes before the step enters, so the scale never changes during an animation; pure and unit-tested.
 */
export const FIT = {
  /**
   * Text, controls and inputs keep their floors (quiz.css) at any fit; below this the gaps and icons would vanish.
   * A step that does not fit here switches to its compact layout.
   */
  min: 0.4,
  step: 0.01,
  /** Height a step may overflow by and still count as fitting (sub-pixel rounding). */
  tolerancePx: 1,
} as const;

/** Rounds a fit down to its step, within [FIT.min, 1]. */
export const roundFit = (value: number) =>
  Math.min(
    1,
    Math.max(FIT.min, Math.round(Math.floor(value / FIT.step + 1e-9) * FIT.step * 100) / 100),
  );

export type FitResult = {
  readonly fit: number;
  /** False: even at the smallest fit the step is taller than the window. */
  readonly fits: boolean;
  readonly passes: number;
};

/**
 * The largest fit (to its step) at which `measure(fit)` — the height the step needs — is at most `available`, in three
 * passes at most: the full size; the smallest fit (if even that is too tall, the step does not fit); then the point
 * where the chord between the two reaches the available height. Sizes are linear in the fit until they hit their
 * floors, where they stop shrinking — so the height is convex in the fit, lies under that chord, and the chord's point
 * always fits; on a straight line it is exactly the largest fit.
 */
export function solveFit(measure: (fit: number) => number, available: number): FitResult {
  const room = available + FIT.tolerancePx;
  const h1 = measure(1);
  if (h1 <= room) return { fit: 1, fits: true, passes: 1 };
  const hMin = measure(FIT.min);
  if (hMin > room) return { fit: FIT.min, fits: false, passes: 2 };
  const share = h1 > hMin ? (available - hMin) / (h1 - hMin) : 0;
  const fit = roundFit(FIT.min + (1 - FIT.min) * share);
  if (fit <= FIT.min) return { fit: FIT.min, fits: true, passes: 2 };
  // A wrapped line could still break the convexity: then the smallest fit, which is known to fit.
  return measure(fit) <= room
    ? { fit, fits: true, passes: 3 }
    : { fit: FIT.min, fits: true, passes: 3 };
}

/**
 * Windows this small may scroll a step instead (WCAG 1.4.10 / 1.4.4: a browser zoomed to 400 % on a laptop is
 * 384 × 182): the fit leaves them alone. 300 px rather than the 360 of the brief, so a phone on its side with the
 * browser's own bars (844 × 340) still fits without a scroll (D-050).
 */
export const tooSmallToFit = (width: number, height: number) => height < 300 || width < 320;

/**
 * Measures and sets the fit of a screen: with the worst-case reserves of quiz.css on, the frame's natural height
 * (its min-height released) against the screen's. A step that does not fit at the smallest fit gets its compact
 * layout (`data-compact`) and is fitted again.
 */
export function fitScreen(screen: HTMLElement): FitResult {
  const frame = screen.firstElementChild;
  if (!(frame instanceof HTMLElement) || tooSmallToFit(window.innerWidth, window.innerHeight)) {
    screen.style.removeProperty('--fit');
    return { fit: 1, fits: true, passes: 0 };
  }
  const available = screen.clientHeight;
  const previousMin = frame.style.minHeight;
  screen.setAttribute('data-fit-measure', '');
  frame.style.minHeight = '0';
  const measure = (fit: number) => {
    screen.style.setProperty('--fit', fit.toFixed(2));
    return frame.offsetHeight;
  };
  screen.removeAttribute('data-compact');
  screen.removeAttribute('data-overflow');
  let result = solveFit(measure, available);
  if (!result.fits) {
    screen.setAttribute('data-compact', '');
    result = solveFit(measure, available);
  }
  // Even compact at the floors it is taller than the window: the last resort, it scrolls inside (quiz.css, D-050).
  if (!result.fits) screen.setAttribute('data-overflow', '');
  screen.style.setProperty('--fit', result.fit.toFixed(2));
  frame.style.minHeight = previousMin;
  screen.removeAttribute('data-fit-measure');
  return result;
}

/** The step as it is now (no reserves) is taller than its screen: it grew beyond what the fit reserved. */
export function overflows(screen: HTMLElement): boolean {
  const frame = screen.firstElementChild;
  if (!(frame instanceof HTMLElement)) return false;
  const previousMin = frame.style.minHeight;
  frame.style.minHeight = '0';
  const needed = frame.offsetHeight;
  frame.style.minHeight = previousMin;
  return needed > screen.clientHeight + FIT.tolerancePx;
}
