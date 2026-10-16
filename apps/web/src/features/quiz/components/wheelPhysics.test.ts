import { describe, expect, it } from 'vitest';
import { WHEEL } from '../../../motion/tokens';
import {
  drum,
  flingTarget,
  indexOf,
  itemCount,
  parseTyped,
  releaseVelocity,
  rubberBand,
  valueAt,
  wheelSteps,
} from './wheelPhysics';

const age = { min: 1, max: 100, step: 1 };

describe('wheel picker maths', () => {
  it('maps values to item indices and back', () => {
    expect(itemCount(age)).toBe(100);
    expect(valueAt(age, 29)).toBe(30);
    expect(indexOf(age, 30)).toBe(29);
    expect(indexOf({ min: 5, max: 250, step: 1 }, 70.5)).toBe(65.5);
  });

  it('a slow release snaps to the nearest value, a flick glides v/friction further', () => {
    expect(flingTarget(10.4, 0.5, 100)).toBe(10);
    expect(flingTarget(10.6, -0.5, 100)).toBe(11);
    expect(flingTarget(10, 21, 100)).toBe(Math.round(10 + 21 / WHEEL.friction));
    expect(flingTarget(10, -21, 100)).toBe(Math.round(10 - 21 / WHEEL.friction));
  });

  it('never leaves the range; reduced motion has no momentum', () => {
    expect(flingTarget(95, 500, 100)).toBe(99);
    expect(flingTarget(2, -500, 100)).toBe(0);
    expect(flingTarget(10, 40, 100, true)).toBe(10);
  });

  it('release speed comes from the last 100 ms of samples', () => {
    expect(
      releaseVelocity([
        { t: 0, offset: 0 },
        { t: 950, offset: 1 },
        { t: 1000, offset: 3 },
      ]),
    ).toBeCloseTo(40, 6);
    expect(releaseVelocity([{ t: 5, offset: 2 }])).toBe(0);
    expect(releaseVelocity([])).toBe(0);
  });

  it('resists beyond the ends', () => {
    expect(rubberBand(-3, 100)).toBe(-1);
    expect(rubberBand(102, 100)).toBe(100);
    expect(rubberBand(50, 100)).toBe(50);
  });

  it('the drum: the centre is full size and opaque, far items fade and hide past 90°', () => {
    const centre = drum(0, 64);
    expect(centre).toMatchObject({ visible: true, y: 0, scaleY: 1, scale: 1, opacity: 1 });
    const near = drum(1, 64);
    expect(near.y).toBeGreaterThan(0);
    expect(near.opacity).toBeLessThan(1);
    expect(drum(-1, 64).y).toBeCloseTo(-near.y, 9);
    expect(drum(6, 64).visible).toBe(false);
    expect(drum(6, 64).opacity).toBe(0);
    // Seven values at rest: the third neighbour is shown and readable, the fourth is gone.
    expect(drum(3, 64).opacity).toBeGreaterThan(0.45);
    expect(drum(4, 64).opacity).toBe(0);
    expect(drum(3.75, 64).opacity).toBeGreaterThan(0);
  });

  it('one mouse notch is one value; touchpad deltas add up', () => {
    expect(wheelSteps(33, 0, 0, 20)).toEqual({ steps: 1, carry: 0 });
    expect(wheelSteps(-120, 0, 0, 20)).toEqual({ steps: -1, carry: 0 });
    expect(wheelSteps(3, 1, 0, 20)).toEqual({ steps: 3, carry: 0 });
    const first = wheelSteps(12, 0, 0, 20);
    expect(first).toEqual({ steps: 0, carry: 12 });
    expect(wheelSteps(12, 0, first.carry, 20)).toEqual({ steps: 1, carry: 4 });
  });

  it('typed values: comma or dot, clamped and rounded', () => {
    const weight = { min: 5, max: 250, step: 1 };
    expect(parseTyped('70,5', weight, 1)).toEqual({ value: 70.5, clamped: false });
    expect(parseTyped(' 70.46 ', weight, 1)).toEqual({ value: 70.5, clamped: false });
    expect(parseTyped('400', weight, 1)).toEqual({ value: 250, clamped: true });
    expect(parseTyped('2', weight, 1)).toEqual({ value: 5, clamped: true });
    expect(parseTyped('abc', weight, 1)).toBeNull();
    expect(parseTyped('170,6', { min: 50, max: 230, step: 1 }, 0)).toEqual({
      value: 171,
      clamped: false,
    });
  });
});
