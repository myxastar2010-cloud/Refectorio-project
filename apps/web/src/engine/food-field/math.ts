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
/**
 * The part of the plane that is on screen with the plane as it is (scale 1) or scaled by `scale` about the point
 * (originX·width, originY·height) — the food camera of part 2. Shrinking the plane brings its own edges into view.
 */
export function cameraVisibleArea(
  width: number,
  height: number,
  camera: { readonly scale: number; readonly originX: number; readonly originY: number },
): Rect {
  const x = camera.originX * width;
  const y = camera.originY * height;
  return {
    left: Math.min(0, x * (1 - 1 / camera.scale)),
    top: Math.min(0, y * (1 - 1 / camera.scale)),
    right: Math.max(width, x + (width - x) / camera.scale),
    bottom: Math.max(height, y + (height - y) / camera.scale),
  };
}

/** An item that has fully left `area` (by `radius`) comes back from its opposite side. */
export function wrap(p: Vec, radius: number, area: Rect): Vec {
  let { x, y } = p;
  if (x + radius < area.left) x = area.right + radius;
  else if (x - radius > area.right) x = area.left - radius;
  if (y + radius < area.top) y = area.bottom + radius;
  else if (y - radius > area.bottom) y = area.top - radius;
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

/** How far an item's opaque part reaches from its centre at any rotation, as a share of the sprite's edge. */
export function maskRadius(mask: Uint32Array, size: number): number {
  let radius = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (((mask[row] ?? 0) >>> (size - 1 - column)) & 1) {
        // The cell's far corner.
        const dx = Math.max(Math.abs(column - size / 2), Math.abs(column + 1 - size / 2));
        const dy = Math.max(Math.abs(row - size / 2), Math.abs(row + 1 - size / 2));
        radius = Math.max(radius, Math.hypot(dx, dy));
      }
    }
  }
  return radius / size;
}

/**
 * The girl's silhouette for the food (stage 4, §1.6): the signed distance to it at the centre of every cell of the mask's
 * grid, in the mask's own pixels, negative inside. A cell is a square of the union: the distance never overstates.
 */
export type SilhouetteMask = {
  readonly grid: number;
  readonly width: number;
  readonly height: number;
  /** Hexadecimal rows, the leftmost cell in the highest bit. */
  readonly rows: readonly string[];
};

export type SilhouetteField = {
  readonly grid: number;
  readonly width: number;
  readonly distance: Float32Array;
  readonly cellWidth: number;
  readonly cellHeight: number;
};

export function buildSilhouette(mask: SilhouetteMask): SilhouetteField {
  const { grid, width, height, rows } = mask;
  const cellWidth = width / grid;
  const cellHeight = height / grid;
  const isSet = (row: number, column: number) => {
    const digit = Number.parseInt((rows[row] ?? '').charAt(column >> 2) || '0', 16);
    return ((digit >> (3 - (column & 3))) & 1) === 1;
  };
  const distance = new Float32Array(grid * grid);
  for (let row = 0; row < grid; row += 1) {
    for (let column = 0; column < grid; column += 1) {
      const own = isSet(row, column);
      let nearest = Number.POSITIVE_INFINITY;
      for (let otherRow = 0; otherRow < grid; otherRow += 1) {
        for (let otherColumn = 0; otherColumn < grid; otherColumn += 1) {
          if (isSet(otherRow, otherColumn) === own) continue;
          const dx = Math.max(0, Math.abs(otherColumn - column) - 0.5) * cellWidth;
          const dy = Math.max(0, Math.abs(otherRow - row) - 0.5) * cellHeight;
          nearest = Math.min(nearest, dx * dx + dy * dy);
        }
      }
      distance[row * grid + column] = (own ? -1 : 1) * Math.sqrt(nearest);
    }
  }
  return { grid, width, distance, cellWidth, cellHeight };
}

/** Result of sampleSilhouette, reused from frame to frame. */
export type SilhouetteProbe = { distance: number; nx: number; ny: number };

