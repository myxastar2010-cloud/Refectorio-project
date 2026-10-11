import { describe, expect, it } from 'vitest';
import { TINDER } from '../../../motion/tokens';
import { decideSwipe, flightAt, flightOf, resistUp, rotationFor, velocityOf } from './swipe';

const card = { width: 400, height: 520 };
const still = { vx: 0, vy: 0 };

describe('dish card swipes', () => {
  it('commits right/left beyond the share of the width, down beyond its own share', () => {
    const past = card.width * TINDER.commitShare + 1;
    expect(decideSwipe({ x: past, y: 10 }, still, card)).toBe('like');
    expect(decideSwipe({ x: -past, y: 10 }, still, card)).toBe('dislike');
    expect(decideSwipe({ x: 10, y: card.height * TINDER.commitDownShare + 1 }, still, card)).toBe(
      'skip',
    );
    expect(decideSwipe({ x: past - 2, y: 0 }, still, card)).toBeNull();
  });

  it('a fling commits a short drag in its own direction only', () => {
    const fast = TINDER.flingPxS + 1;
    const flick = card.width * TINDER.flingMinShare + 1;
    expect(decideSwipe({ x: flick, y: 0 }, { vx: fast, vy: 0 }, card)).toBe('like');
    expect(decideSwipe({ x: flick, y: 0 }, { vx: -fast, vy: 0 }, card)).toBeNull();
    expect(
      decideSwipe({ x: 4, y: card.height * TINDER.flingMinShare + 1 }, { vx: 0, vy: fast }, card),
    ).toBe('skip');
    expect(decideSwipe({ x: 0, y: -60 }, { vx: 0, vy: -fast }, card)).toBeNull();
    // A twitch of the finger, however fast, is not an answer.
    expect(decideSwipe({ x: 20, y: 0 }, { vx: 5 * fast, vy: 0 }, card)).toBeNull();
  });

  it('upward drags are resisted, rotation is bounded', () => {
    expect(resistUp(-100)).toBeCloseTo(-35);
    expect(resistUp(100)).toBe(100);
    expect(Math.abs(rotationFor(10_000, card.width))).toBe(TINDER.maxRotateDeg);
    expect(rotationFor(0, card.width)).toBe(0);
  });

  it('velocity from the last 100 ms of samples', () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 900, x: 0, y: 0 },
      { t: 950, x: 50, y: 10 },
      { t: 1000, x: 100, y: 20 },
    ];
    const v = velocityOf(samples);
    expect(v.vx).toBeCloseTo(1000);
    expect(v.vy).toBeCloseTo(200);
    expect(velocityOf([])).toEqual({ vx: 0, vy: 0 });
  });

  it('a card leaves the screen in the flight time, or sooner at its own speed', () => {
    const slow = flightOf(1000, 200, 400);
    expect(slow.durationS).toBeCloseTo(0.4);
    expect(flightAt(slow, slow.durationS)).toBeCloseTo(1000);
    const fast = flightOf(1000, 5000, 400);
    expect(fast.accel).toBe(0);
    expect(fast.durationS).toBeCloseTo(0.2);
    expect(flightAt(fast, fast.durationS)).toBeCloseTo(1000);
  });
});
