import { describe, expect, it } from 'vitest';
import { coverRadius, localPoint, waveDuration } from './wave';

const size = { width: 200, height: 80 };

describe('wave radius', () => {
  it('reaches the farthest corner', () => {
    expect(coverRadius({ x: 0, y: 0 }, size)).toBeCloseTo(Math.hypot(200, 80), 9);
    expect(coverRadius({ x: 200, y: 80 }, size)).toBeCloseTo(Math.hypot(200, 80), 9);
    expect(coverRadius({ x: 100, y: 40 }, size)).toBeCloseTo(Math.hypot(100, 40), 9);
    expect(coverRadius({ x: 150, y: 10 }, size)).toBeCloseTo(Math.hypot(150, 70), 9);
  });

  it('a circle of that radius contains all four corners', () => {
    const p = { x: 37, y: 61 };
    const r = coverRadius(p, size);
    for (const [cx, cy] of [
      [0, 0],
      [200, 0],
      [0, 80],
      [200, 80],
    ] as const) {
      expect(Math.hypot(cx - p.x, cy - p.y)).toBeLessThanOrEqual(r + 1e-9);
    }
  });

  it('clamps pointer coordinates to the element box', () => {
    const rect = { left: 10, top: 20, width: 200, height: 80 } as DOMRectReadOnly;
    expect(localPoint(5, 15, rect)).toEqual({ x: 0, y: 0 });
    expect(localPoint(300, 200, rect)).toEqual({ x: 200, y: 80 });
    expect(localPoint(60, 50, rect)).toEqual({ x: 50, y: 30 });
  });

  it('duration is shorter for short distances and never exceeds the base', () => {
    expect(waveDuration(0, size, 0.42)).toBeCloseTo(0.252, 9);
    expect(waveDuration(Math.hypot(200, 80), size, 0.42)).toBeCloseTo(0.42, 9);
    expect(waveDuration(1000, size, 0.42)).toBe(0.42);
    expect(waveDuration(10, { width: 0, height: 0 }, 0.42)).toBe(0);
  });
});
