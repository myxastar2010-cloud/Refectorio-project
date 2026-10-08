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

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** How docked the picture is: 1 — up to `dockedBelow` openness (the icon), 0 — the open card. */
export const dockAmount = (openness: number, dockedBelow: number) =>
  smoothstep((1 - openness) / (1 - dockedBelow));

/*
 * ── The card picture without distortion ─────────────────────────────────────────────────────────────────────────
 * The card is drawn at its final size and squeezed onto its quad by a projective transform, so anything inside it is
 * squeezed too — a round star would turn into an egg while the card stretches. The picture therefore gets the inverse
 * of the card's transform followed by a similarity (uniform scale + shift) of our choice: on screen it is never
 * distorted. The similarity glides from «the icon's square of the picture lies exactly on the icon» (the icon is that
 * square of the same picture) to «the picture as in the open card», and always covers the card.
 */

/** 3×3 homography, row by row: (x, y) → ((m0 x + m1 y + m2) / w, (m3 x + m4 y + m5) / w), w = m6 x + m7 y + m8. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** The 2D part of a CSS matrix3d (column-major 4×4) as a homography. */
export function mat3FromMatrix3d(m: readonly number[]): Mat3 {
  const at = (i: number) => m[i] ?? 0;
  return [at(0), at(4), at(12), at(1), at(5), at(13), at(3), at(7), at(15)];
}

/** A homography as a CSS matrix3d (column-major). */
export function matrix3dFromMat3(h: Mat3): number[] {
  const [a, b, c, d, e, f, g, k, i] = h;
  return [a, d, 0, g, b, e, 0, k, 0, 0, 1, 0, c, f, 0, i];
}

export function multiply3(p: Mat3, q: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = p;
  const [A, B, C, D, E, F, G, H, I] = q;
  return [
    a * A + b * D + c * G,
    a * B + b * E + c * H,
    a * C + b * F + c * I,
    d * A + e * D + f * G,
    d * B + e * E + f * H,
    d * C + e * F + f * I,
    g * A + h * D + i * G,
    g * B + h * E + i * H,
    g * C + h * F + i * I,
  ];
}

export function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const k = Math.abs(det) < 1e-12 ? 0 : 1 / det;
  return [
    A * k,
    -(b * i - c * h) * k,
    (b * f - c * e) * k,
    B * k,
    (a * i - c * g) * k,
    -(a * f - c * d) * k,
    C * k,
    -(a * h - b * g) * k,
    (a * e - b * d) * k,
  ];
}

export const translate3 = (x: number, y: number): Mat3 => [1, 0, x, 0, 1, y, 0, 0, 1];

/** Where a point lands under a homography. */
export function apply3(m: Mat3, x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

/** Uniform scale and shift: p → (x + scale·p.x, y + scale·p.y). */
export type Similarity = { readonly scale: number; readonly x: number; readonly y: number };

export const similarity3 = ({ scale, x, y }: Similarity): Mat3 => [
  scale,
  0,
  x,
  0,
  scale,
  y,
  0,
  0,
  1,
];

/** The card picture: its size in px, where the open card's band of it lies, and the square the icon shows. */
export type CardPicture = {
  readonly width: number;
  readonly height: number;
  /** object-position y of the band an open landscape card shows (0 top … 1 bottom). */
  readonly focusY: number;
  /** The square of the picture that is the team icon (the icon is this square of the same picture). */
  readonly icon: { readonly x: number; readonly y: number; readonly size: number };
};

/**
 * The picture laid out to cover a box of `width`×`height` (object-fit: cover, object-position 50% focusY), and the
 * icon's square in the same box coordinates. Mirrors the CSS of .team-surface-picture.
 */
export function pictureFraming(width: number, height: number, picture: CardPicture) {
  const scale = Math.max(width / picture.width, height / picture.height);
  const frame: Box = {
    left: (width - picture.width * scale) / 2,
    top: (height - picture.height * scale) * picture.focusY,
    width: picture.width * scale,
    height: picture.height * scale,
  };
  const icon: Box = {
    left: frame.left + picture.icon.x * scale,
    top: frame.top + picture.icon.y * scale,
    width: picture.icon.size * scale,
    height: picture.icon.size * scale,
  };
  return { frame, icon };
}

function boundsOf(quad: Quad) {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const clampTo = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, Math.min(low, high)), Math.max(low, high));

/**
 * The similarity that places the card picture on screen (both in coordinates of the dialog box): at the icon the
 * icon's square of the picture lies exactly on the tile; open — the picture as the CSS lays it out (identity); in
 * between it follows the card (covering its bounds) and glides from one to the other, never leaving a gap.
 */
export function pictureMapping({
  quad,
  box,
  tile,
  frame,
  icon,
  open,
  dockedBelow,
}: {
  readonly quad: Quad;
  readonly box: { readonly width: number; readonly height: number };
  readonly tile: Box;
  readonly frame: Box;
  readonly icon: Box;
  readonly open: number;
  readonly dockedBelow: number;
}): Similarity {
  const b = boundsOf(quad);
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  // The open card scaled uniformly to cover the card's current bounds, centred on them.
  const coverScale = Math.max(bw / box.width, bh / box.height);
  const cover = {
    scale: coverScale,
    x: (b.x0 + b.x1) / 2 - (coverScale * box.width) / 2,
    y: (b.y0 + b.y1) / 2 - (coverScale * box.height) / 2,
  };
  // The icon's square of the picture exactly on the tile.
  const dockScale = tile.width / icon.width;
  const dock = {
    scale: dockScale,
    x: tile.left - dockScale * icon.left,
    y: tile.top - dockScale * icon.top,
  };
  const w = dockAmount(open, dockedBelow);
  // Glide between the two: the scale geometrically, the icon's centre along a straight line.
  let scale = Math.exp(lerp(Math.log(cover.scale), Math.log(dock.scale), w));
  const cx = icon.left + icon.width / 2;
  const cy = icon.top + icon.height / 2;
  const anchorX = lerp(cover.x + cover.scale * cx, dock.x + dock.scale * cx, w);
  const anchorY = lerp(cover.y + cover.scale * cy, dock.y + dock.scale * cy, w);
  // Never a gap: the whole picture is large enough for the card's bounds and placed over them.
  scale = Math.max(scale, bw / frame.width, bh / frame.height);
  const x = clampTo(
    anchorX - scale * cx,
    b.x1 - scale * (frame.left + frame.width),
    b.x0 - scale * frame.left,
  );
  const y = clampTo(
    anchorY - scale * cy,
    b.y1 - scale * (frame.top + frame.height),
    b.y0 - scale * frame.top,
  );
  return { scale, x, y };
}
