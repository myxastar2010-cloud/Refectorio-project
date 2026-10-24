import { describe, expect, it } from 'vitest';
import { TINDER } from '../../../motion/tokens';
import { decideGesture, flightAt, flightOf, pullFor, rotationFor, velocityOf } from './swipe';

const card = { width: 400, height: 520 };
const still = { vx: 0, vy: 0 };
const slow = (dx: number, dy: number) => ({ dx, dy, ms: 600 });
const toggleAt = Math.max(TINDER.toggleMinPx, card.height * TINDER.toggleShare);

describe('dish card gestures', () => {
  it('commits right/left beyond the share of the width, open or closed', () => {
    const past = card.width * TINDER.commitShare + 1;
    for (const open of [false, true]) {
      expect(decideGesture(slow(past, 10), still, card, open)).toEqual({
        kind: 'answer',
        answer: 'like',
      });
      expect(decideGesture(slow(-past, 10), still, card, open)).toEqual({
        kind: 'answer',
        answer: 'dislike',
      });
      expect(decideGesture(slow(past - 2, 0), still, card, open)).toBeNull();
    }
  });

  it('a short quick touch is a tap; the e2e 30 px drag is neither a tap nor a decision', () => {
    expect(decideGesture({ dx: 3, dy: 4, ms: 120 }, still, card, false)).toEqual({
      kind: 'toggle',
    });
    expect(decideGesture({ dx: 3, dy: 4, ms: 120 }, still, card, true)).toEqual({
      kind: 'toggle',
    });
    // A long press without moving is not a tap.
    expect(decideGesture({ dx: 2, dy: 2, ms: 900 }, still, card, false)).toBeNull();
    expect(decideGesture({ dx: 30, dy: 0, ms: 80 }, still, card, false)).toBeNull();
  });

  it('down opens and up closes; the other way does nothing', () => {
    expect(decideGesture(slow(4, toggleAt + 1), still, card, false)).toEqual({ kind: 'toggle' });
    expect(decideGesture(slow(4, -(toggleAt + 1)), still, card, true)).toEqual({
      kind: 'toggle',
    });
    expect(decideGesture(slow(4, toggleAt - 2), still, card, false)).toBeNull();
    // Down while open, up while closed: rubber band only.
    expect(decideGesture(slow(0, card.height), still, card, true)).toBeNull();
    expect(decideGesture(slow(0, -card.height), still, card, false)).toBeNull();
  });

  it('a fling commits a short drag in its own direction only', () => {
    const fast = TINDER.flingPxS + 1;
    const flick = card.width * TINDER.flingMinShare + 1;
    expect(decideGesture(slow(flick, 0), { vx: fast, vy: 0 }, card, false)).toEqual({
      kind: 'answer',
      answer: 'like',
    });
    expect(decideGesture(slow(flick, 0), { vx: -fast, vy: 0 }, card, false)).toBeNull();
    expect(decideGesture(slow(2, TINDER.toggleMinPx), { vx: 0, vy: fast }, card, false)).toEqual({
      kind: 'toggle',
    });
    expect(
      decideGesture(slow(2, TINDER.toggleMinPx), { vx: 0, vy: -fast }, card, false),
    ).toBeNull();
    // A twitch of the finger, however fast, is not an answer.
    expect(decideGesture(slow(20, 0), { vx: 5 * fast, vy: 0 }, card, false)).toBeNull();
  });

  it('vertical drags are damped (more the no-action way), rotation is bounded', () => {
    expect(pullFor(100, false)).toBeCloseTo(100 * TINDER.toggleFollow);
    expect(pullFor(-100, false)).toBeCloseTo(-100 * TINDER.rubberBand);
    expect(pullFor(-100, true)).toBeCloseTo(-100 * TINDER.toggleFollow);
    expect(pullFor(100, true)).toBeCloseTo(100 * TINDER.rubberBand);
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
    const slowFlight = flightOf(1000, 200, 400);
    expect(slowFlight.durationS).toBeCloseTo(0.4);
    expect(flightAt(slowFlight, slowFlight.durationS)).toBeCloseTo(1000);
    const fast = flightOf(1000, 5000, 400);
    expect(fast.accel).toBe(0);
    expect(fast.durationS).toBeCloseTo(0.2);
    expect(flightAt(fast, fast.durationS)).toBeCloseTo(1000);
  });
});
