import { ACCENT, MUTED, pointAlong, type RawStory, type SceneData, type Stroke } from './data';
import {
  clamp01,
  drawStrokes,
  easeInOut,
  easeOut,
  IDENTITY,
  mat,
  mix,
  span,
  STROKE_WIDTHS,
  type Mat,
  type Palette,
} from './draw';

/** How a scene is drawn now: its own timing, or the draw-on of a transformation (stroke index → 0…1). */
export type Look = {
  readonly reveal: ((index: number) => number) | null;
  readonly alpha: number;
  /** During a transformation: how far the new drawing has formed (0…1), for drawings without strokes. */
  readonly formed?: number;
};

export type SceneScript = {
  readonly id: string;
  readonly durationS: number;
  /** Captions that start inside the scene: [seconds from its start, caption index]. */
  readonly cues: readonly (readonly [number, number])[];
  /** Where a part is at `t` (its cloud points move with it). */
  partMatrix(part: number, t: number): Mat;
  draw(ctx: CanvasRenderingContext2D, t: number, look: Look): void;
};

export type SceneContext = {
  readonly palette: Palette;
  readonly meta: RawStory['meta'];
  readonly seed: number;
  /** The hand-off dot's radius in story units (the first scene grows from it). */
  readonly dotR: number;
};

export const ownOrReveal = (look: Look, index: number, own: number) =>
  look.reveal ? look.reveal(index) : own;

// ── 1. Notebook + pencil ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * The pencil's day (s): it grows from the hand-off dot, hops to the first line, writes three lines (each eased in and
 * out, as a hand does), hops to the tick, then lifts away to rest. Hops are arcs; the pencil leans back as it travels.
 */
const NOTEBOOK = {
  grow: { from: 0.02, s: 0.42 },
  page: { from: 0.08, s: 0.66 },
  rule: { from: 0.5, s: 0.36 },
  rings: { from: 0.52, gap: 0.05, s: 0.24 },
  firstHop: { from: 0.62, s: 0.34 },
  lines: [
    { from: 0.98, s: 0.48 },
    { from: 1.68, s: 0.42 },
    { from: 2.32, s: 0.46 },
  ],
  tick: { from: 3.02, s: 0.3 },
  done: { from: 3.28, s: 0.34 },
  rest: { from: 3.36, s: 0.44 },
  durationS: 4.0,
  hopLift: 18,
  /** Where the pencil rests (its tip) when it is done. */
  restAt: { x: 46, y: 104 },
} as const;

