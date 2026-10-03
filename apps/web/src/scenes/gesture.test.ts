import { describe, expect, it } from 'vitest';
import { GESTURE } from '../motion/tokens';
import { createWheelGesture, keyDirection, normalizeWheelDelta, swipeDirection } from './gesture';

const options = {
  thresholdPx: GESTURE.wheelThresholdPx,
  windowMs: GESTURE.wheelWindowMs,
  quietMs: GESTURE.wheelQuietMs,
};

describe('normalizeWheelDelta', () => {
  it('converts lines and pages to pixels', () => {
    expect(normalizeWheelDelta(3, 0, 900)).toBe(3);
    expect(normalizeWheelDelta(3, 1, 900)).toBe(48);
    expect(normalizeWheelDelta(-1, 2, 900)).toBe(-900);
  });
});

describe('wheel gesture', () => {
  it('a single mouse-wheel notch (100 px) triggers once', () => {
    const g = createWheelGesture(options);
    expect(g.push(100, 0, false)).toBe('down');
  });

  it('small touchpad deltas accumulate inside the window', () => {
    const g = createWheelGesture(options);
    expect(g.push(15, 0, false)).toBeNull();
    expect(g.push(15, 16, false)).toBeNull();
    expect(g.push(15, 32, false)).toBe('down');
  });

  it('a slow drift spread beyond the window does not trigger', () => {
    const g = createWheelGesture(options);
    for (let t = 0; t < 2000; t += 150) expect(g.push(10, t, false)).toBeNull();
  });

  it('a touchpad fling with a long inertia tail gives exactly one transition', () => {
    const g = createWheelGesture(options);
    const results: (string | null)[] = [];
    // 2.5 s of decaying deltas every 16 ms; the transition locks input for 1150 ms after the first trigger.
    let lockedUntil = -1;
    for (let t = 0, delta = 120; t < 2500; t += 16, delta *= 0.97) {
      const result = g.push(Math.max(1, delta), t, t < lockedUntil);
      if (result) lockedUntil = t + 1150;
      results.push(result);
    }
    expect(results.filter(Boolean)).toEqual(['down']);
  });

  it('after the inertia tail, a pause ≥ quietMs allows the next gesture (in the other direction too)', () => {
    const g = createWheelGesture(options);
    expect(g.push(100, 0, false)).toBe('down');
    expect(g.push(80, 100, true)).toBeNull();
    // 1200 ms of silence > quietMs: a new gesture.
    expect(g.push(-60, 1300, false)).toBe('up');
  });

  it('events during a running transition are swallowed and keep the gesture consumed', () => {
    const g = createWheelGesture(options);
    expect(g.push(100, 0, true)).toBeNull();
    expect(g.push(100, 100, false)).toBeNull();
    expect(g.push(100, 100 + GESTURE.wheelQuietMs + 1, false)).toBe('down');
  });

  it('a key or button transition consumes the current gesture', () => {
    const g = createWheelGesture(options);
    expect(g.push(10, 0, false)).toBeNull();
    g.consume();
    expect(g.push(100, 10, false)).toBeNull();
  });

  it('zero deltas are ignored', () => {
    expect(createWheelGesture(options).push(0, 0, false)).toBeNull();
  });
});

describe('swipe and keys', () => {
  const swipe = { minPx: GESTURE.swipeMinPx, dominance: GESTURE.swipeDominance };

  it('vertical swipes beyond 50 px and 1.2×|dx|', () => {
    expect(swipeDirection(0, -80, swipe)).toBe('down');
    expect(swipeDirection(10, 90, swipe)).toBe('up');
    expect(swipeDirection(0, 40, swipe)).toBeNull();
    expect(swipeDirection(100, 110, swipe)).toBeNull();
  });

  it('maps keys to directions', () => {
    expect(keyDirection('ArrowDown', false)).toBe('down');
    expect(keyDirection('PageDown', false)).toBe('down');
    expect(keyDirection('End', false)).toBe('down');
    expect(keyDirection(' ', false)).toBe('down');
    expect(keyDirection(' ', true)).toBe('up');
    expect(keyDirection('ArrowUp', false)).toBe('up');
    expect(keyDirection('PageUp', false)).toBe('up');
    expect(keyDirection('Home', false)).toBe('up');
    expect(keyDirection('Enter', false)).toBeNull();
  });
});
