import { STORY } from '../../../../motion/tokens';
import type { Cloud, SceneData } from './data';
import { applyMat, easeInOut, easeOut, span, type Mat, type Palette } from './draw';
import type { SceneScript } from './scenes';

/**
 * A transformation (§7.1): the old drawing dissolves into points sampled along its strokes, the points flow on arcs
 * — in a wave around the drawing, all bending the same way — to points of the next drawing, which draws itself on as
 * they land. Pairs are made once: both clouds ordered by their angle around the centre, so the flow turns as one.
 */
export type MorphPlan = {
  readonly count: number;
  /** from x, y · control x, y · to x, y — per point. */
  readonly path: Float32Array;
  readonly delay: Float32Array;
  readonly colorFrom: Uint8Array;
  readonly colorTo: Uint8Array;
};

function placed(cloud: Cloud, matrixOf: (part: number) => Mat, step: number) {
  const n = Math.floor(cloud.count / step);
  const xy = new Float32Array(2 * n);
  const color = new Uint8Array(n);
  for (let k = 0; k < n; k += 1) {
    const i = k * step;
    const [x, y] = applyMat(
      matrixOf(cloud.part[i] ?? 0),
      cloud.xy[2 * i] ?? 0,
      cloud.xy[2 * i + 1] ?? 0,
    );
    xy[2 * k] = x;
    xy[2 * k + 1] = y;
    color[k] = cloud.color[i] ?? 0;
  }
  return { n, xy, color };
}

function byAngle(xy: Float32Array, n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const angle = (i: number) => Math.atan2(xy[2 * i + 1] ?? 0, xy[2 * i] ?? 0);
  return order.sort((a, b) => angle(a) - angle(b));
}

/** `step` 2 halves the points (the adaptive quality of slow devices). */
export function planMorph(
  from: { readonly scene: SceneData; readonly script: SceneScript },
  to: { readonly scene: SceneData; readonly script: SceneScript },
  step = 1,
): MorphPlan {
  const a = placed(
    from.scene.cloudOut,
    (part) => from.script.partMatrix(part, from.script.durationS),
    step,
  );
  const b = placed(to.scene.cloudIn, (part) => to.script.partMatrix(part, 0), step);
  const count = Math.min(a.n, b.n);
  const orderA = byAngle(a.xy, a.n);
  const orderB = byAngle(b.xy, b.n);
  const path = new Float32Array(6 * count);
  const delay = new Float32Array(count);
  const colorFrom = new Uint8Array(count);
  const colorTo = new Uint8Array(count);
  for (let k = 0; k < count; k += 1) {
    const i = orderA[k] ?? 0;
    const j = orderB[k] ?? 0;
    const x0 = a.xy[2 * i] ?? 0;
    const y0 = a.xy[2 * i + 1] ?? 0;
    const x1 = b.xy[2 * j] ?? 0;
    const y1 = b.xy[2 * j + 1] ?? 0;
    // The control point: off the middle, always to the same side — every arc bends the same way.
    const dx = x1 - x0;
    const dy = y1 - y0;
    path.set(
      [
        x0,
        y0,
        (x0 + x1) / 2 - dy * STORY.morph.bend,
        (y0 + y1) / 2 + dx * STORY.morph.bend,
        x1,
        y1,
      ],
      6 * k,
    );
    delay[k] = (k / count) * STORY.morph.sweepS;
    colorFrom[k] = a.color[i] ?? 0;
    colorTo[k] = b.color[j] ?? 0;
  }
  return { count, path, delay, colorFrom, colorTo };
}

const quad = (a: number, c: number, b: number, u: number) =>
  (1 - u) * (1 - u) * a + 2 * (1 - u) * u * c + u * u * b;

/** The new drawing's strokes draw on in a sweep as the points land (index → 0…1). */
export function revealOf(scene: SceneData, t: number): (index: number) => number {
  const intro = scene.strokes.map((s, i) => (s.intro ? i : -1)).filter((i) => i >= 0);
  const rank = new Map(intro.map((index, r) => [index, r / Math.max(1, intro.length)]));
  const { revealFromS, revealSweepS, revealS } = STORY.morph;
  return (index) => {
    const r = rank.get(index);
    return r === undefined ? 0 : easeOut(span(t, revealFromS + r * revealSweepS, revealS));
  };
}

export function drawMorph(
  ctx: CanvasRenderingContext2D,
  plan: MorphPlan,
  t: number,
  from: SceneScript,
  to: { readonly scene: SceneData; readonly script: SceneScript },
  palette: Palette,
): void {
  const m = STORY.morph;
  // The old drawing gives way, the new one draws on.
  const fade = easeInOut(span(t, 0, m.fadeOutS));
  if (fade < 1) from.draw(ctx, from.durationS, { reveal: null, alpha: 1 - fade });
  to.script.draw(ctx, 0, {
    reveal: revealOf(to.scene, t),
    alpha: 1,
    formed: easeOut(span(t, m.revealFromS, m.revealSweepS + m.revealS)),
  });
  // The points: a short capsule from where a point was a moment ago — its trail, stretched by its speed.
  const appear = easeOut(span(t, 0, m.appearS));
  ctx.lineCap = 'round';
  ctx.lineWidth = 2 * STORY.dotR;
  for (let k = 0; k < plan.count; k += 1) {
    const start = m.departS + (plan.delay[k] ?? 0);
    const u = easeInOut(span(t, start, m.travelS));
    const back = easeInOut(span(t - m.trail * m.travelS, start, m.travelS));
    const land = span(t, start + m.travelS, m.landS);
    const alpha = appear * (1 - land);
    if (alpha <= 0) continue;
    const o = 6 * k;
    const p = plan.path;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle =
      palette[u < 0.5 ? (plan.colorFrom[k] ?? 0) : (plan.colorTo[k] ?? 0)] ?? palette[0];
    ctx.beginPath();
    ctx.moveTo(
      quad(p[o] ?? 0, p[o + 2] ?? 0, p[o + 4] ?? 0, back),
      quad(p[o + 1] ?? 0, p[o + 3] ?? 0, p[o + 5] ?? 0, back),
    );
    ctx.lineTo(
      quad(p[o] ?? 0, p[o + 2] ?? 0, p[o + 4] ?? 0, u),
      quad(p[o + 1] ?? 0, p[o + 3] ?? 0, p[o + 5] ?? 0, u),
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