export function notebookScene(scene: SceneData, ctx0: SceneContext): SceneScript {
  const pencil = scene.parts.indexOf('pencil');
  const index = (key: string) => scene.strokes.findIndex((s) => s.key === key);
  const texts = [0, 1, 2].map((i) => scene.strokes[index(`text-${String(i)}`)]);
  const tick = scene.strokes[index('tick')];
  const ends = (stroke: Stroke | undefined) =>
    stroke ? { start: pointAlong(stroke, 0), end: pointAlong(stroke, stroke.length) } : null;

  type Leg =
    | {
        kind: 'hop';
        from: { x: number; y: number };
        to: { x: number; y: number };
        at: number;
        s: number;
      }
    | { kind: 'write'; stroke: Stroke; at: number; s: number };
  const legs: Leg[] = [];
  let tip = { x: 0, y: 0 };
  let at: number = NOTEBOOK.firstHop.from;
  const writes: { stroke: Stroke | undefined; timing: { from: number; s: number } }[] = [
    ...texts.map((stroke, i) => ({ stroke, timing: NOTEBOOK.lines[i] ?? NOTEBOOK.lines[0] })),
    { stroke: tick, timing: NOTEBOOK.tick },
  ];
  for (const { stroke, timing } of writes) {
    const e = ends(stroke);
    if (!stroke || !e) continue;
    legs.push({ kind: 'hop', from: tip, to: e.start, at, s: timing.from - at });
    legs.push({ kind: 'write', stroke, at: timing.from, s: timing.s });
    tip = e.end;
    at = timing.from + timing.s;
  }
  legs.push({
    kind: 'hop',
    from: tip,
    to: NOTEBOOK.restAt,
    at: NOTEBOOK.rest.from,
    s: NOTEBOOK.rest.s,
  });

  function tipAt(t: number): { x: number; y: number; lift: number } {
    if (t < NOTEBOOK.firstHop.from) return { x: 0, y: 0, lift: 0 };
    for (const leg of legs) {
      if (t > leg.at + leg.s) continue;
      const u = span(t, leg.at, leg.s);
      if (leg.kind === 'write')
        return { ...pointAlong(leg.stroke, leg.stroke.length * easeInOut(u)), lift: 0 };
      const e = easeInOut(u);
      const arc = Math.sin(Math.PI * e);
      return {
        x: mix(leg.from.x, leg.to.x, e),
        y: mix(leg.from.y, leg.to.y, e) - NOTEBOOK.hopLift * arc,
        lift: arc,
      };
    }
    return { ...NOTEBOOK.restAt, lift: 0 };
  }
  const pencilMatrix = (t: number): Mat => {
    const p = tipAt(t);
    return mat(p.x, p.y, -0.1 * p.lift, 1 + 0.04 * p.lift);
  };
  const timingOf = (key: string): { from: number; s: number } | null => {
    if (key === 'page') return NOTEBOOK.page;
    if (key === 'rule') return NOTEBOOK.rule;
    if (key === 'tick') return NOTEBOOK.tick;
    if (key === 'done') return NOTEBOOK.done;
    if (key.startsWith('text-')) return NOTEBOOK.lines[Number(key.slice(5))] ?? null;
    if (key.startsWith('ring-')) {
      return {
        from: NOTEBOOK.rings.from + Number(key.slice(5)) * NOTEBOOK.rings.gap,
        s: NOTEBOOK.rings.s,
      };
    }
    return null;
  };
  function own(stroke: Stroke, t: number): number {
    if (stroke.part === pencil) {
      const order =
        stroke.key === 'pencil-graphite' ? 0 : stroke.key.startsWith('pencil-cone') ? 1 : 2;
      return easeOut(span(t, NOTEBOOK.grow.from + order * 0.08, NOTEBOOK.grow.s * 0.75));
    }
    const timing = timingOf(stroke.key);
    if (!timing) return 1;
    // The written lines follow the pencil exactly (the same easing as its tip).
    const u = span(t, timing.from, timing.s);
    return stroke.key.startsWith('text-') || stroke.key === 'tick' ? easeInOut(u) : easeOut(u);
  }

  return {
    id: 'notebook',
    durationS: NOTEBOOK.durationS,
    cues: [
      [0, 0],
      [NOTEBOOK.lines[1].from, 1],
    ],
    partMatrix: (part, t) => (part === pencil ? pencilMatrix(t) : IDENTITY),
    draw(ctx, t, look) {
      drawStrokes(
        ctx,
        scene,
        ctx0.palette,
        (part) => (part === pencil ? pencilMatrix(t) : IDENTITY),
        (stroke, i) => ({ progress: ownOrReveal(look, i, own(stroke, t)), alpha: 1 }),
        look.alpha,
      );
      // The hand-off dot shrinks into the pencil's graphite.
      if (!look.reveal && t < 0.36) {
        ctx.globalAlpha = look.alpha;
        ctx.fillStyle = ctx0.palette[ACCENT];
        ctx.beginPath();
        ctx.arc(0, 0, mix(ctx0.dotR, 2.4, easeInOut(span(t, 0, 0.34))), 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
  };
}

// ── 2. A magnifier over a turning planet with satellites ────────────────────────────────────────────────────────

export function planetScene(scene: SceneData, ctx0: SceneContext, durationS: number): SceneScript {
  const { planetR: R, meridians: M, orbit, satellites, lens } = ctx0.meta;
  const magnifier = scene.parts.indexOf('magnifier');
  const meridianPart = scene.parts.indexOf('meridians');
  const nodeParts = Array.from({ length: satellites }, (_, i) =>
    scene.parts.indexOf(`node-${String(i)}`),
  );
  const s = (t: number) => clamp01(t / durationS);
  const orbitPoint = (angle: number) => {
    const x = orbit.rx * Math.cos(angle);
    const y = orbit.ry * Math.sin(angle);
    const c = Math.cos(orbit.tilt);
    const n = Math.sin(orbit.tilt);
    return { x: x * c - y * n, y: x * n + y * c, behind: Math.sin(angle) < 0 };
  };
  // A third of a turn per scene: the satellites trade places, so the last frame equals the first.
  const satelliteAngle = (i: number, t: number) =>
    (2 * Math.PI * i) / satellites + Math.PI / 6 + ((2 * Math.PI) / satellites) * easeInOut(s(t));
  /** The lens circles the globe once, slowing at both ends (its last frame equals its first). */
  const lensCentre = (t: number) => {
    const radius = Math.hypot(lens.x, lens.y);
    const start = Math.atan2(lens.y, lens.x);
    const a = start + 2 * Math.PI * easeInOut(s(t));
    return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
  };
  const magnifierMatrix = (t: number): Mat => {
    const c = lensCentre(t);
    // A small zoom as it passes over the middle of the globe.
    const zoom = 1 + 0.06 * Math.sin(Math.PI * s(t) * 2) ** 2;
    return mat(c.x - lens.x, c.y - lens.y, 0, zoom, lens.x, lens.y);
  };
  const nodeMatrix = (i: number, t: number): Mat => {
    const a = orbitPoint(satelliteAngle(i, 0));
    const b = orbitPoint(satelliteAngle(i, t));
    return mat(b.x - a.x, b.y - a.y);
  };
  const matrixOf = (part: number, t: number): Mat => {
    if (part === magnifier) return magnifierMatrix(t);
    const node = nodeParts.indexOf(part);
    return node >= 0 ? nodeMatrix(node, t) : IDENTITY;
  };
  const longitude = (i: number, t: number) =>
    Math.PI / 4 + (i * Math.PI) / M + (Math.PI / M) * easeInOut(s(t));

  return {
    id: 'planet',
    durationS,
    cues: [[0, 2]],
    partMatrix: matrixOf,
    draw(ctx, t, look) {
      const { palette } = ctx0;
      const c = lensCentre(t);
      drawStrokes(
        ctx,
        scene,
        palette,
        (part) => matrixOf(part, t),
        (stroke, index) => {
          if (stroke.part === meridianPart && !look.reveal) return null;
          const node = nodeParts.indexOf(stroke.part);
          if (node >= 0 && !look.reveal) {
            const p = orbitPoint(satelliteAngle(node, t));
            // Behind the globe, a satellite dims; under the lens it turns red.
            const hidden = p.behind && Math.hypot(p.x, p.y) < R + 4;
            const lit = clamp01((lens.r + 8 - Math.hypot(p.x - c.x, p.y - c.y)) / 16);
            return {
              progress: 1,
              alpha: hidden ? 0.25 : 1,
              ...(lit > 0.5 ? { color: ACCENT } : {}),
            };
          }
          return { progress: ownOrReveal(look, index, 1), alpha: 1 };
        },
        look.alpha,
      );
      if (look.reveal) return;
      ctx.globalAlpha = look.alpha;
      ctx.strokeStyle = palette[MUTED];
      ctx.lineWidth = STROKE_WIDTHS[1];
      for (let i = 0; i < M; i += 1) {
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          Math.max(0.5, R * Math.abs(Math.sin(longitude(i, t)))),
          R,
          0,
          0,
          2 * Math.PI,
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  };
}
