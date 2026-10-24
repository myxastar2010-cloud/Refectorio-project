import { ACCENT, MUTED, pointAlong, type RawStory, type SceneData, type Stroke } from './data';
import {
  clamp01,
  drawStrokes,
  easeInOut,
  easeOut,
  IDENTITY,
  mat,
  mix,
  seededRandom,
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

/** Writing speed (units/s) and the pencil's hops: between words, to the next line, to the tick. */
const WRITE_SPEED = 190;
const HOP_WORD_S = 0.1;
const HOP_LINE_S = 0.24;
const HOP_TICK_S = 0.2;
const TICK_S = 0.3;
/** The pencil grows from the hand-off dot, then moves to the first word. */
const GROW_S = 0.55;
const FIRST_HOP_AT = 0.82;
const FIRST_HOP_S = 0.36;
/** How high a hop lifts the tip (units) and the pencil's wobble while it writes. */
const HOP_LIFT = 16;
const WOBBLE_RAD = 0.045;
const WOBBLE_HZ = 6.5;

type Segment =
  | { kind: 'write'; stroke: Stroke; index: number; start: number; end: number }
  | {
      kind: 'hop';
      from: { x: number; y: number };
      to: { x: number; y: number };
      start: number;
      end: number;
      lift: number;
    };

export function notebookScene(scene: SceneData, ctx0: SceneContext): SceneScript {
  const pencil = scene.parts.indexOf('pencil');
  const words = scene.strokes
    .map((stroke, index) => ({ stroke, index }))
    .filter(({ stroke }) => stroke.key.startsWith('word-'));
  const tickIndex = scene.strokes.findIndex((s) => s.key === 'tick');
  const tick = scene.strokes[tickIndex];
  const lineOf = (stroke: Stroke) => Math.round((stroke.xy[1] ?? 0) / 42);

  // The pencil's whole path: the first hop, the words with hops between them, the tick, the rest.
  const segments: Segment[] = [];
  let at = FIRST_HOP_AT;
  let tip = { x: 0, y: 0 };
  words.forEach(({ stroke, index }, i) => {
    const start = pointAlong(stroke, 0);
    const previous = words[i - 1]?.stroke;
    const hopS =
      i === 0
        ? FIRST_HOP_S
        : previous && lineOf(previous) !== lineOf(stroke)
          ? HOP_LINE_S
          : HOP_WORD_S;
    segments.push({ kind: 'hop', from: tip, to: start, start: at, end: at + hopS, lift: HOP_LIFT });
    at += hopS;
    const writeS = stroke.length / WRITE_SPEED;
    segments.push({ kind: 'write', stroke, index, start: at, end: at + writeS });
    at += writeS;
    tip = pointAlong(stroke, stroke.length);
  });
  if (tick) {
    const start = pointAlong(tick, 0);
    segments.push({
      kind: 'hop',
      from: tip,
      to: start,
      start: at,
      end: at + HOP_TICK_S,
      lift: HOP_LIFT,
    });
    at += HOP_TICK_S;
    segments.push({ kind: 'write', stroke: tick, index: tickIndex, start: at, end: at + TICK_S });
    at += TICK_S;
    tip = pointAlong(tick, tick.length);
  }
  // Done: the pencil lifts off a little and rests.
  const rest = { x: tip.x + 18, y: tip.y + 26 };
  segments.push({ kind: 'hop', from: tip, to: rest, start: at, end: at + 0.42, lift: 10 });
  const firstLine = words[0] ? lineOf(words[0].stroke) : 0;
  const secondLineAt =
    segments.find((s) => s.kind === 'write' && lineOf(s.stroke) !== firstLine)?.start ?? at / 2;
  const durationS = Math.max(at + 0.42 + 0.25, 4.6);

  const writing = new Map<number, { start: number; end: number }>();
  for (const s of segments) if (s.kind === 'write') writing.set(s.index, s);

  function tipAt(t: number): { x: number; y: number; lift: number; onPaper: boolean } {
    if (t <= FIRST_HOP_AT) return { x: 0, y: 0, lift: 0, onPaper: false };
    for (const s of segments) {
      if (t > s.end) continue;
      if (t < s.start) break;
      const u = span(t, s.start, s.end - s.start);
      if (s.kind === 'write') {
        const p = pointAlong(s.stroke, s.stroke.length * u);
        return { ...p, lift: 0, onPaper: true };
      }
      const e = easeInOut(u);
      const arc = Math.sin(Math.PI * u);
      return {
        x: mix(s.from.x, s.to.x, e),
        y: mix(s.from.y, s.to.y, e) - s.lift * arc,
        lift: arc,
        onPaper: false,
      };
    }
    return { ...rest, lift: 0, onPaper: false };
  }

  const pencilMatrix = (t: number): Mat => {
    const p = tipAt(t);
    const wobble = p.onPaper ? WOBBLE_RAD * Math.sin(2 * Math.PI * WOBBLE_HZ * t) : 0;
    // Lifted, the pencil comes a touch closer (bigger); it leans back as it travels.
    return mat(p.x, p.y, wobble - 0.06 * p.lift, 1 + 0.05 * p.lift);
  };
  const notebookMatrix = (t: number): Mat =>
    mat(0, 0, 0, mix(0.965, 1, easeOut(span(t, 0, 0.9))), -10, 0);

  function own(stroke: Stroke, index: number, t: number): number {
    const k = stroke.key;
    if (k.startsWith('pencil')) {
      // From the tip outwards: graphite, cone, then the body and its bands.
      const order =
        k === 'pencil-graphite'
          ? 0
          : k.startsWith('pencil-cone')
            ? 1
            : k === 'pencil-wood'
              ? 1.5
              : k === 'pencil-body'
                ? 2
                : 3;
      return easeOut(span(t, 0.04 + order * 0.09, GROW_S * 0.7));
    }
    const write = writing.get(index);
    if (write) return span(t, write.start, write.end - write.start);
    if (k === 'cover') return easeInOut(span(t, 0.1, 0.7));
    if (k === 'margin') return easeOut(span(t, 0.55, 0.4));
    if (k.startsWith('ring-')) return easeOut(span(t, 0.36 + Number(k.slice(5)) * 0.05, 0.3));
    return 1;
  }

  return {
    id: 'notebook',
    durationS,
    // «Считаем калории и БЖУ» as the pencil starts the second line.
    cues: [
      [0, 0],
      [secondLineAt, 1],
    ],
    partMatrix: (part, t) => (part === pencil ? pencilMatrix(t) : notebookMatrix(t)),
    draw(ctx, t, look) {
      drawStrokes(
        ctx,
        scene,
        ctx0.palette,
        (part) => (part === pencil ? pencilMatrix(t) : notebookMatrix(t)),
        (stroke, index) => ({
          progress: ownOrReveal(look, index, own(stroke, index, t)),
          alpha: 1,
        }),
        look.alpha,
      );
      // The hand-off dot becomes the pencil's tip.
      if (!look.reveal && t < 0.4) {
        const r = mix(ctx0.dotR, 2.2, easeInOut(span(t, 0.02, 0.36)));
        ctx.globalAlpha = look.alpha;
        ctx.fillStyle = ctx0.palette[ACCENT];
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
  };
}

// ── 2. Magnifier over a turning planet in a network ──────────────────────────────────────────────────────────────

const PACKETS = 4;

export function planetScene(scene: SceneData, ctx0: SceneContext, durationS: number): SceneScript {
  const { planetR: R, meridians: M, lens, nodes } = ctx0.meta;
  const magnifier = scene.parts.indexOf('magnifier');
  const meridianPart = scene.parts.indexOf('meridians');
  const random = seededRandom(ctx0.seed + 2);
  const packets = Array.from({ length: PACKETS }, () => {
    const a = Math.floor(random() * nodes.length);
    const b = (a + 1 + Math.floor(random() * 2)) % nodes.length;
    return { a, b, phase: random(), speed: 0.45 + random() * 0.35 };
  });
  const pings = new Map<number, number>();

  /** The lens glides across the planet and back (eased at both ends, so the scene loops into itself). */
  const lensOffset = (t: number) => {
    const s = easeInOut(clamp01(t / durationS));
    return { x: 128 * Math.sin(Math.PI * s), y: 66 * Math.sin(2 * Math.PI * s) };
  };
  const magnifierMatrix = (t: number): Mat => {
    const o = lensOffset(t);
    const lean = 0.14 * Math.sin(2 * Math.PI * easeInOut(clamp01(t / durationS)));
    return mat(o.x, o.y, lean, 1, lens.x, lens.y);
  };
  const longitude = (i: number, t: number) =>
    ((22.5 + (i * 180) / M) * Math.PI) / 180 + (Math.PI / M) * clamp01(t / durationS);

  return {
    id: 'planet',
    durationS,
    cues: [[0, 2]],
    partMatrix: (part, t) => (part === magnifier ? magnifierMatrix(t) : IDENTITY),
    draw(ctx, t, look) {
      const { palette } = ctx0;
      const lensAt = (() => {
        const o = lensOffset(t);
        return { x: lens.x + o.x, y: lens.y + o.y };
      })();
      drawStrokes(
        ctx,
        scene,
        palette,
        (part) => (part === magnifier ? magnifierMatrix(t) : IDENTITY),
        (stroke, index) => {
          // The meridians turn: drawn below from the formula (their stored strokes are the first frame).
          if (stroke.part === meridianPart && !look.reveal) return null;
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
      // Packets run along the links like traffic.
      ctx.fillStyle = palette[ACCENT];
      for (const p of packets) {
        const a = nodes[p.a];
        const b = nodes[p.b];
        if (!a || !b) continue;
        const u = (p.phase + t * p.speed) % 1;
        const fade = Math.sin(Math.PI * u);
        ctx.globalAlpha = look.alpha * fade;
        ctx.beginPath();
        ctx.arc(mix(a[0], b[0], u), mix(a[1], b[1], u), 3.2, 0, 2 * Math.PI);
        ctx.fill();
      }
      // Nodes under the lens light up red and send out a ring.
      ctx.lineWidth = STROKE_WIDTHS[0];
      nodes.forEach(([x, y], i) => {
        const d = Math.hypot(x - lensAt.x, y - lensAt.y);
        const lit = clamp01((lens.r + 14 - d) / 22);
        if (lit > 0.5 && !pings.has(i)) pings.set(i, t);
        if (lit > 0) {
          ctx.globalAlpha = look.alpha * lit;
          ctx.strokeStyle = palette[ACCENT];
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.fillStyle = palette[ACCENT];
          ctx.beginPath();
          ctx.arc(x, y, 3 * lit, 0, 2 * Math.PI);
          ctx.fill();
        }
        const pinged = pings.get(i);
        if (pinged !== undefined) {
          const u = (t - pinged) / 0.7;
          if (u >= 1 || u < 0) pings.delete(i);
          else {
            ctx.globalAlpha = look.alpha * 0.55 * (1 - u);
            ctx.strokeStyle = palette[ACCENT];
            ctx.lineWidth = STROKE_WIDTHS[1];
            ctx.beginPath();
            ctx.arc(x, y, 8 + 18 * easeOut(u), 0, 2 * Math.PI);
            ctx.stroke();
            ctx.lineWidth = STROKE_WIDTHS[0];
          }
        }
      });
      ctx.globalAlpha = 1;
    },
  };
}
