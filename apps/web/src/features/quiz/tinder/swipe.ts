import type { TasteAnswer } from '@refectorio/contracts';
import { TINDER } from '../../../motion/tokens';

/**
 * Gestures of the dish card (ТЗ §9.1, stage 3 §5.1, D-056), pure and unit-tested: right — like, left — dislike; down
 * opens the dish info, up closes it; a tap toggles it. A swipe commits beyond a share of the card or by a fling;
 * anything else springs back.
 */
export type Sample = { readonly t: number; readonly x: number; readonly y: number };

/** Velocity (px/s) from the samples of the last ~100 ms. */
export function velocityOf(
  samples: readonly Sample[],
  windowMs = TINDER.velocityWindowMs,
): { vx: number; vy: number } {
  const last = samples.at(-1);
  if (!last) return { vx: 0, vy: 0 };
  let first = last;
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const sample = samples[i];
    if (!sample || last.t - sample.t > windowMs) break;
    first = sample;
  }
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { vx: 0, vy: 0 };
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}

/**
 * The card follows a vertical drag only a little: towards the toggle (down when closed, up when open) it gives way,
 * the other way it is a rubber band with no action.
 */
export const pullFor = (dy: number, open: boolean) =>
  dy * (dy > 0 !== open ? TINDER.toggleFollow : TINDER.rubberBand);

export type Gesture =
  | { readonly kind: 'answer'; readonly answer: Exclude<TasteAnswer, 'skip'> }
  | { readonly kind: 'toggle' }
  | null;

/**
 * A released drag: `move` is the finger's travel (px) and time (ms), `velocity` its speed at release. A short quick
 * touch is a tap (toggle); a horizontal drag is a decision; a vertical one toggles the info in its direction.
 */
export function decideGesture(
  move: { readonly dx: number; readonly dy: number; readonly ms: number },
  velocity: { readonly vx: number; readonly vy: number },
  card: { readonly width: number; readonly height: number },
  open: boolean,
): Gesture {
  const { dx, dy } = move;
  if (Math.hypot(dx, dy) < TINDER.tapMaxPx && move.ms < TINDER.tapMaxMs) return { kind: 'toggle' };
  if (Math.abs(dx) >= Math.abs(dy) * 0.8) {
    const flung =
      Math.abs(velocity.vx) > TINDER.flingPxS &&
      Math.sign(velocity.vx) === Math.sign(dx) &&
      Math.abs(dx) > card.width * TINDER.flingMinShare;
    if (dx !== 0 && (Math.abs(dx) > card.width * TINDER.commitShare || flung)) {
      return { kind: 'answer', answer: dx > 0 ? 'like' : 'dislike' };
    }
    return null;
  }
  // Down opens, up closes; the other way does nothing.
  const towards = open ? -dy : dy;
  const speed = open ? -velocity.vy : velocity.vy;
  const far = towards > Math.max(TINDER.toggleMinPx, card.height * TINDER.toggleShare);
  const flung = speed > TINDER.flingPxS && towards > TINDER.toggleMinPx / 2;
  return far || flung ? { kind: 'toggle' } : null;
}

/** Rotation follows the horizontal offset, up to ±maxRotateDeg at the commit distance. */
export const rotationFor = (x: number, width: number) =>
  Math.max(
    -TINDER.maxRotateDeg,
    Math.min(
      TINDER.maxRotateDeg,
      (x / Math.max(1, width * TINDER.commitShare)) * TINDER.maxRotateDeg * 0.6,
    ),
  );

/**
 * The fly-out (ТЗ §9.1: «the card leaves with the gesture's velocity»): constant acceleration from the release speed so
 * the card is off screen after `durationMs`; a faster release keeps its own speed.
 */
export function flightOf(distancePx: number, startSpeedPxS: number, durationMs: number) {
  const v0 = Math.max(0, startSpeedPxS);
  const t = durationMs / 1000;
  if (v0 * t >= distancePx) {
    return { durationS: distancePx / Math.max(v0, 1), accel: 0, v0 };
  }
  return { durationS: t, accel: (2 * (distancePx - v0 * t)) / (t * t), v0 };
}

/** Position along a flight after `s` seconds. */
export const flightAt = (flight: ReturnType<typeof flightOf>, s: number) =>
  flight.v0 * s + 0.5 * flight.accel * s * s;
