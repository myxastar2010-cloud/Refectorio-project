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

// ── 4. A shopping cart someone sent rolling ─────────────────────────────────────────────────────────────────────

/**
 * A hand pulls the cart back a little and lets it go: it rolls on, slowing down, turning once about itself (fast at
 * first), and stops with a rock; the groceries hop at the push and at the stop, speed lines trail it while it is fast.
 */
const CART = {
  startX: -58,
  endX: 14,
  pull: { from: 0.1, s: 0.32, px: 8, lean: 0.045 },
  roll: { from: 0.42, s: 2.2 },
  spin: { from: 0.48, s: 1.95, power: 2.4 },
  rock: { from: 2.18, decayS: 0.2, periodS: 0.42, angle: 0.05 },
  hops: [
    { from: 0.44, s: 0.32, h: 10 },
    { from: 2.2, s: 0.28, h: 5 },
  ],
  /** Speed (units/s) at which the speed lines are fully drawn. */
  fastPxS: 90,
} as const;

export function cartScene(scene: SceneData, ctx0: SceneContext, durationS: number): SceneScript {
  const { wheels, wheelR, floorY, pivotX } = ctx0.meta.cart;
  const cart = partIndex(scene, 'cart');
  const goods = partIndex(scene, 'goods');
  const streaks = partIndex(scene, 'streaks');
  const wheelParts = wheels.map((_, i) => partIndex(scene, `wheel-${String(i)}`));
  const [backWheelX] = wheels[0] ?? [0, 0];

  const pulled = (t: number) => easeInOut(span(t, CART.pull.from, CART.pull.s));
  const x = (t: number) => {
    const u = span(t, CART.roll.from, CART.roll.s);
    const roll = 1 - (1 - u) ** 3;
    return CART.startX - CART.pull.px * pulled(t) + (CART.endX - CART.startX + CART.pull.px) * roll;
  };
  const speed = (t: number) => (x(t + 0.01) - x(t)) / 0.01;
  const turn = (t: number) =>
    2 * Math.PI * (1 - (1 - span(t, CART.spin.from, CART.spin.s)) ** CART.spin.power);
  const lean = (t: number) => {
    // Held back, its front lifts; let go, it drops back onto all wheels at once.
    const held = CART.pull.lean * pulled(t) * (1 - easeOut(span(t, CART.roll.from, 0.16)));
    const after = t - CART.rock.from;
    const rock =
      after > 0
        ? CART.rock.angle *
          Math.exp(-after / CART.rock.decayS) *
          Math.sin((2 * Math.PI * after) / CART.rock.periodS)
        : 0;
    return { held, rock };
  };
  const cartMatrix = (t: number): Mat => {
    const { held, rock } = lean(t);
    // Turning about its own vertical line (seen from the side, its width follows the cosine), leaning on its wheels.
    const spin = matXY(0, 0, Math.cos(turn(t)), 1, pivotX, 0);
    const tilted = mulMat(mat(0, 0, rock, 1, pivotX, floorY), spin);
    return mulMat(mat(x(t), 0, -held, 1, backWheelX, floorY), tilted);
  };
  const hop = (t: number) =>
    CART.hops.reduce((y, h) => y - h.h * Math.sin(Math.PI * span(t, h.from, h.s)), 0);
  const matrixOf = (part: number, t: number): Mat => {
    if (part === cart) return cartMatrix(t);
    if (part === goods) return mulMat(cartMatrix(t), mat(0, hop(t)));
    if (part === streaks) return mat(x(t), 0);
    const wheel = wheelParts.indexOf(part);
    if (wheel < 0) return IDENTITY;
    const [wx, wy] = wheels[wheel] ?? [0, 0];
    return mulMat(cartMatrix(t), mat(0, 0, (x(t) - CART.startX) / wheelR, 1, wx, wy));
  };

  return {
    id: 'cart',
    durationS,
    cues: [[0, 5]],
    partMatrix: matrixOf,
    draw(ctx, t, look) {
      const fast = clamp01(speed(t) / CART.fastPxS);
      drawStrokes(
        ctx,
        scene,
        ctx0.palette,
        (part) => matrixOf(part, t),
        (stroke, i) => {
          if (stroke.part !== streaks) return { progress: ownOrReveal(look, i, 1), alpha: 1 };
          if (look.reveal || fast <= 0.02) return null;
          const n = Number(stroke.key.slice(7));
          return { progress: 1, alpha: fast * (1 - 0.22 * n) };
        },
        look.alpha,
        true,
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

// ── 6. Dots — the team's video: a disc of white dots turning over a soft glow ────────────────────────────────

/**
 * The disc of the team's video: white dots in rings, turning in space — facing us a round disc of concentric rings,
 * turned aside a narrow lens whose near edge is larger (perspective). Its face travels an ellipse around the line of
 * sight once a loop and the dots slide a sixth of a turn around it (the rings' own symmetry: the loop is seamless).
 */
const DISC = { rings: 6, r: 112, yaw: 1.32, pitch: 0.36, camera: 3.4 } as const;

type Dot = { readonly r: number; readonly phi: number };

function discDots(): Dot[] {
  const dots: Dot[] = [{ r: 0, phi: 0 }];
  for (let k = 1; k <= DISC.rings; k += 1) {
    const n = 6 * k;
    for (let j = 0; j < n; j += 1) dots.push({ r: k / DISC.rings, phi: (2 * Math.PI * j) / n });
  }
  return dots;
}

/** Where the disc faces at time t of the loop: yaw and pitch (radians). */
function faceAt(t: number, loopS: number) {
  const s = (2 * Math.PI * t) / loopS;
  return { yaw: DISC.yaw * Math.sin(s), pitch: DISC.pitch * Math.cos(s) };
}

/** A dot on screen at time t of the loop, its depth (−1 back … 1 front) and its perspective scale. */
export function projectDot(
  dot: Dot,
  t: number,
  loopS: number,
): { x: number; y: number; z: number; k: number } {
  const phi = dot.phi + (2 * Math.PI * t) / (6 * loopS);
  const px = dot.r * Math.cos(phi);
  const py = dot.r * Math.sin(phi);
  const { yaw, pitch } = faceAt(t, loopS);
  // Pitch about the x axis, then yaw about the vertical one; z points at the viewer.
  const y1 = py * Math.cos(pitch);
  const z1 = py * Math.sin(pitch);
  const x2 = px * Math.cos(yaw) + z1 * Math.sin(yaw);
  const z2 = -px * Math.sin(yaw) + z1 * Math.cos(yaw);
  const k = DISC.camera / (DISC.camera - z2);
  return { x: DISC.r * x2 * k, y: DISC.r * y1 * k, z: z2, k };
}

/** The disc's facing direction on screen (where the light behind it gathers). */
function faceOnScreen(t: number, loopS: number) {
  const { yaw, pitch } = faceAt(t, loopS);
  return { x: Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch) };
}

const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};

/** A soft round light: a radial gradient with a Gaussian-like falloff (no rim), down to zero alpha. */
const GLOW_STOPS = [
  [0, 1],
  [0.18, 0.88],
  [0.36, 0.62],
  [0.54, 0.34],
  [0.72, 0.13],
  [0.88, 0.03],
  [1, 0],
] as const;

type Rgb = readonly [number, number, number];

const rgbOf = (hex: string): Rgb => {
  const h = hex.replace('#', '');
  const v = Number.parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

export type DotsScene = { readonly scene: SceneData; readonly script: SceneScript };

export function dotsScene(ctx0: SceneContext, loopS: number, calm: boolean): DotsScene {
  const dots = discDots();
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
  const accent = rgbOf(ctx0.palette[2]);
  /** A warmer, lighter companion of the accent (towards coral) for the second light. */
  const warm: Rgb = [
    Math.round(accent[0] + (255 - accent[0]) * 0.6),
    Math.round(accent[1] + (150 - accent[1]) * 0.6),
    Math.round(accent[2] + (110 - accent[2]) * 0.6),
  ];
  const stopsOf = (c: Rgb) =>
    GLOW_STOPS.map(
      ([at, a]) =>
        [at, `rgb(${String(c[0])} ${String(c[1])} ${String(c[2])} / ${a.toFixed(3)})`] as const,
    );
  /**
   * Each light is painted once into a small sprite and stretched: a smooth gradient loses nothing when scaled up, and
   * a drawn bitmap costs far less per frame than a gradient filled anew (slow devices kept ≈ 35 fps with gradients).
   */
  const SPRITE_PX = 128;
  const spriteOf = (c: Rgb): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = SPRITE_PX;
    canvas.height = SPRITE_PX;
    const g2 = canvas.getContext('2d');
    if (g2) {
      const half = SPRITE_PX / 2;
      const g = g2.createRadialGradient(half, half, 0, half, half, half);
      for (const [at, color] of stopsOf(c)) g.addColorStop(at, color);
      g2.fillStyle = g;
      g2.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
    }
    return canvas;
  };
  const accentLight = spriteOf(accent);
  const warmLight = spriteOf(warm);

  function light(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    sprite: HTMLCanvasElement,
    alpha: number,
  ) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - r, y - r, 2 * r, 2 * r);
  }

  /**
   * The glow: a wide haze of three slow lights, a bright core on the side the disc faces (behind it face-on, beside
   * the lens when it turns) and a warmer light drifting on the other side — gradients only, no blur.
   */
  function glow(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
    const s = (2 * Math.PI * t) / loopS;
    const R = DISC.r;
    light(ctx, 26 * Math.sin(s + 0.8), 18 * Math.cos(s), R * 1.95, accentLight, alpha * 0.2);
    light(ctx, -40 * Math.cos(s), 28 * Math.sin(2 * s), R * 1.5, warmLight, alpha * 0.22);
    light(ctx, 34 * Math.cos(2 * s + 1), -30 * Math.sin(s), R * 1.35, accentLight, alpha * 0.18);
    const face = faceOnScreen(t, loopS);
    light(ctx, -face.x * R * 0.3, -face.y * R * 0.3 + 10, R * 0.95, warmLight, alpha * 0.55);
    light(ctx, face.x * R * 0.62, face.y * R * 0.62, R * 0.9, accentLight, alpha * 0.82);
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
      const grow = backOut(formed);
      for (const dot of dots) {
        const p = projectDot(dot, at, loopS);
        // Face-on the dots are already well lit; turned, the near edge grows and the far one fades.
        const near = smooth(-1, 0.6, p.z);
        ctx.globalAlpha = alpha * (0.4 + 0.6 * near);
        ctx.beginPath();
        ctx.arc(p.x, p.y, (1.4 + 3 * near) * p.k * grow, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
  return { scene, script };
}
