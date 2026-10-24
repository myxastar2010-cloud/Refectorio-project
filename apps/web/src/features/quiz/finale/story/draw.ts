import { cubicBezier } from 'motion/react';
import { EASE_IN_OUT, EASE_OUT_EXPO, EASE_OUT_SOFT } from '../../../../motion/tokens';
import type { SceneData, Stroke } from './data';

/** 2D affine matrix as canvas takes it: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat = readonly [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** Move by (x, y), turned by `angle` and scaled about the pivot. */
export function mat(x = 0, y = 0, angle = 0, scale = 1, pivotX = 0, pivotY = 0): Mat {
  const c = Math.cos(angle) * scale;
  const s = Math.sin(angle) * scale;
  return [c, s, -s, c, pivotX - c * pivotX + s * pivotY + x, pivotY - s * pivotX - c * pivotY + y];
}

/** Scaled differently along x and y about a pivot (a jib seen turning, a block squashing), then moved. */
export function matXY(x: number, y: number, sx: number, sy: number, pivotX = 0, pivotY = 0): Mat {
  return [sx, 0, 0, sy, pivotX - sx * pivotX + x, pivotY - sy * pivotY + y];
}

/** a · b (b applied first). */
export function mulMat(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function applyMat(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Stroke widths (units of the 512 box): the main line and the fine one — one family, rounded ends. */
export const STROKE_WIDTHS = [5.5, 3.5] as const;

export type Palette = readonly [ink: string, muted: string, accent: string];

/** The motion tokens' curves (motion/tokens.ts), as functions. */
export const easeInOut = cubicBezier(...EASE_IN_OUT);
export const easeOut = cubicBezier(...EASE_OUT_SOFT);
export const easeOutExpo = cubicBezier(...EASE_OUT_EXPO);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Ease out with a small overshoot (the points settle into the new drawing). */
export const backOut = (t: number, overshoot = 1.15) => {
  const u = t - 1;
  return t >= 1 ? 1 : 1 + u * u * ((overshoot + 1) * u + overshoot);
};
/** Progress of `t` through [start, start + duration], clamped. */
export const span = (t: number, start: number, duration: number) =>
  clamp01((t - start) / Math.max(1e-6, duration));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Traces a stroke up to `progress` of its length (the draw-on). */
export function tracePath(ctx: CanvasRenderingContext2D, stroke: Stroke, progress: number): void {
  const { xy, along } = stroke;
  const n = along.length;
  if (n === 0 || progress <= 0) return;
  const end = progress >= 1 ? Number.POSITIVE_INFINITY : progress * stroke.length;
  ctx.moveTo(xy[0] ?? 0, xy[1] ?? 0);
  for (let i = 1; i < n; i += 1) {
    const at = along[i] ?? 0;
    if (at <= end) {
      ctx.lineTo(xy[2 * i] ?? 0, xy[2 * i + 1] ?? 0);
      continue;
    }
    const before = along[i - 1] ?? 0;
    const t = (end - before) / Math.max(1e-6, at - before);
    const x0 = xy[2 * i - 2] ?? 0;
    const y0 = xy[2 * i - 1] ?? 0;
    ctx.lineTo(x0 + ((xy[2 * i] ?? 0) - x0) * t, y0 + ((xy[2 * i + 1] ?? 0) - y0) * t);
    break;
  }
}

export type StrokeLook = {
  /** Draw-on share 0…1. */
  progress: number;
  alpha: number;
  /** A colour instead of the stroke's own (an index into the palette). */
  color?: number;
};

/**
 * Draws a scene's strokes part by part: `matrixOf(part)` places each part, `look(stroke, index)` says how much of a
 * stroke shows (null: not at all).
 */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  scene: SceneData,
  palette: Palette,
  matrixOf: (part: number) => Mat,
  look: (stroke: Stroke, index: number) => StrokeLook | null,
  alpha = 1,
): void {
  const parts = scene.parts.length;
  for (let part = 0; part < parts; part += 1) {
    const m = matrixOf(part);
    ctx.save();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    scene.strokes.forEach((stroke, index) => {
      if (stroke.part !== part) return;
      const state = look(stroke, index);
      if (!state || state.progress <= 0 || state.alpha <= 0) return;
      ctx.globalAlpha = state.alpha * alpha;
      ctx.strokeStyle = palette[state.color ?? stroke.color] ?? palette[0];
      ctx.lineWidth = STROKE_WIDTHS[stroke.width] ?? STROKE_WIDTHS[0];
      ctx.beginPath();
      tracePath(ctx, stroke, state.progress);
      ctx.stroke();
    });
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** Deterministic pseudo-random numbers (mulberry32): the same seed, the same story. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
