/**
 * Corner morph of the team card (ТЗ 6.4, in the spirit of iOS 26): each of the four corners flies on its own spring
 * with its own delay, so the card stretches like a rubber sheet instead of scaling uniformly. The quad of the corners
 * is drawn with a projective transform (matrix3d) of the card at its final size — composited, no layout.
 * Pure math, unit-tested; the frame loop lives in useCornerMorph.
 */

export type Point = { readonly x: number; readonly y: number };
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = readonly [Point, Point, Point, Point];
export type Box = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

export function boxCorners({ left, top, width, height }: Box): Quad {
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
}

/**
 * The 4×4 matrix (column-major, as CSS matrix3d) mapping the box (0, 0)–(w, h) onto `quad` given relative to the
 * box's own top-left corner (transform-origin 0 0). Square-to-quad homography after Heckbert.
 */
export function quadMatrix(quad: Quad, w: number, h: number): number[] {
  const [p0, p1, p2, p3] = quad;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const projective = Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9;
  const g = projective && Math.abs(den) > 1e-12 ? (dx3 * dy2 - dx2 * dy3) / den : 0;
  const k = projective && Math.abs(den) > 1e-12 ? (dx1 * dy3 - dx3 * dy1) / den : 0;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + k * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + k * p3.y;
  return [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, p0.x, p0.y, 0, 1];
}

export const matrixCss = (m: readonly number[]) =>
  `matrix3d(${m.map((n) => Number(n.toFixed(7))).join(',')})`;

/** Where a point of the box lands under the matrix (used by the tests). */
export function applyMatrix(m: readonly number[], x: number, y: number): Point {
  const w = (m[3] ?? 0) * x + (m[7] ?? 0) * y + (m[15] ?? 1);
  return {
    x: ((m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[12] ?? 0)) / w,
    y: ((m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[13] ?? 0)) / w,
  };
}

export type SpringParams = { readonly stiffness: number; readonly damping: number };
export type CornerSpring = SpringParams & { readonly delayS: number };
export type MorphStyle = {
  /** The corner with the shortest way. */
  readonly near: SpringParams;
  /** The corner with the longest way. */
  readonly far: SpringParams;
  /** Delay between the first and the last corner to start. */
  readonly lagS: number;
  /** Who starts first: opening — the far corners pull the card; closing — the near ones snap back first. */
  readonly lead: 'far' | 'near';
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Springs of the four corners for a move from `from` to `to`: longer ways get the "far" character. */
export function cornerSprings(from: Quad, to: Quad, style: MorphStyle): CornerSpring[] {
  const ways = from.map((point, i) => distance(point, to[i] ?? point));
  const min = Math.min(...ways);
  const span = Math.max(...ways) - min;
  return ways.map((way) => {
    const t = span > 1e-6 ? (way - min) / span : 1;
    const startsFirst = style.lead === 'far' ? t : 1 - t;
    return {
      stiffness: lerp(style.near.stiffness, style.far.stiffness, t),
      damping: lerp(style.near.damping, style.far.damping, t),
      delayS: (1 - startsFirst) * style.lagS,
    };
  });
}

export type Corner = { x: number; y: number; vx: number; vy: number };

/** One step of a damped spring towards `target` (semi-implicit Euler, sub-stepped for stability). */
export function stepCorner(
  corner: Corner,
  target: Point,
  spring: SpringParams,
  dt: number,
): Corner {
  const steps = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / steps;
  let { x, y, vx, vy } = corner;
  for (let i = 0; i < steps; i += 1) {
    vx += (-spring.stiffness * (x - target.x) - spring.damping * vx) * h;
    vy += (-spring.stiffness * (y - target.y) - spring.damping * vy) * h;
    x += vx * h;
    y += vy * h;
  }
  return { x, y, vx, vy };
}

export const atRest = (corner: Corner, target: Point, tolerancePx: number) =>
  Math.abs(corner.x - target.x) < tolerancePx &&
  Math.abs(corner.y - target.y) < tolerancePx &&
  Math.hypot(corner.vx, corner.vy) < tolerancePx * 20;

/** Mean widths and heights of a quad (top/bottom and left/right edges). */
export function quadSize(quad: Quad): { width: number; height: number } {
  const [p0, p1, p2, p3] = quad;
  return {
    width: (distance(p0, p1) + distance(p3, p2)) / 2,
    height: (distance(p0, p3) + distance(p1, p2)) / 2,
  };
}

/** How open the card is: 0 — tile, 1 — dialog (by the mean size of the quad). */
export function openness(quad: Quad, tile: Box, dialog: Box): number {
  const { width, height } = quadSize(quad);
  const along = (value: number, from: number, to: number) =>
    Math.abs(to - from) < 1e-6 ? 1 : (value - from) / (to - from);
  const t =
    (along(width, tile.width, dialog.width) + along(height, tile.height, dialog.height)) / 2;
  return Math.min(1, Math.max(0, t));
}

export type DockRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * Transform of the card background (transform-origin 0 0, the background filling a w×h card) that zooms it onto
 * `dock` — the square of the background that the icon shows. 1 — as it is (open card), 0 — the square fills the card,
 * so squeezed onto the icon it is the icon's picture. Fully docked from `dockedBelow` openness down, where the
 * icon's logo fades in on top: the two stars are one.
 */
/** How docked the background is: 0 — open card, 1 — from `dockedBelow` openness down. */
export const dockAmount = (openness: number, dockedBelow: number) =>
  smoothstep((1 - openness) / (1 - dockedBelow));

export function dockMatrix(
  openness: number,
  w: number,
  h: number,
  dock: DockRect,
  dockedBelow: number,
): number[] {
  const k = dockAmount(openness, dockedBelow);
  const sx = 1 + (1 / dock.width - 1) * k;
  const sy = 1 + (1 / dock.height - 1) * k;
  const tx = (-dock.x * w * k) / dock.width;
  const ty = (-dock.y * h * k) / dock.height;
  return [sx, 0, 0, sy, tx, ty];
}

export const matrix2dCss = (m: readonly number[]) =>
  `matrix(${m.map((n) => Number(n.toFixed(6))).join(',')})`;
