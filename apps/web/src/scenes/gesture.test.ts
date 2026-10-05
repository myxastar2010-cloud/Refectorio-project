import { describe, expect, it } from 'vitest';
import { GESTURE } from '../motion/tokens';
import {
  createWheelGesture,
  hasScrollRoom,
  keyDirection,
  keyScrollStepPx,
  normalizeWheelDelta,
  swipeDirection,
} from './gesture';

const options = {
  thresholdPx: GESTURE.wheelThresholdPx,
  windowMs: GESTURE.wheelWindowMs,
  quietMs: GESTURE.wheelQuietMs,
  reverseMinPx: GESTURE.wheelReverseMinPx,
};

describe('normalizeWheelDelta', () => {
  it('converts lines and pages to pixels', () => {
    expect(normalizeWheelDelta(3, 0, 900)).toBe(3);
    expect(normalizeWheelDelta(3, 1, 900)).toBe(48);
    expect(normalizeWheelDelta(-1, 2, 900)).toBe(-900);
  });
});

describe('wheel gesture', () => {
  it('a single mouse-wheel notch triggers once, whatever the system «lines per notch»', () => {
    // Chromium on Windows: 100 px with 3 lines per notch, 33 px with 1; Firefox: 1 line = 16 px.
    for (const notch of [100, 33.33, normalizeWheelDelta(1, 1, 900)]) {
      expect(createWheelGesture(options).push(notch, 0, false)).toBe('down');
    }
  });

  it('small touchpad deltas accumulate inside the window', () => {
    const g = createWheelGesture(options);
    expect(g.push(3, 0, false)).toBeNull();
    expect(g.push(3, 16, false)).toBeNull();
    expect(g.push(3, 32, false)).toBe('down');
  });

  it('a slow drift spread beyond the window does not trigger', () => {
    const g = createWheelGesture(options);
    for (let t = 0; t < 2000; t += 250) expect(g.push(3, t, false)).toBeNull();
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

  it('a stream reversed after the transition is a new gesture: inertia never changes direction', () => {
    const g = createWheelGesture(options);
    expect(g.push(90, 0, false)).toBe('down');
    // The tail goes on without a pause past the end of the lock…
    for (let t = 16; t <= 1200; t += 16) expect(g.push(20, t, t < 1150)).toBeNull();
    // …and the user flicks back at once: no quiet gap is needed.
    expect(g.push(-60, 1216, false)).toBe('up');
    expect(g.push(-50, 1232, false)).toBeNull();
  });

  it('a reversal during the running transition is swallowed with the rest of its stream', () => {
    const g = createWheelGesture(options);
    expect(g.push(100, 0, false)).toBe('down');
    expect(g.push(-60, 100, true)).toBeNull();
    expect(g.push(-60, 116, false)).toBeNull();
  });

  it('tiny opposite jitter inside a tail does not start a new gesture', () => {
    const g = createWheelGesture(options);
    expect(g.push(100, 0, false)).toBe('down');
    expect(g.push(-(GESTURE.wheelReverseMinPx - 1), 16, false)).toBeNull();
    expect(g.push(60, 32, false)).toBeNull();
  });

  it('a key or button transition consumes the current gesture', () => {
    const g = createWheelGesture(options);
    expect(g.push(4, 0, false)).toBeNull();
    g.consume();
    expect(g.push(100, 10, false)).toBeNull();
  });

  it('zero deltas are ignored', () => {
    expect(createWheelGesture(options).push(0, 0, false)).toBeNull();
  });
});

describe('scrolling inside a scene', () => {
  const box = (scrollTop: number) => ({ scrollTop, clientHeight: 500, scrollHeight: 800 });

  it('has room until the edge, in each direction', () => {
    expect(hasScrollRoom(box(0), 'up')).toBe(false);
    expect(hasScrollRoom(box(0), 'down')).toBe(true);
    expect(hasScrollRoom(box(150), 'up')).toBe(true);
    expect(hasScrollRoom(box(300), 'down')).toBe(false);
    // Sub-pixel scroll positions on high-density screens still count as the edge.
    expect(hasScrollRoom(box(299.5), 'down')).toBe(false);
    expect(hasScrollRoom(box(0.4), 'up')).toBe(false);
  });

  it('content that fits has no room at all', () => {
    expect(hasScrollRoom({ scrollTop: 0, clientHeight: 500, scrollHeight: 501 }, 'down')).toBe(
      false,
    );
  });

  it('arrows scroll a short step, page keys almost a screen', () => {
    expect(keyScrollStepPx('ArrowDown', 500)).toBe(75);
    expect(keyScrollStepPx('ArrowUp', 200)).toBe(40);
    expect(keyScrollStepPx('PageDown', 500)).toBe(425);
    expect(keyScrollStepPx(' ', 500)).toBe(425);
  });
});

describe('swipe and keys', () => {
  const swipe = { minPx: GESTURE.swipeMinPx, dominance: GESTURE.swipeDominance };

  it('short vertical swipes: beyond 24 px and 1.2×|dx|', () => {
    expect(swipeDirection(0, -30, swipe)).toBe('down');
    expect(swipeDirection(10, 40, swipe)).toBe('up');
    expect(swipeDirection(0, 20, swipe)).toBeNull();
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
