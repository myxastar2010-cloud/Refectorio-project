import type { Cloud, SceneData, Stroke } from './data';
import { ACCENT, INK, MUTED } from './data';
import {
  clamp01,
  drawStrokes,
  easeInOut,
  easeOut,
  IDENTITY,
  mat,
  matXY,
  mix,
  mulMat,
  span,
  type Mat,
} from './draw';
import { ownOrReveal, type SceneContext, type SceneScript } from './scenes';

const partIndex = (scene: SceneData, name: string) => scene.parts.indexOf(name);

// ── 3. A tower crane places a block into our interface ──────────────────────────────────────────────────────────

/** Moments of the crane scene (s): the jib swings in, the trolley runs out, the load sways, lowers, snaps, the hook
 * goes back up and a table draws itself on the new card. */
const SWING_S = 1.0;
const TROLLEY = { from: 0.55, s: 0.95 };
const LOWER = { from: 1.65, s: 1.0 };
const SNAP_AT = LOWER.from + LOWER.s;
const RAISE = { from: SNAP_AT + 0.25, s: 0.7 };
const TABLE = { from: SNAP_AT + 0.35, s: 0.75 };

export function craneScene(scene: SceneData, ctx0: SceneContext, durationS: number): SceneScript {
  const { x: mastX, top, trolleyAt, hookY, slot } = ctx0.meta.crane;
  const parts = {
    jib: partIndex(scene, 'jib'),
    trolley: partIndex(scene, 'trolley'),
    cable: partIndex(scene, 'cable'),
    load: partIndex(scene, 'load'),
    block: partIndex(scene, 'block'),
    slot: partIndex(scene, 'slot'),
    table: partIndex(scene, 'table'),
  };
  const drop = slot.y - (hookY + 30);
  const trolleyFrom = mastX - 40;

  /** The jib turning towards us: foreshortened at first, a little overshoot as it stops (follow-through). */
  const jibScale = (t: number) => {
    const u = span(t, 0, SWING_S);
    return mix(0.22, 1, easeOut(u)) + 0.025 * Math.sin(Math.PI * u) * (1 - u);
  };
  const trolleyX = (t: number) => {
    const along = mix(trolleyFrom, trolleyAt, easeInOut(span(t, TROLLEY.from, TROLLEY.s)));
    return mastX + (along - mastX) * jibScale(t);
  };
  /** The load lags behind the trolley and swings on after it stops, dying out. */
  const sway = (t: number) => {
    const run = span(t, TROLLEY.from, TROLLEY.s);
    if (t < TROLLEY.from + TROLLEY.s) return 0.1 * Math.sin(Math.PI * run);
    const after = t - (TROLLEY.from + TROLLEY.s);
    return -0.13 * Math.exp(-after / 0.55) * Math.sin((2 * Math.PI * after) / 0.95);
  };
  const lowered = (t: number) =>
    drop * easeInOut(span(t, LOWER.from, LOWER.s)) -
    (drop + 26) * easeInOut(span(t, RAISE.from, RAISE.s));
  const loadMatrix = (t: number): Mat => {
    const dx = trolleyX(t) - trolleyAt;
    return mulMat(
      mat(dx, lowered(t)),
      mat(0, 0, t < SNAP_AT ? sway(t) : 0, 1, trolleyAt, top + 10),
    );
  };
  const blockMatrix = (t: number): Mat => {
    if (t < SNAP_AT) return loadMatrix(t);
    // In the slot: a squash on contact, then a damped settle.
    const after = t - SNAP_AT;
    const squash = 0.09 * Math.exp(-after / 0.12) * Math.cos((2 * Math.PI * after) / 0.28);
    return matXY(0, drop, 1 + squash * 0.6, 1 - squash, trolleyAt, slot.y + slot.h);
  };
  const matrixOf = (part: number, t: number): Mat => {
    if (part === parts.jib) return matXY(0, 0, jibScale(t), 1, mastX, 0);
    if (part === parts.trolley || part === parts.cable) return mat(trolleyX(t) - trolleyAt, 0);
    if (part === parts.load) return loadMatrix(t);
    if (part === parts.block) return blockMatrix(t);
    return IDENTITY;
  };

  function own(stroke: Stroke, index: number, t: number) {
    if (stroke.part === parts.table) {
      return easeOut(span(t, TABLE.from + (index % 3) * 0.12, TABLE.s));
    }
    return 1;
  }
  function alphaOf(stroke: Stroke, t: number) {
    if (stroke.part === parts.slot) return 1 - span(t, SNAP_AT - 0.15, 0.2);
    if (stroke.key === 'sling') return 1 - span(t, SNAP_AT + 0.05, 0.2);
    return 1;
  }

  return {
    id: 'crane',
    durationS,
    cues: [
      [0, 3],
      [TABLE.from - 0.1, 4],
    ],
    partMatrix: matrixOf,
    draw(ctx, t, look) {
      drawStrokes(
        ctx,
        scene,
        ctx0.palette,
        (part) => matrixOf(part, t),
        (stroke, index) => {
          if (stroke.part === parts.cable && !look.reveal) return null;
          return {
            progress: ownOrReveal(look, index, own(stroke, index, t)),
            alpha: look.reveal ? 1 : alphaOf(stroke, t),
          };
        },
        look.alpha,
      );
      if (look.reveal) return;
      // The cable from the trolley to the hook, at its current length and angle.
      const m = loadMatrix(t);
      const hookX = m[0] * trolleyAt + m[2] * hookY + m[4];
      const hookYNow = m[1] * trolleyAt + m[3] * hookY + m[5];
      ctx.globalAlpha = look.alpha;
      ctx.strokeStyle = ctx0.palette[MUTED];
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(trolleyX(t), top + 10);
      ctx.lineTo(hookX, hookYNow);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  };
}

// ── 4. A delivery robot on a road ────────────────────────────────────────────────────────────────────────────────

const BUMP = { at: 1.55, s: 0.6 };
const BOBS = 6;
const DASH_PERIODS = 3;

export function robotScene(scene: SceneData, ctx0: SceneContext, durationS: number): SceneScript {
  const { wheels, dash } = ctx0.meta.robot;
  const body = partIndex(scene, 'body');
  const antenna = partIndex(scene, 'antenna');
  const dashes = partIndex(scene, 'dashes');
  const wheelParts = wheels.map((_, i) => partIndex(scene, `wheel-${String(i)}`));
  const travel = DASH_PERIODS * dash.period;

  const phase = (t: number) => clamp01(t / durationS);
  const bodyMatrix = (t: number): Mat => {
    const bob = 2.2 * Math.sin(2 * Math.PI * BOBS * phase(t));
    const u = span(t, BUMP.at, BUMP.s);
    const bump = -8 * Math.sin(Math.PI * u);
    // Over the bump the front lifts first, then the back: a pitch back, then forward.
    const pitch = 0.05 * Math.sin(2 * Math.PI * u);
    return mat(0, bob + bump, -pitch, 1, 0, 50);
  };
  const antennaMatrix = (t: number): Mat => {
    // The antenna lags behind the body's bob (secondary motion).
    const lag =
      0.06 * Math.sin(2 * Math.PI * BOBS * phase(t) - 0.9) +
      0.12 * Math.sin(Math.PI * span(t, BUMP.at + 0.1, BUMP.s));
    return mulMat(bodyMatrix(t), mat(0, 0, lag, 1, -70, -42));
  };
  const wheelMatrix = (i: number, t: number): Mat => {
    const [x, y] = wheels[i] ?? [0, 0];
    // Whole quarter turns over the scene: the spokes are back where they started.
    return mat(0, 0, phase(t) * 6 * Math.PI, 1, x, y);
  };
  const matrixOf = (part: number, t: number): Mat => {
    if (part === body) return bodyMatrix(t);
    if (part === antenna) return antennaMatrix(t);
    if (part === dashes) return mat((-travel * phase(t)) % dash.period, 0);
    const wheel = wheelParts.indexOf(part);
    if (wheel >= 0) return wheelMatrix(wheel, t);
    return IDENTITY;
  };

  return {
    id: 'robot',
    durationS,
    cues: [[0, 5]],
    partMatrix: matrixOf,
    draw(ctx, t, look) {
      // Lane marks stream past and fade at the road's ends.
      drawStrokes(
        ctx,
        scene,
        ctx0.palette,
        (part) => matrixOf(part, t),
        (stroke, index) => {
          let alpha = 1;
          if (stroke.part === dashes && !look.reveal) {
            const x = (stroke.xy[0] ?? 0) - ((travel * phase(t)) % dash.period);
            alpha = clamp01((x - dash.from) / 40) * clamp01((dash.to - (x + dash.length)) / 40);
          }
          return { progress: ownOrReveal(look, index, 1), alpha };
        },
        look.alpha,
      );
    },
  };
}

// ── 5. A pot with steam ──────────────────────────────────────────────────────────────────────────────────────────

const LID_LIFT = { from: 0.5, s: 1.1 };

export function potScene(scene: SceneData, ctx0: SceneContext, durationS: number): SceneScript {
  const lid = partIndex(scene, 'lid');
  const [px, py] = ctx0.meta.pot.lidPivot;
  const flames = [0, 1, 2].map((i) => partIndex(scene, `flame-${String(i)}`));
  const steam = partIndex(scene, 'steam');
  const flameBase = scene.byKey.get('burner')?.xy[1] ?? 0;

  const lidMatrix = (t: number): Mat => {
    // The steam pushes the lid up on its hinge; it rattles twice and settles.
    const u = span(t, LID_LIFT.from, LID_LIFT.s);
    const lift = Math.sin(Math.PI * u) * (0.11 + 0.035 * Math.sin(2 * Math.PI * 3 * u));
    return mat(0, 0, -lift, 1, px, py);
  };
  const flameMatrix = (i: number, t: number): Mat => {
    const x = [-44, 0, 44][i] ?? 0;
    const flicker =
      1 +
      0.14 *
        Math.sin(2 * Math.PI * (5.3 * t + i * 0.37)) *
        Math.sin(Math.PI * clamp01(t / durationS) * 7);
    return matXY(0, 0, 1 - (flicker - 1) * 0.4, flicker, x, flameBase - 4);
  };
  const matrixOf = (part: number, t: number): Mat => {
    if (part === lid) return lidMatrix(t);
    const flame = flames.indexOf(part);
    if (flame >= 0) return flameMatrix(flame, t);
    return IDENTITY;
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
        (stroke, index) => {
          if (stroke.part !== steam) return { progress: ownOrReveal(look, index, 1), alpha: 1 };
          if (look.reveal) return null;
          // Curls rise one after another (drawn on from the pot up) and thin out at the top.
          const i = Number(stroke.key.slice(6));
          const start = LID_LIFT.from + 0.2 + i * 0.22;
          return {
            progress: easeOut(span(t, start, 1.0)),
            alpha: 1 - span(t, start + 0.9, 0.9),
          };
        },
        look.alpha,
      );
    },
  };
}

