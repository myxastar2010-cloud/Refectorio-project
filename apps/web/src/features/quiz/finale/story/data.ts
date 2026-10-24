/**
 * The story's drawings, decoded once (scripts/story/build.mjs writes them: quantised int16, delta-encoded). Units: a
 * 512 box centred on (0, 0), y down.
 */
export type RawStroke = {
  readonly k: string;
  readonly p: number;
  readonly c: number;
  readonly w: number;
  readonly i: number;
  readonly d: readonly number[];
};
type RawCloud = {
  readonly d: readonly number[];
  readonly c: readonly number[];
  readonly p: readonly number[];
};
export type RawScene = {
  readonly parts: readonly string[];
  readonly strokes: readonly RawStroke[];
  readonly in: RawCloud;
  readonly out: RawCloud;
};
export type RawStory = {
  readonly version: number;
  readonly unit: number;
  readonly meta: {
    readonly page: {
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    };
    readonly planetR: number;
    readonly meridians: number;
    readonly orbit: { readonly rx: number; readonly ry: number; readonly tilt: number };
    readonly satellites: number;
    readonly nodeR: number;
    readonly lens: { readonly x: number; readonly y: number; readonly r: number };
    readonly crane: {
      readonly x: number;
      readonly top: number;
      readonly trolleyFrom: number;
      readonly trolleyAt: number;
      readonly hookY: number;
      readonly slot: {
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
      };
    };
    readonly robot: {
      readonly wheels: readonly (readonly [number, number])[];
      readonly wheelR: number;
      readonly dash: {
        readonly y: number;
        readonly length: number;
        readonly period: number;
        readonly from: number;
        readonly to: number;
      };
    };
    readonly pot: { readonly lidPivot: readonly [number, number] };
  };
  readonly scenes: Readonly<Record<string, RawScene>>;
};

export const INK = 0;
export const MUTED = 1;
export const ACCENT = 2;
export type ColorIndex = typeof INK | typeof MUTED | typeof ACCENT;

export type Stroke = {
  readonly key: string;
  readonly part: number;
  readonly color: ColorIndex;
  /** 0: the main width, 1: the fine one. */
  readonly width: number;
  readonly intro: boolean;
  /** x0, y0, x1, y1, … */
  readonly xy: Float32Array;
  /** Length from the start to each point. */
  readonly along: Float32Array;
  readonly length: number;
};

export type Cloud = {
  readonly count: number;
  readonly xy: Float32Array;
  readonly color: Uint8Array;
  readonly part: Uint8Array;
};

export type SceneData = {
  readonly parts: readonly string[];
  readonly strokes: readonly Stroke[];
  readonly byKey: ReadonlyMap<string, Stroke>;
  readonly cloudIn: Cloud;
  readonly cloudOut: Cloud;
};

function decodePoints(d: readonly number[], unit: number): Float32Array {
  const xy = new Float32Array(d.length);
  let x = 0;
  let y = 0;
  for (let i = 0; i < d.length; i += 2) {
    x += d[i] ?? 0;
    y += d[i + 1] ?? 0;
    xy[i] = x / unit;
    xy[i + 1] = y / unit;
  }
  return xy;
}

function decodeStroke(raw: RawStroke, unit: number): Stroke {
  const xy = decodePoints(raw.d, unit);
  const along = new Float32Array(xy.length / 2);
  for (let i = 1; i < along.length; i += 1) {
    along[i] =
      (along[i - 1] ?? 0) +
      Math.hypot(
        (xy[2 * i] ?? 0) - (xy[2 * i - 2] ?? 0),
        (xy[2 * i + 1] ?? 0) - (xy[2 * i - 1] ?? 0),
      );
  }
  return {
    key: raw.k,
    part: raw.p,
    color: (raw.c as ColorIndex) || INK,
    width: raw.w,
    intro: raw.i === 1,
    xy,
    along,
    length: along[along.length - 1] ?? 0,
  };
}

function decodeCloud(raw: RawCloud, unit: number): Cloud {
  return {
    count: raw.c.length,
    xy: decodePoints(raw.d, unit),
    color: Uint8Array.from(raw.c),
    part: Uint8Array.from(raw.p),
  };
}

export function decodeScene(raw: RawScene, unit: number): SceneData {
  const strokes = raw.strokes.map((s) => decodeStroke(s, unit));
  return {
    parts: raw.parts,
    strokes,
    byKey: new Map(strokes.map((s) => [s.key, s])),
    cloudIn: decodeCloud(raw.in, unit),
    cloudOut: decodeCloud(raw.out, unit),
  };
}

/** The point at `distance` along a stroke (clamped). */
export function pointAlong(stroke: Stroke, distance: number): { x: number; y: number } {
  const { along, xy } = stroke;
  const d = Math.max(0, Math.min(stroke.length, distance));
  let lo = 0;
  let hi = along.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((along[mid] ?? 0) < d) lo = mid;
    else hi = mid;
  }
  const a = along[lo] ?? 0;
  const b = along[hi] ?? a;
  const t = b > a ? (d - a) / (b - a) : 0;
  return {
    x: (xy[2 * lo] ?? 0) + ((xy[2 * hi] ?? 0) - (xy[2 * lo] ?? 0)) * t,
    y: (xy[2 * lo + 1] ?? 0) + ((xy[2 * hi + 1] ?? 0) - (xy[2 * lo + 1] ?? 0)) * t,
  };
}
