// Builds the data of the generation story (stage 3, §7.1): the strokes of every drawing and the point clouds it forms
// from and dissolves into, sampled here — the browser never measures a path. Coordinates are quantised to 1/8 unit
// (int16) and delta-encoded per stroke. Run: `npm run story`.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CRANE,
  DASH,
  HOOK_Y,
  LENS_AT,
  LENS_R,
  LID_PIVOT,
  MERIDIANS,
  NODES,
  PLANET_R,
  POT,
  SCENES,
  SLOT,
  TROLLEY_AT,
  WHEEL_R,
  WHEELS,
} from './drawings.mjs';
import { sample } from './geometry.mjs';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT_FILE = path.join(
  APP_ROOT,
  'apps',
  'web',
  'src',
  'features',
  'quiz',
  'finale',
  'story',
  'story-data.json',
);

/** Points of a cloud (the runtime may halve them on a slow device). */
export const CLOUD_POINTS = 240;
export const UNIT = 8;
const COLORS = ['ink', 'muted', 'accent'];
const WIDTHS = ['main', 'fine'];

/** Absolute quantised coordinates → [x0, y0, dx1, dy1, …]. */
export function encode(points) {
  const out = [];
  let px = 0;
  let py = 0;
  points.forEach((p, i) => {
    const x = Math.round(p.x * UNIT);
    const y = Math.round(p.y * UNIT);
    if (x < -32768 || x > 32767 || y < -32768 || y > 32767) throw new Error('out of int16');
    out.push(i === 0 ? x : x - px, i === 0 ? y : y - py);
    px = x;
    py = y;
  });
  return out;
}

export function buildScene(scene) {
  const parts = [...new Set(scene.strokes.map((s) => s.part))];
  const cloud = (strokes) => {
    const points = sample(strokes, CLOUD_POINTS);
    return {
      d: encode(points),
      c: points.map((p) => COLORS.indexOf(p.color)),
      p: points.map((p) => parts.indexOf(p.part)),
    };
  };
  return {
    parts,
    strokes: scene.strokes.map((s) => ({
      k: s.key,
      p: parts.indexOf(s.part),
      c: COLORS.indexOf(s.color),
      w: WIDTHS.indexOf(s.width),
      i: s.intro ? 1 : 0,
      d: encode(s.points),
    })),
    in: cloud(scene.strokes.filter((s) => s.intro)),
    out: cloud(scene.strokes),
  };
}

export function buildStory() {
  return {
    version: 1,
    unit: UNIT,
    meta: {
      planetR: PLANET_R,
      meridians: MERIDIANS,
      lens: { x: LENS_AT.x, y: LENS_AT.y, r: LENS_R },
      nodes: NODES.map((n) => [n.x, n.y]),
      crane: { ...CRANE, trolleyAt: TROLLEY_AT, hookY: HOOK_Y, slot: SLOT },
      robot: { wheels: WHEELS.map((w) => [w.x, w.y]), wheelR: WHEEL_R, dash: DASH },
      pot: { ...POT, lidPivot: [LID_PIVOT.x, LID_PIVOT.y] },
    },
    scenes: Object.fromEntries(SCENES.map((scene) => [scene.id, buildScene(scene)])),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = buildStory();
  await writeFile(OUT_FILE, `${JSON.stringify(data)}\n`);
  const counts = Object.entries(data.scenes).map(
    ([id, s]) =>
      `${id}: ${s.strokes.length} strokes, ${s.strokes.reduce((n, x) => n + x.d.length / 2, 0)} points`,
  );
  console.log(counts.join('\n'));
}