// ── 6. Dots (the reference video's character: a sphere of dots turning, crescent ↔ disc, a soft glow) ─────────────

const RINGS = 9;
const SPHERE_R = 150;

type Dot = { readonly lat: number; readonly lon: number };

function sphereDots(): Dot[] {
  const dots: Dot[] = [];
  for (let k = 0; k < RINGS; k += 1) {
    const lat = -Math.PI / 2 + (Math.PI * (k + 0.5)) / RINGS;
    const n = Math.max(4, Math.round(30 * Math.cos(lat)));
    for (let j = 0; j < n; j += 1) dots.push({ lat, lon: (2 * Math.PI * j) / n });
  }
  return dots;
}

/** A dot's place on screen and its depth (−1 back … 1 front) at time t of the loop. */
export function projectDot(
  dot: Dot,
  t: number,
  loopS: number,
): { x: number; y: number; z: number } {
  const s = t / loopS;
  const lon = dot.lon + 2 * Math.PI * s;
  // On the sphere around its own axis (z up), then the axis tips between facing us and lying across.
  const cx = Math.cos(dot.lat) * Math.cos(lon);
  const cy = Math.cos(dot.lat) * Math.sin(lon);
  const cz = Math.sin(dot.lat);
  const tilt = 0.5 * Math.PI * (0.5 + 0.42 * Math.sin(2 * Math.PI * s));
  const turn = 0.6 + 0.35 * Math.sin(2 * Math.PI * s + 1.1);
  const y1 = cy * Math.cos(tilt) - cz * Math.sin(tilt);
  const z1 = cy * Math.sin(tilt) + cz * Math.cos(tilt);
  const x2 = cx * Math.cos(turn) - y1 * Math.sin(turn);
  const y2 = cx * Math.sin(turn) + y1 * Math.cos(turn);
  return { x: SPHERE_R * x2, y: SPHERE_R * y2, z: z1 };
}

