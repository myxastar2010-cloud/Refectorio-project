/**
 * Pure math of the flying-food engine (ТЗ 6.7). No DOM here — everything is unit-tested.
 */

export type Rect = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};
export type Vec = { readonly x: number; readonly y: number };

/** Deterministic PRNG (mulberry32): the same seed gives the same field (`?seed=123`). */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min: number, max: number) => min + (max - min) * next(),
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}
export type Random = ReturnType<typeof createRandom>;

/**
 * Soft repulsion from a rectangle (open text): acceleration away from the closest point of the rect,
 * growing quadratically as the item approaches; zero beyond `reach`. Inside the rect it pushes out
 * through the nearest edge. Units: px/s².
 */
export function repulsion(p: Vec, rect: Rect, reach: number, strength: number): Vec {
  const cx = Math.min(Math.max(p.x, rect.left), rect.right);
  const cy = Math.min(Math.max(p.y, rect.top), rect.bottom);
  let dx = p.x - cx;
  let dy = p.y - cy;
  let distance = Math.hypot(dx, dy);
  if (distance === 0) {
    // Inside: leave through the nearest edge.
    const toLeft = p.x - rect.left;
    const toRight = rect.right - p.x;
    const toTop = p.y - rect.top;
    const toBottom = rect.bottom - p.y;
    const nearest = Math.min(toLeft, toRight, toTop, toBottom);
    dx = nearest === toLeft ? -1 : nearest === toRight ? 1 : 0;
    dy = nearest === toTop ? -1 : nearest === toBottom ? 1 : 0;
    if (dx !== 0 && dy !== 0) dy = 0;
    return { x: dx * strength, y: dy * strength };
  }
  if (distance >= reach) return { x: 0, y: 0 };
  const falloff = (1 - distance / reach) ** 2;
  distance = Math.max(distance, 1e-6);
  return { x: (dx / distance) * strength * falloff, y: (dy / distance) * strength * falloff };
}

/**
 * Wrap-around: an item that has completely left the viewport re-enters from the opposite side, also completely
 * hidden — nothing pops out of thin air. `radius` is the half-diagonal of the rotated sprite.
 */
export function wrap(p: Vec, radius: number, width: number, height: number): Vec {
  let { x, y } = p;
  if (x + radius < 0) x = width + radius;
  else if (x - radius > width) x = -radius;
  if (y + radius < 0) y = height + radius;
  else if (y - radius > height) y = -radius;
  return { x, y };
}

/**
 * Point → sprite-local coordinates in [0, 1)² (u to the right, v down), undoing translation, rotation and scale.
 * Returns null when the point is outside the sprite square.
 */
export function toLocal(point: Vec, center: Vec, sizePx: number, angleDeg: number): Vec | null {
  if (sizePx <= 0) return null;
  const angle = (-angleDeg * Math.PI) / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
  const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
  const u = rx / sizePx + 0.5;
  const v = ry / sizePx + 0.5;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  return { x: u, y: v };
}

/** Is the 32×32 alpha mask opaque at local (u, v)? Rows are 32-bit, bit 31 = leftmost pixel. */
export function maskHit(mask: Uint32Array, size: number, local: Vec): boolean {
  const column = Math.min(size - 1, Math.floor(local.x * size));
  const row = Math.min(size - 1, Math.floor(local.y * size));
  const bits = mask[row] ?? 0;
  return ((bits >>> (size - 1 - column)) & 1) === 1;
}

/** Damped spring towards 1 for the click "bounce" (semi-implicit Euler, stable for dt ≤ 50 ms). */
/** Exponential smoothing towards a target with time constant `tauS` (frame-rate independent). */
export function smoothToward(current: number, target: number, dt: number, tauS: number): number {
  if (tauS <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tauS));
}

/**
 * Pointer parallax: `pointer` is the cursor position in −1…1 from the viewport centre; an item of `depth` (0…1,
 * 1 — nearest) shifts the opposite way by up to `amplitudePx`, so the field seems to have depth.
 */
export function parallaxOffset(pointer: Vec, depth: number, amplitudePx: number): Vec {
  return { x: -pointer.x * depth * amplitudePx, y: -pointer.y * depth * amplitudePx };
}

export type Spring = { value: number; velocity: number };
export function stepSpring(spring: Spring, dt: number, stiffness: number, damping: number): Spring {
  const acceleration = -stiffness * (spring.value - 1) - damping * spring.velocity;
  const velocity = spring.velocity + acceleration * dt;
  return { value: spring.value + velocity * dt, velocity };
}

/**
 * Poisson-disc-like placement (dart throwing with a shrinking radius): points at least `minDistance` apart,
 * outside the `avoid` rects, covering the area evenly. Deterministic for a given random source.
 */
export function scatter(
  random: Random,
  count: number,
  width: number,
  height: number,
  minDistance: number,
  avoid: readonly Rect[],
): Vec[] {
  const points: Vec[] = [];
  let distance = minDistance;
  let attempts = 0;
  while (points.length < count && distance > 1) {
    const candidate = { x: random.range(0, width), y: random.range(0, height) };
    const inside = avoid.some(
      (r) =>
        candidate.x >= r.left &&
        candidate.x <= r.right &&
        candidate.y >= r.top &&
        candidate.y <= r.bottom,
    );
    const crowded = points.some((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y) < distance);
    if (!inside && !crowded) points.push(candidate);
    attempts += 1;
    // Relax the spacing gradually if the screen is too crowded to fit everything.
    if (attempts % 400 === 0) distance *= 0.9;
  }
  return points;
}

/**
 * Sprite assignment: an even mix of all sprites where neighbours (closer than `neighbourDistance`) differ.
 * Greedy: each point takes the least-used sprite not used by its already-assigned neighbours.
 */
export function assignSprites(
  random: Random,
  points: readonly Vec[],
  spriteCount: number,
  neighbourDistance: number,
): number[] {
  const used = new Array<number>(spriteCount).fill(0);
  const result: number[] = [];
  points.forEach((point, index) => {
    const banned = new Set<number>();
    for (let j = 0; j < index; j += 1) {
      const other = points[j];
      const sprite = result[j];
      if (
        other &&
        sprite !== undefined &&
        Math.hypot(other.x - point.x, other.y - point.y) < neighbourDistance
      ) {
        banned.add(sprite);
      }
    }
    const candidates = [...used.keys()].filter((sprite) => !banned.has(sprite));
    const pool = candidates.length > 0 ? candidates : [...used.keys()];
    const least = Math.min(...pool.map((sprite) => used[sprite] ?? 0));
    const best = pool.filter((sprite) => used[sprite] === least);
    const chosen = best[random.int(best.length)] ?? 0;
    used[chosen] = (used[chosen] ?? 0) + 1;
    result.push(chosen);
  });
  return result;
}
