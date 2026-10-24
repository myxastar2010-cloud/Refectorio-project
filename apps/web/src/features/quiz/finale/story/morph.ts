import { STORY } from '../../../../motion/tokens';
import type { Cloud, SceneData } from './data';
import { applyMat, backOut, easeInOut, easeOut, span, type Mat, type Palette } from './draw';
import type { SceneScript } from './scenes';

/**
 * A transformation (§7.1) in three beats: the old drawing dissolves into points along its strokes; the points gather
 * into a ring — each to the slot of its angle around the centre, so the flow is radial and calm — the ring turns once
 * (a breath between two scenes); then it opens into the points of the next drawing, which overshoot a hair and settle
 * as its lines draw themselves on.
 */
export type MorphPlan = {
  readonly count: number;
  /** Where each point starts and lands. */
  readonly from: Float32Array;
  readonly to: Float32Array;
  /** Its slot on the ring (angle) and its place in the sweeps (0…1). */
  readonly slot: Float32Array;
  readonly order: Float32Array;
};

function placed(cloud: Cloud, matrixOf: (part: number) => Mat, step: number) {
  const n = Math.floor(cloud.count / step);
  const xy = new Float32Array(2 * n);
  for (let k = 0; k < n; k += 1) {
    const i = k * step;
    const [x, y] = applyMat(
      matrixOf(cloud.part[i] ?? 0),
      cloud.xy[2 * i] ?? 0,
      cloud.xy[2 * i + 1] ?? 0,
    );
    xy[2 * k] = x;
    xy[2 * k + 1] = y;
  }
  return { n, xy };
}

function byAngle(xy: Float32Array, n: number): number[] {
  const angle = (i: number) => Math.atan2(xy[2 * i + 1] ?? 0, xy[2 * i] ?? 0);
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => angle(a) - angle(b));
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
  const fromXY = new Float32Array(2 * count);
  const toXY = new Float32Array(2 * count);
  const slot = new Float32Array(count);
  const order = new Float32Array(count);
  // Both clouds are spread evenly over the same ring: the k-th point of each by angle shares the k-th slot.
  const pick = (order: number[], n: number, k: number) => order[Math.floor((k * n) / count)] ?? 0;
  for (let k = 0; k < count; k += 1) {
    const i = pick(orderA, a.n, k);
    const j = pick(orderB, b.n, k);
    fromXY[2 * k] = a.xy[2 * i] ?? 0;
    fromXY[2 * k + 1] = a.xy[2 * i + 1] ?? 0;
    toXY[2 * k] = b.xy[2 * j] ?? 0;
    toXY[2 * k + 1] = b.xy[2 * j + 1] ?? 0;
    slot[k] = -Math.PI + (2 * Math.PI * (k + 0.5)) / count;
    order[k] = k / count;
  }
  return { count, from: fromXY, to: toXY, slot, order };
}

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

/** The ring's turn so far and its breathing radius at `t`. */
function ringAt(t: number) {
  const m = STORY.morph;
  const turn =
    m.ringTurn * easeInOut(span(t, m.gatherFromS, m.scatterFromS + m.scatterS - m.gatherFromS));
  const breathe = Math.sin(
    Math.PI * span(t, m.gatherFromS + m.gatherS * 0.6, m.scatterFromS - m.gatherFromS),
  );
  return { turn, radius: m.ringR * (1 - 0.08 * breathe) };
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
  const fade = easeInOut(span(t, 0, m.fadeOutS));
  if (fade < 1) from.draw(ctx, from.durationS, { reveal: null, alpha: 1 - fade });
  to.script.draw(ctx, 0, {
    reveal: revealOf(to.scene, t),
    alpha: 1,
    formed: easeOut(span(t, m.revealFromS, m.revealSweepS + m.revealS)),
  });
  const { turn, radius } = ringAt(t);
  const appear = easeOut(span(t, 0, m.appearS));
  ctx.fillStyle = palette[2];
  for (let k = 0; k < plan.count; k += 1) {
    const order = plan.order[k] ?? 0;
    const angle = (plan.slot[k] ?? 0) + turn;
    const rx = radius * Math.cos(angle);
    const ry = radius * Math.sin(angle);
    const gather = easeInOut(span(t, m.gatherFromS + order * m.gatherSweepS, m.gatherS));
    const scatterStart = m.scatterFromS + order * m.scatterSweepS;
    const scatter = backOut(span(t, scatterStart, m.scatterS));
    const fx = plan.from[2 * k] ?? 0;
    const fy = plan.from[2 * k + 1] ?? 0;
    const tx = plan.to[2 * k] ?? 0;
    const ty = plan.to[2 * k + 1] ?? 0;
    const gx = fx + (rx - fx) * gather;
    const gy = fy + (ry - fy) * gather;
    const x = gx + (tx - gx) * scatter;
    const y = gy + (ty - gy) * scatter;
    const alpha = appear * (1 - span(t, scatterStart + m.scatterS * 0.75, m.landS));
    if (alpha <= 0) continue;
    // A touch smaller on the ring: the drawing's points condense, then open up again.
    const r = STORY.dotR * (1 - 0.25 * gather * (1 - scatter));
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
