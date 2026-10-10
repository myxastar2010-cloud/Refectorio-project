import type { TasteAnswer } from '@refectorio/contracts';
import { TINDER } from '../../../motion/tokens';

/**
 * Swipe decisions of the dish card (ТЗ §9.1), pure and unit-tested: right — like, left — dislike, down — skip;
 * a swipe commits beyond a share of the card or by a fling; anything else springs back.
 */
export type Sample = { readonly t: number; readonly x: number; readonly y: number };

/** Velocity (px/s) from the samples of the last ~100 ms. */
export function velocityOf(samples: readonly Sample[], windowMs = 100): { vx: number; vy: number } {
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

/** Upward drags are resisted (there is no «up» answer). */
export const resistUp = (dy: number) => (dy < 0 ? dy * 0.35 : dy);

export function decideSwipe(
  offset: { readonly x: number; readonly y: number },
  velocity: { readonly vx: number; readonly vy: number },
  card: { readonly width: number; readonly height: number },
): TasteAnswer | null {
  const horizontal = Math.abs(offset.x) >= Math.abs(offset.y) * 0.8;
  const flungX =
    Math.abs(velocity.vx) > TINDER.flingPxS && Math.sign(velocity.vx) === Math.sign(offset.x);
  if (
    horizontal &&
    (Math.abs(offset.x) > card.width * TINDER.commitShare || flungX) &&
    offset.x !== 0
  ) {
    return offset.x > 0 ? 'like' : 'dislike';
  }
  const flungDown = velocity.vy > TINDER.flingPxS && Math.abs(velocity.vx) < velocity.vy;
  if (
    !horizontal &&
    offset.y > 0 &&
    (offset.y > card.height * TINDER.commitDownShare || flungDown)
  ) {
    return 'skip';
  }
  return null;
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
