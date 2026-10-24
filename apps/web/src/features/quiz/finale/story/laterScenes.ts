import type { Cloud, SceneData, Stroke } from './data';
import { MUTED } from './data';
import {
  backOut,
  clamp01,
  drawStrokes,
  easeInOut,
  easeOut,
  IDENTITY,
  mat,
  matXY,
  mulMat,
  span,
  STROKE_WIDTHS,
  type Mat,
} from './draw';
import { ownOrReveal, type SceneContext, type SceneScript } from './scenes';

const partIndex = (scene: SceneData, name: string) => scene.parts.indexOf(name);

// ── 3. A tower crane sets a block into our interface ─────────────────────────────────────────────────────────────

/** The trolley runs out, the load swings behind and settles, lowers, lands with a squash; the hook goes back up and
 * a table draws itself on the card next to the new block. */
const CRANE = {
  travel: { from: 0.25, s: 1.15 },
  lower: { from: 1.55, s: 0.8 },
  raise: { from: 2.6, s: 0.6 },
  slingOff: { from: 2.38, s: 0.2 },
  table: { from: 2.8, s: 0.55 },
} as const;

export function craneScene(scene: SceneData, ctx0: SceneContext, durationS: number): SceneScript {
  const { top, trolleyFrom, trolleyAt, hookY, slot } = ctx0.meta.crane;
  const parts = {
    trolley: partIndex(scene, 'trolley'),
    cable: partIndex(scene, 'cable'),
    load: partIndex(scene, 'load'),
    block: partIndex(scene, 'block'),
    slot: partIndex(scene, 'slot'),
    table: partIndex(scene, 'table'),
  };
  const landAt = CRANE.lower.from + CRANE.lower.s;
  const drop = slot.y - (hookY + 24);
  const pivotY = top + 10;
  const trolleyX = (t: number) =>
    trolleyFrom + (trolleyAt - trolleyFrom) * easeInOut(span(t, CRANE.travel.from, CRANE.travel.s));
  /** The load trails the trolley while it runs, then swings on and dies out. */
  const sway = (t: number) => {
    const end = CRANE.travel.from + CRANE.travel.s;
    if (t < end) return 0.09 * Math.sin(Math.PI * span(t, CRANE.travel.from, CRANE.travel.s));
    const after = t - end;
    return -0.07 * Math.exp(-after / 0.32) * Math.sin((2 * Math.PI * after) / 0.62);
  };
  const lowered = (t: number) =>
    drop * easeInOut(span(t, CRANE.lower.from, CRANE.lower.s)) -
    (drop + 20) * easeInOut(span(t, CRANE.raise.from, CRANE.raise.s));
  const loadMatrix = (t: number): Mat => {
    const dx = trolleyX(t) - trolleyFrom;
    return mulMat(mat(dx, lowered(t)), mat(0, 0, t < landAt ? sway(t) : 0, 1, trolleyFrom, pivotY));
  };
  const blockMatrix = (t: number): Mat => {
    if (t < landAt) return loadMatrix(t);
    // In the slot: a squash on contact, a small rebound, settled.
    const after = t - landAt;
    const squash = 0.08 * Math.exp(-after / 0.1) * Math.cos((2 * Math.PI * after) / 0.26);
    return mulMat(
      mat(trolleyAt - trolleyFrom, drop),
      matXY(0, 0, 1 + squash * 0.7, 1 - squash, trolleyFrom, hookY + 24 + slot.h),
    );
  };
  const matrixOf = (part: number, t: number): Mat => {
    if (part === parts.trolley || part === parts.cable) return mat(trolleyX(t) - trolleyFrom, 0);
    if (part === parts.load) return loadMatrix(t);
    if (part === parts.block) return blockMatrix(t);
    return IDENTITY;
  };
  const own = (stroke: Stroke, t: number) =>
    stroke.part === parts.table
      ? easeOut(span(t, CRANE.table.from + (stroke.key === 'table-col' ? 0.18 : 0), CRANE.table.s))
      : 1;
  const alphaOf = (stroke: Stroke, t: number) => {
    if (stroke.part === parts.slot) return 1 - span(t, landAt - 0.2, 0.2);
    if (stroke.key === 'sling') return 1 - span(t, CRANE.slingOff.from, CRANE.slingOff.s);
    return 1;
  };

  return {
    id: 'crane',
    durationS,
    cues: [
      [0, 3],
      [CRANE.table.from - 0.1, 4],
    ],
    partMatrix: matrixOf,
    draw(ctx, t, look) {
      drawStrokes(
        ctx,
        scene,
        ctx0.palette,
        (part) => matrixOf(part, t),
        (stroke, i) => {
          if (stroke.part === parts.cable && !look.reveal) return null;
          return {
            progress: ownOrReveal(look, i, own(stroke, t)),
            alpha: look.reveal ? 1 : alphaOf(stroke, t),
          };
        },
        look.alpha,
      );
      if (look.reveal) return;
      // The cable from the trolley down to the hook (its length changes).
      const m = loadMatrix(t);
      ctx.globalAlpha = look.alpha;
      ctx.strokeStyle = ctx0.palette[MUTED];
      ctx.lineWidth = STROKE_WIDTHS[1];
      ctx.beginPath();
      ctx.moveTo(trolleyX(t), pivotY);
      ctx.lineTo(
        m[0] * trolleyFrom + m[2] * hookY + m[4],
        m[1] * trolleyFrom + m[3] * hookY + m[5],
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  };
}

// ── 4. A delivery robot on a road ────────────────────────────────────────────────────────────────────────────────

const ROBOT = { bump: { from: 1.3, s: 0.55 }, bobs: 5, periods: 3 } as const;

export function robotScene(scene: SceneData, ctx0: SceneContext, durationS: number): SceneScript {
  const { wheels, dash } = ctx0.meta.robot;
  const body = partIndex(scene, 'body');
  const antenna = partIndex(scene, 'antenna');
  const dashes = partIndex(scene, 'dashes');
  const wheelParts = wheels.map((_, i) => partIndex(scene, `wheel-${String(i)}`));
  const s = (t: number) => clamp01(t / durationS);
  const shift = (t: number) => (ROBOT.periods * dash.period * s(t)) % dash.period;
  const bodyMatrix = (t: number): Mat => {
    const bob = 1.4 * Math.sin(2 * Math.PI * ROBOT.bobs * s(t));
    const u = span(t, ROBOT.bump.from, ROBOT.bump.s);
    // Over the bump the front lifts first, then the back.
    return mat(0, bob - 7 * Math.sin(Math.PI * u), -0.045 * Math.sin(2 * Math.PI * u), 1, -10, 44);
  };
  const antennaMatrix = (t: number): Mat => {
    const lag =
      0.05 * Math.sin(2 * Math.PI * ROBOT.bobs * s(t) - 1) +
      0.14 * Math.sin(Math.PI * span(t, ROBOT.bump.from + 0.08, ROBOT.bump.s + 0.2));
    return mulMat(bodyMatrix(t), mat(0, 0, lag, 1, -60, -48));
  };
  const matrixOf = (part: number, t: number): Mat => {
    if (part === body) return bodyMatrix(t);
    if (part === antenna) return antennaMatrix(t);
    if (part === dashes) return mat(-shift(t), 0);
    const wheel = wheelParts.indexOf(part);
    if (wheel < 0) return IDENTITY;
    const [x, y] = wheels[wheel] ?? [0, 0];
    // Whole half turns over the scene: the hubs are back where they started.
    return mat(0, 0, ROBOT.periods * Math.PI * s(t), 1, x, y);
  };

  return {
    id: 'robot',
    durationS,
    cues: [[0, 5]],
    partMatrix: matrixOf,
    draw(ctx, t, look) {
      drawStrokes(
        ctx,
        scene,
        ctx0.palette,
        (part) => matrixOf(part, t),
        (stroke, i) => {
          let alpha = 1;
          if (stroke.part === dashes && !look.reveal) {
            // Lane marks fade in and out at the road's ends.
            const x = (stroke.xy[0] ?? 0) - shift(t);
            alpha = clamp01((x - dash.from) / 36) * clamp01((dash.to - (x + dash.length)) / 36);
          }
          return { progress: ownOrReveal(look, i, 1), alpha };
        },
        look.alpha,
      );
    },
  };
}

// ── 5. A pot with steam ──────────────────────────────────────────────────────────────────────────────────────────

const POT = {
  lid: { from: 0.45, s: 1.2 },
  steam: { from: 0.6, gap: 0.24, s: 1.0, fade: 0.8 },
} as const;

export function potScene(scene: SceneData, ctx0: SceneContext, durationS: number): SceneScript {
  const lid = partIndex(scene, 'lid');
  const [px, py] = ctx0.meta.pot.lidPivot;
  const flames = [0, 1, 2].map((i) => partIndex(scene, `flame-${String(i)}`));
  const steam = partIndex(scene, 'steam');
  const flameBase = (scene.byKey.get('burner')?.xy[1] ?? 0) - 6;

  const lidMatrix = (t: number): Mat => {
    // The steam pushes the lid up on its hinge; it rattles twice and settles.
    const u = span(t, POT.lid.from, POT.lid.s);
    const lift = Math.sin(Math.PI * u) * (0.09 + 0.03 * Math.sin(2 * Math.PI * 3 * u));
    return mat(0, 0, -lift, 1, px, py);
  };
  const flameMatrix = (i: number, t: number): Mat => {
    const x = [-40, 0, 40][i] ?? 0;
    const k =
      0.1 * Math.sin(2 * Math.PI * (4.6 * t + i * 0.33)) * Math.sin((Math.PI * t) / durationS);
    return matXY(0, 0, 1 - k * 0.5, 1 + k, x, flameBase);
  };
  const matrixOf = (part: number, t: number): Mat => {
    if (part === lid) return lidMatrix(t);
    const flame = flames.indexOf(part);
    return flame >= 0 ? flameMatrix(flame, t) : IDENTITY;
  };

  return {
    id: 'pot',
    durationS,
    cues: [[0, 6]],
    partMatrix: matrixOf,
    draw(ctx, t, look) {
      drawStrokes(
        ctx,
        scene,
        ctx0.palette,
        (part) => matrixOf(part, t),
        (stroke, i) => {
          if (stroke.part !== steam) return { progress: ownOrReveal(look, i, 1), alpha: 1 };
          if (look.reveal) return null;
          const n = Number(stroke.key.slice(6));
          const start = POT.steam.from + n * POT.steam.gap;
          return {
            progress: easeOut(span(t, start, POT.steam.s)),
            alpha: 1 - span(t, start + POT.steam.s * 0.7, POT.steam.fade),
          };
        },
        look.alpha,
      );
    },
  };
}

// ── 6. Dots — the character of the team's video: a sphere of white dots on a soft glow, turning ─────────────────

const RINGS = 11;
const SPHERE_R = 118;
const GLOW_R = 168;

type Dot = { readonly lat: number; readonly lon: number };

function sphereDots(): Dot[] {
  const dots: Dot[] = [];
  for (let k = 0; k < RINGS; k += 1) {
    const lat = -Math.PI / 2 + (Math.PI * (k + 0.5)) / RINGS;
    const n = Math.max(5, Math.round(28 * Math.cos(lat)));
    for (let j = 0; j < n; j += 1) dots.push({ lat, lon: (2 * Math.PI * (j + (k % 2) * 0.5)) / n });
  }
  return dots;
}

/**
 * A dot on screen at time t of the loop and its depth (−1 back … 1 front). The sphere spins about its axis while the
 * axis tips from facing us (concentric rings — a disc) to lying across (a crescent of near dots) and back.
 */
export function projectDot(
  dot: Dot,
  t: number,
  loopS: number,
): { x: number; y: number; z: number } {
  const s = t / loopS;
  const lon = dot.lon + 2 * Math.PI * s;
  const cx = Math.cos(dot.lat) * Math.cos(lon);
  const cy = Math.cos(dot.lat) * Math.sin(lon);
  const cz = Math.sin(dot.lat);
  const tilt = 0.5 * Math.PI * (0.55 + 0.45 * Math.sin(2 * Math.PI * s));
  const turn = 0.5 + 0.4 * Math.sin(2 * Math.PI * s + 1.2);
  const y1 = cy * Math.cos(tilt) - cz * Math.sin(tilt);
  const z1 = cy * Math.sin(tilt) + cz * Math.cos(tilt);
  return {
    x: SPHERE_R * (cx * Math.cos(turn) - y1 * Math.sin(turn)),
    y: SPHERE_R * (cx * Math.sin(turn) + y1 * Math.cos(turn)),
    z: z1,
  };
}

const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};

export type DotsScene = { readonly scene: SceneData; readonly script: SceneScript };

export function dotsScene(ctx0: SceneContext, loopS: number, calm: boolean): DotsScene {
  const dots = sphereDots();
  const xy = new Float32Array(2 * dots.length);
  dots.forEach((dot, i) => {
    const p = projectDot(dot, 0, loopS);
    xy[2 * i] = p.x;
    xy[2 * i + 1] = p.y;
  });
  const cloud: Cloud = {
    count: dots.length,
    xy,
    color: new Uint8Array(dots.length),
    part: new Uint8Array(dots.length),
  };
  const scene: SceneData = {
    parts: ['dots'],
    strokes: [],
    byKey: new Map(),
    cloudIn: cloud,
    cloudOut: cloud,
  };
  const accent = ctx0.palette[2];
  /** The accent at zero opacity: a gradient to plain «transparent» passes through grey (transparent black). */
  const accentClear = (() => {
    const hex = accent.replace('#', '');
    const value = Number.parseInt(hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex, 16);
    return `rgb(${String((value >> 16) & 255)} ${String((value >> 8) & 255)} ${String(value & 255)} / 0)`;
  })();

  /** The glow: two soft blobs of the accent drifting slowly behind the near side of the sphere (gradients, no blur). */
  function glow(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
    const s = t / loopS;
    const front = projectDot({ lat: Math.PI / 2, lon: 0 }, t, loopS);
    const blobs = [
      {
        x: front.x * 0.55 + 22 * Math.sin(2 * Math.PI * s),
        y: front.y * 0.55 + 16 * Math.cos(2 * Math.PI * s),
        r: GLOW_R,
        a: 0.85,
      },
      {
        x: -front.x * 0.45 + 30 * Math.cos(2 * Math.PI * s + 1),
        y: -front.y * 0.45,
        r: GLOW_R * 0.8,
        a: 0.45,
      },
    ];
    for (const b of blobs) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, accent);
      g.addColorStop(0.45, accent);
      g.addColorStop(1, accentClear);
      ctx.globalAlpha = alpha * b.a * 0.55;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  const script: SceneScript = {
    id: 'dots',
    durationS: loopS,
    cues: [[0, 7]],
    partMatrix: () => IDENTITY,
    draw(ctx, t, look) {
      const formed = look.reveal ? (look.formed ?? 0) : 1;
      if (formed <= 0) return;
      const at = calm ? 0 : t;
      const breathe = calm ? 0.82 + 0.18 * Math.sin((2 * Math.PI * t) / loopS) : 1;
      const alpha = formed * look.alpha * breathe;
      glow(ctx, at, alpha);
      ctx.fillStyle = '#ffffff';
      for (const dot of dots) {
        const p = projectDot(dot, at, loopS);
        const near = smooth(-0.2, 1, p.z);
        if (near <= 0.02) continue;
        ctx.globalAlpha = alpha * (0.35 + 0.65 * near);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.9 + 3.9 * near * backOut(formed), 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
  return { scene, script };
}
