import { describe, expect, it } from 'vitest';
import { SCENE } from '../../motion/tokens';
import {
  assignSprites,
  ATTRACT,
  attractVelocity,
  cameraVisibleArea,
  createRandom,
  dissolveOpacity,
  edgePoint,
  FRESH_PROBE,
  maskHit,
  probeFrame,
  rebalanceSprite,
  repulsion,
  scatter,
  stepSpring,
  toLocal,
  wrap,
  type Spring,
} from './math';

describe('seeded random', () => {
  it('is deterministic for a seed and different for another', () => {
    const a = createRandom(123);
    const b = createRandom(123);
    const c = createRandom(124);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(seqA);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe('repulsion from open text', () => {
  const rect = { left: 100, top: 100, right: 300, bottom: 200 };

  it('is zero beyond the reach and grows when approaching', () => {
    expect(repulsion({ x: 500, y: 150 }, rect, 100, 1000)).toEqual({ x: 0, y: 0 });
    const far = repulsion({ x: 380, y: 150 }, rect, 100, 1000);
    const near = repulsion({ x: 320, y: 150 }, rect, 100, 1000);
    expect(far.x).toBeGreaterThan(0);
    expect(near.x).toBeGreaterThan(far.x);
    expect(near.y).toBeCloseTo(0, 9);
  });

  it('points away from the closest point, also diagonally', () => {
    const diagonal = repulsion({ x: 320, y: 220 }, rect, 100, 1000);
    expect(diagonal.x).toBeGreaterThan(0);
    expect(diagonal.y).toBeGreaterThan(0);
    expect(diagonal.x).toBeCloseTo(diagonal.y, 9);
  });

  it('pushes out through the nearest edge from inside', () => {
    expect(repulsion({ x: 110, y: 150 }, rect, 100, 1000)).toEqual({ x: -1000, y: 0 });
    expect(repulsion({ x: 200, y: 195 }, rect, 100, 1000)).toEqual({ x: 0, y: 1000 });
  });
});

describe('wrap-around', () => {
  it('teleports only fully hidden items, to a fully hidden spot on the other side', () => {
    const screen = { left: 0, top: 0, right: 800, bottom: 600 };
    expect(wrap({ x: -61, y: 50 }, 60, screen)).toEqual({ x: 860, y: 50 });
    expect(wrap({ x: -59, y: 50 }, 60, screen)).toEqual({ x: -59, y: 50 });
    expect(wrap({ x: 861, y: 50 }, 60, screen)).toEqual({ x: -60, y: 50 });
    expect(wrap({ x: 100, y: 661 }, 60, screen)).toEqual({ x: 100, y: -60 });
    expect(wrap({ x: 100, y: -61 }, 60, screen)).toEqual({ x: 100, y: 660 });
  });

  it('part 2: the edges of the area where the food wraps around are off screen under the camera', () => {
    const { scale, originX, originY } = SCENE.food;
    for (const [width, height] of [
      [1536, 730],
      [1920, 1080],
      [390, 844],
    ] as const) {
      const area = cameraVisibleArea(width, height, SCENE.food);
      const onScreen = (p: number, origin: number) => origin + (p - origin) * scale;
      const ox = originX * width;
      const oy = originY * height;
      expect(onScreen(area.left, ox)).toBeLessThanOrEqual(0.001);
      expect(onScreen(area.right, ox)).toBeGreaterThanOrEqual(width - 0.001);
      expect(onScreen(area.top, oy)).toBeLessThanOrEqual(0.001);
      expect(onScreen(area.bottom, oy)).toBeGreaterThanOrEqual(height - 0.001);
      // …and part 1 (no camera) never sees them either.
      expect(area.left).toBeLessThanOrEqual(0);
      expect(area.top).toBeLessThanOrEqual(0);
      expect(area.right).toBeGreaterThanOrEqual(width);
      expect(area.bottom).toBeGreaterThanOrEqual(height);
    }
  });

  it('wraps around a wider area than the screen (part 2 shows more of the plane)', () => {
    const area = { left: -40, top: -100, right: 860, bottom: 600 };
    expect(wrap({ x: -61, y: 50 }, 60, area)).toEqual({ x: -61, y: 50 });
    expect(wrap({ x: -101, y: 50 }, 60, area)).toEqual({ x: 920, y: 50 });
    expect(wrap({ x: 100, y: -161 }, 60, area)).toEqual({ x: 100, y: 660 });
    expect(wrap({ x: 100, y: 661 }, 60, area)).toEqual({ x: 100, y: -160 });
  });
});

describe('hit test by alpha mask', () => {
  // 32×32 mask with only the top-left quarter opaque.
  const mask = Uint32Array.from({ length: 32 }, (_, row) => (row < 16 ? 0xffff0000 : 0));

  it('maps a point into sprite space through rotation', () => {
    expect(toLocal({ x: 100, y: 100 }, { x: 100, y: 100 }, 200, 0)).toEqual({ x: 0.5, y: 0.5 });
    const rotated = toLocal({ x: 150, y: 100 }, { x: 100, y: 100 }, 200, 90);
    expect(rotated?.x).toBeCloseTo(0.5, 9);
    expect(rotated?.y).toBeCloseTo(0.25, 9);
    expect(toLocal({ x: 300, y: 100 }, { x: 100, y: 100 }, 200, 0)).toBeNull();
    expect(toLocal({ x: 100, y: 100 }, { x: 100, y: 100 }, 0, 0)).toBeNull();
  });

  it('hits only opaque pixels, not the bounding box', () => {
    expect(maskHit(mask, 32, { x: 0.1, y: 0.1 })).toBe(true);
    expect(maskHit(mask, 32, { x: 0.9, y: 0.1 })).toBe(false);
    expect(maskHit(mask, 32, { x: 0.1, y: 0.9 })).toBe(false);
    expect(maskHit(mask, 32, { x: 0.999, y: 0.999 })).toBe(false);
  });
});

describe('bounce spring', () => {
  it('overshoots to ≈1.18, dips below 1 and settles within ~450 ms', () => {
    let spring: Spring = { value: 1, velocity: 3.2 };
    let peak = 1;
    let trough = 1;
    let peaked = false;
    for (let t = 0; t < 0.6; t += 1 / 120) {
      spring = stepSpring(spring, 1 / 120, 180, 12);
      peak = Math.max(peak, spring.value);
      if (spring.velocity < 0) peaked = true;
      if (peaked) trough = Math.min(trough, spring.value);
    }
    expect(peak).toBeGreaterThan(1.12);
    expect(peak).toBeLessThan(1.24);
    expect(trough).toBeLessThan(1);
    expect(trough).toBeGreaterThan(0.9);
    expect(Math.abs(spring.value - 1)).toBeLessThan(0.02);
  });
});

describe('adaptive quality probe', () => {
  const limits = { windowMs: 2000, minFps: 50, slowWindows: 2 };
  /** Feeds frames at `fps` from `from` for `ms`; true if the probe asked to lower the quality. */
  const run = (probe: typeof FRESH_PROBE, from: number, ms: number, fps: number, calmFrom = 0) => {
    let state = probe;
    let lowered = false;
    for (let now = from; now <= from + ms; now += 1000 / fps) {
      const result = probeFrame(state, now, calmFrom, limits);
      state = result.probe;
      lowered ||= result.lower;
    }
    return { state, lowered };
  };

  it('one slow window (a busy moment) does not lower the quality, a steady slowness does', () => {
    const busy = run(FRESH_PROBE, 0, 2100, 30);
    expect(busy.lowered).toBe(false);
    expect(run(busy.state, 2100, 2100, 140).lowered).toBe(false);
    expect(run(FRESH_PROBE, 0, 4300, 30).lowered).toBe(true);
  });

  it('a fast window in between starts the count over', () => {
    const first = run(FRESH_PROBE, 0, 2100, 30);
    const fast = run(first.state, 2100, 2100, 140);
    expect(fast.state.slowWindows).toBe(0);
    expect(run(fast.state, 4200, 2100, 30).lowered).toBe(false);
  });

  it('counts nothing before the calm moment (the page warming up)', () => {
    const warmup = run(FRESH_PROBE, 0, 4000, 20, 4000);
    expect(warmup.lowered).toBe(false);
    expect(warmup.state.slowWindows).toBe(0);
  });
});

describe('placement', () => {
  it('scatters points apart, outside the avoided rects, deterministically', () => {
    const avoid = [{ left: 0, top: 0, right: 400, bottom: 300 }];
    const a = scatter(createRandom(7), 12, 1920, 1080, 300, avoid);
    const b = scatter(createRandom(7), 12, 1920, 1080, 300, avoid);
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
    for (const p of a) expect(p.x > 400 || p.y > 300).toBe(true);
    for (let i = 0; i < a.length; i += 1) {
      for (let j = i + 1; j < a.length; j += 1) {
        const pi = a[i];
        const pj = a[j];
        if (pi && pj) expect(Math.hypot(pi.x - pj.x, pi.y - pj.y)).toBeGreaterThan(200);
      }
    }
  });

  it('assigns sprites evenly and never the same sprite to close neighbours', () => {
    const points = scatter(createRandom(3), 12, 1920, 1080, 300, []);
    const sprites = assignSprites(createRandom(3), points, 9, 450);
    const counts = new Array<number>(9).fill(0);
    sprites.forEach((s) => {
      counts[s] = (counts[s] ?? 0) + 1;
    });
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    points.forEach((p, i) => {
      points.forEach((q, j) => {
        if (i !== j && Math.hypot(p.x - q.x, p.y - q.y) < 450)
          expect(sprites[i]).not.toBe(sprites[j]);
      });
    });
  });
});

describe('the finale attractor', () => {
  const core = { x: 500, y: 400, radiusPx: 60 };

  it('pulls inward and swirls around the core, faster closer in', () => {
    const far = attractVelocity({ x: 1300, y: 400 }, core);
    expect(far.x).toBeLessThan(0);
    const near = attractVelocity({ x: 600, y: 400 }, core);
    expect(Math.abs(near.y)).toBeGreaterThan(Math.abs(far.y));
    expect(attractVelocity({ x: 500, y: 400 }, core)).toEqual({ x: 0, y: 0 });
  });

  it('dissolves inside its ring and is gone at the edge of the core', () => {
    expect(dissolveOpacity(core.radiusPx * ATTRACT.dissolveFrom + 1, core.radiusPx)).toBe(1);
    expect(dissolveOpacity(core.radiusPx * ATTRACT.dissolveTo, core.radiusPx)).toBe(0);
    const mid = dissolveOpacity(core.radiusPx * 1.5, core.radiusPx);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('respawns just outside the area', () => {
    const random = createRandom(5);
    const area = { left: 0, top: 0, right: 800, bottom: 600 };
    for (let i = 0; i < 50; i += 1) {
      const p = edgePoint(random, area, 20);
      expect(p.x <= -20 || p.x >= 820 || p.y <= -20 || p.y >= 620).toBe(true);
    }
  });
});

describe('rebalanceSprite', () => {
  const random = createRandom(7);

  it('moves a repeated item onto a sprite that is not on the field', () => {
    // Nine sprites on thirteen items, then six new ones arrive unused.
    const usage = [2, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];
    const next = rebalanceSprite(random, usage, 0);
    expect(next).toBeGreaterThanOrEqual(9);
    expect(usage[next]).toBe(0);
  });

  it('with fewer items than sprites, brings in the unused ones over time', () => {
    const usage = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
    const next = rebalanceSprite(random, usage, 3);
    expect(usage[next]).toBe(0);
  });

  it('keeps an item when every sprite is used as often', () => {
    const usage = Array.from({ length: 15 }, () => 1);
    for (let current = 0; current < 15; current += 1) {
      expect(rebalanceSprite(random, usage, current)).toBe(-1);
    }
  });
});