function fieldAt(field: SilhouetteField, u: number, v: number): number {
  const last = field.grid - 1;
  const x = Math.min(Math.max(u, 0), last);
  const y = Math.min(Math.max(v, 0), last);
  const column = Math.min(Math.floor(x), last - 1);
  const row = Math.min(Math.floor(y), last - 1);
  const fx = x - column;
  const fy = y - row;
  const at = (r: number, c: number) => field.distance[r * field.grid + c] ?? 0;
  const top = at(row, column) * (1 - fx) + at(row, column + 1) * fx;
  const bottom = at(row + 1, column) * (1 - fx) + at(row + 1, column + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Distance from a point (CSS px) to the silhouette drawn in `box`, and the unit direction away from it. Beyond the box
 * the distance grows with the way to the box. No allocations: it runs for the items near her on every frame.
 */
export function sampleSilhouette(
  field: SilhouetteField,
  box: Rect,
  x: number,
  y: number,
  out: SilhouetteProbe,
): void {
  const scale = (box.right - box.left) / field.width;
  const inX = Math.min(Math.max(x, box.left), box.right);
  const inY = Math.min(Math.max(y, box.top), box.bottom);
  const u = (inX - box.left) / scale / field.cellWidth - 0.5;
  const v = (inY - box.top) / scale / field.cellHeight - 0.5;
  const beyondX = x - inX;
  const beyondY = y - inY;
  const beyond = Math.hypot(beyondX, beyondY);
  // Half a cell of bilinear smoothing must never read as more room than there is.
  const margin = (Math.min(field.cellWidth, field.cellHeight) / 4) * scale;
  out.distance = fieldAt(field, u, v) * scale + beyond - margin;
  let nx = fieldAt(field, u + 0.5, v) - fieldAt(field, u - 0.5, v);
  let ny = fieldAt(field, u, v + 0.5) - fieldAt(field, u, v - 0.5);
  const gradient = Math.hypot(nx, ny) || 1;
  nx /= gradient;
  ny /= gradient;
  if (beyond > 0) {
    nx += beyondX / beyond;
    ny += beyondY / beyond;
  }
  const length = Math.hypot(nx, ny) || 1;
  out.nx = nx / length;
  out.ny = ny / length;
}

/** Damped spring towards 1 for the click "bounce" (semi-implicit Euler, stable for dt ≤ 50 ms). */
export type Spring = { value: number; velocity: number };
export function stepSpring(spring: Spring, dt: number, stiffness: number, damping: number): Spring {
  const acceleration = -stiffness * (spring.value - 1) - damping * spring.velocity;
  const velocity = spring.velocity + acceleration * dt;
  return { value: spring.value + velocity * dt, velocity };
}

/** FPS probe of the adaptive quality: the current window and how many windows in a row were slow. */
export type FpsProbe = {
  readonly start: number;
  readonly frames: number;
  readonly slowWindows: number;
};
export const FRESH_PROBE: FpsProbe = { start: -1, frames: 0, slowWindows: 0 };

/**
 * One frame for the probe. Frames before `calmFrom` are not counted (the window starts over). A window of `windowMs`
 * below `minFps` is slow; `slowWindows` slow windows in a row mean a slow device (`lower`, and the count starts over).
 */
export function probeFrame(
  probe: FpsProbe,
  now: number,
  calmFrom: number,
  limits: { readonly windowMs: number; readonly minFps: number; readonly slowWindows: number },
): { readonly probe: FpsProbe; readonly lower: boolean } {
  if (probe.start < 0 || now < calmFrom)
    return { probe: { ...probe, start: now, frames: 0 }, lower: false };
  const frames = probe.frames + 1;
  const elapsed = now - probe.start;
  if (elapsed < limits.windowMs) return { probe: { ...probe, frames }, lower: false };
  const slowWindows = (frames * 1000) / elapsed < limits.minFps ? probe.slowWindows + 1 : 0;
  const lower = slowWindows >= limits.slowWindows;
  return { probe: { start: now, frames: 0, slowWindows: lower ? 0 : slowWindows }, lower };
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
/**
 * The sprite an item takes when it wraps around off screen (where nobody sees the change): one of the least-used ones,
 * when its own is used more — so repeats go first, and with fewer items than sprites (a phone has 8 of 15) the field
 * slowly shows them all. −1: it keeps its own (every sprite is used as often).
 */
export function rebalanceSprite(random: Random, usage: readonly number[], current: number): number {
  const least = Math.min(...usage);
  if ((usage[current] ?? 0) <= least) return -1;
  const pool = [...usage.keys()].filter((index) => usage[index] === least);
  return pool[random.int(pool.length)] ?? -1;
}

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