const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};

export type DotsScene = { readonly scene: SceneData; readonly script: SceneScript };

export function dotsScene(ctx0: SceneContext, loopS: number, calm: boolean): DotsScene {
  const dots = sphereDots();
  // The cloud the last drawing flows into: the dots where they are when the loop starts.
  const xy = new Float32Array(2 * dots.length);
  const color = new Uint8Array(dots.length);
  dots.forEach((dot, i) => {
    const p = projectDot(dot, 0, loopS);
    xy[2 * i] = p.x;
    xy[2 * i + 1] = p.y;
    color[i] = p.z > 0.2 ? ACCENT : p.z > -0.3 ? INK : MUTED;
  });
  const cloud: Cloud = { count: dots.length, xy, color, part: new Uint8Array(dots.length) };
  const scene: SceneData = {
    parts: ['dots'],
    strokes: [],
    byKey: new Map(),
    cloudIn: cloud,
    cloudOut: cloud,
  };

  const script: SceneScript = {
    id: 'dots',
    durationS: loopS,
    cues: [[0, 7]],
    partMatrix: () => IDENTITY,
    draw(ctx, t, look) {
      const { palette } = ctx0;
      const formed = look.reveal ? (look.formed ?? 0) : 1;
      if (formed <= 0) return;
      const at = calm ? 0 : t;
      // A soft glow behind, drifting with the turn (a gradient, not a blur).
      const glow = projectDot({ lat: Math.PI / 2, lon: 0 }, at, loopS);
      const gx = glow.x * 0.35;
      const gy = glow.y * 0.35;
      const gradient = ctx.createRadialGradient(gx, gy, 0, gx, gy, SPHERE_R * 1.35);
      gradient.addColorStop(0, palette[ACCENT]);
      gradient.addColorStop(1, 'transparent');
      const breathe = calm ? 0.8 + 0.2 * Math.sin((2 * Math.PI * t) / loopS) : 1;
      ctx.globalAlpha = 0.13 * formed * look.alpha * breathe;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(gx, gy, SPHERE_R * 1.35, 0, 2 * Math.PI);
      ctx.fill();
      for (const dot of dots) {
        const p = projectDot(dot, at, loopS);
        const near = smooth(-0.35, 1, p.z);
        const r = 0.8 + 4.4 * near;
        ctx.globalAlpha = (0.18 + 0.82 * near) * formed * look.alpha * breathe;
        ctx.fillStyle = palette[p.z > 0.2 ? ACCENT : p.z > -0.3 ? INK : MUTED];
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
  return { scene, script };
}
