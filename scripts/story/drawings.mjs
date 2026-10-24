// The drawings of the generation story (stage 3, §7.2), original line art in a 512-unit box centred on (0, 0).
// A stroke: { key, part, color: 'ink' | 'muted' | 'accent', width: 'main' | 'fine', points, intro? }.
// `part` names a group the scene's code moves at runtime (apps/web/src/features/quiz/finale/story/scenes.ts);
// `intro: false` marks strokes that appear during the scene (the written lines) — the cloud that forms the scene
// lands only on the others.
import { arc, circle, curve, ellipse, line, poly, pt, roundRect, transform } from './geometry.mjs';

const DEG = Math.PI / 180;
const stroke = (key, part, color, width, points, intro = true) => ({
  key,
  part,
  color,
  width,
  points,
  intro,
});

// ── 1. Notebook + pencil ───────────────────────────────────────────────────────────────────────────────────────

/** The notebook's tilt (radians) and pivot: it lies a little askew on the table. */
export const NOTEBOOK_TILT = -5 * DEG;
const NOTEBOOK_PIVOT = pt(-10, 0);
const tilt = (points) => transform(points, { angle: NOTEBOOK_TILT, pivot: NOTEBOOK_PIVOT });

/** Handwriting: loops of a prolate cycloid with a slow wobble of the baseline — reads as cursive at a glance. */
function scribble(x0, y0, length, seed) {
  const loops = Math.max(2, Math.round(length / 13));
  const a = length / (2 * Math.PI * loops);
  const b = 4.2;
  const n = loops * 14;
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = (2 * Math.PI * loops * i) / n;
    const wobble = 1.4 * Math.sin(u * 0.23 + seed);
    return pt(x0 + a * u - b * Math.sin(u), y0 - b * (1 - Math.cos(u)) + wobble);
  });
}

/** The written lines: words with gaps (the pencil lifts there), in writing order. */
export const NOTEBOOK_WORDS = [
  { line: 0, x: -70, length: 66 },
  { line: 0, x: 8, length: 44 },
  { line: 0, x: 64, length: 30 },
  { line: 1, x: -70, length: 40 },
  { line: 1, x: -18, length: 92 },
  { line: 2, x: -70, length: 56 },
  { line: 2, x: -2, length: 34 },
  { line: 2, x: 44, length: 26 },
];
const LINE_Y = [-74, -32, 10];

/** The pencil: tip at (0, 0), the body up and to the right. */
export const PENCIL_ANGLE = -55 * DEG;
function pencil() {
  const u = pt(Math.cos(PENCIL_ANGLE), Math.sin(PENCIL_ANGLE));
  const n = pt(-u.y, u.x);
  const at = (along, side) => pt(u.x * along + n.x * side, u.y * along + n.y * side);
  const w = 8.5;
  return [
    stroke('pencil-graphite', 'pencil', 'accent', 'main', poly(at(9, 3.2), pt(0, 0), at(9, -3.2))),
    stroke('pencil-cone', 'pencil', 'ink', 'main', poly(at(26, w), at(9, 3.2))),
    stroke('pencil-cone-2', 'pencil', 'ink', 'main', poly(at(9, -3.2), at(26, -w))),
    stroke('pencil-wood', 'pencil', 'muted', 'fine', line(at(26, w), at(26, -w))),
    stroke('pencil-body', 'pencil', 'ink', 'main', [
      ...line(at(26, w), at(150, w)),
      ...arc(
        u.x * 150,
        u.y * 150,
        w,
        w,
        PENCIL_ANGLE + Math.PI / 2,
        PENCIL_ANGLE - Math.PI / 2,
      ).slice(1),
      ...line(at(150, -w), at(26, -w)).slice(1),
    ]),
    stroke('pencil-band', 'pencil', 'muted', 'fine', line(at(130, w), at(130, -w))),
    stroke('pencil-band-2', 'pencil', 'muted', 'fine', line(at(137, w), at(137, -w))),
  ];
}

function notebook() {
  const strokes = [
    stroke('cover', 'notebook', 'ink', 'main', tilt(roundedPage())),
    stroke('margin', 'notebook', 'accent', 'fine', tilt(line(pt(-90, -116), pt(-90, 124)))),
  ];
  for (let i = 0; i < 7; i += 1) {
    strokes.push(
      stroke(
        `ring-${i}`,
        'notebook',
        'muted',
        'fine',
        tilt(circle(-98 + i * 29, -138, 8, Math.PI / 2)),
      ),
    );
  }
  NOTEBOOK_WORDS.forEach((word, i) => {
    strokes.push(
      stroke(
        `word-${i}`,
        'notebook',
        'ink',
        'fine',
        tilt(scribble(word.x, LINE_Y[word.line] ?? 0, word.length, i * 1.7)),
        false,
      ),
    );
  });
  strokes.push(
    stroke(
      'tick',
      'notebook',
      'accent',
      'main',
      tilt(poly(pt(46, 58), pt(60, 74), pt(92, 36))),
      false,
    ),
  );
  return [...strokes, ...pencil()];
}

function roundedPage() {
  // The page: a rounded rectangle 230 × 284 (top edge under the rings).
  const x = -125;
  const y = -138;
  const w = 230;
  const h = 284;
  const r = 16;
  return [
    ...line(pt(x + r, y), pt(x + w - r, y)),
    ...arc(x + w - r, y + r, r, r, -Math.PI / 2, 0).slice(1),
    ...line(pt(x + w, y + r), pt(x + w, y + h - r)).slice(1),
    ...arc(x + w - r, y + h - r, r, r, 0, Math.PI / 2).slice(1),
    ...line(pt(x + w - r, y + h), pt(x + r, y + h)).slice(1),
    ...arc(x + r, y + h - r, r, r, Math.PI / 2, Math.PI).slice(1),
    ...line(pt(x, y + h - r), pt(x, y + r)).slice(1),
    ...arc(x + r, y + r, r, r, Math.PI, 1.5 * Math.PI).slice(1),
  ];
}

// ── 2. Magnifier over a turning planet in a network ────────────────────────────────────────────────────────────

export const PLANET_R = 92;
/** Meridians (runtime: they turn by one spacing over the scene, so its last frame equals its first). */
export const MERIDIANS = 4;
export const meridianLongitude = (i) => (22.5 + (i * 180) / MERIDIANS) * DEG;

/** The network around the planet: nodes and links (indices). */
export const NODES = [
  pt(-168, -62),
  pt(-118, -150),
  pt(-14, -178),
  pt(108, -150),
  pt(172, -54),
  pt(164, 74),
  pt(78, 162),
  pt(-58, 166),
  pt(-166, 86),
];
const LINKS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 0],
  [1, 3],
  [5, 7],
];
const SPOKES = [0, 3, 5, 7];
const NODE_R = 7;

/** The magnifier at rest: lens centre here; the handle down and to the right. */
export const LENS_R = 46;
export const LENS_AT = pt(-58, -38);

function planet() {
  const strokes = [
    stroke('planet', 'planet', 'ink', 'main', circle(0, 0, PLANET_R)),
    stroke('equator', 'planet', 'muted', 'fine', ellipse(0, 0, PLANET_R, PLANET_R * 0.17)),
  ];
  for (const sign of [-1, 1]) {
    const y = sign * PLANET_R * 0.5;
    const rx = Math.sqrt(PLANET_R * PLANET_R - y * y);
    strokes.push(
      stroke(`parallel-${sign}`, 'planet', 'muted', 'fine', ellipse(0, y, rx, rx * 0.17)),
    );
  }
  for (let i = 0; i < MERIDIANS; i += 1) {
    const rx = PLANET_R * Math.abs(Math.sin(meridianLongitude(i)));
    strokes.push(
      stroke(`meridian-${i}`, 'meridians', 'muted', 'fine', ellipse(0, 0, rx, PLANET_R)),
    );
  }
  NODES.forEach((node, i) => {
    strokes.push(stroke(`node-${i}`, 'network', 'ink', 'main', circle(node.x, node.y, NODE_R)));
  });
  const gap = (a, b) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const t = (NODE_R + 4) / d;
    return line(
      pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t),
      pt(b.x - (b.x - a.x) * t, b.y - (b.y - a.y) * t),
    );
  };
  LINKS.forEach(([a, b], i) => {
    strokes.push(stroke(`link-${i}`, 'network', 'muted', 'fine', gap(NODES[a], NODES[b])));
  });
  SPOKES.forEach((index, i) => {
    const node = NODES[index];
    const d = Math.hypot(node.x, node.y);
    const surface = pt((node.x / d) * (PLANET_R + 6), (node.y / d) * (PLANET_R + 6));
    const from = pt(node.x - (node.x / d) * (NODE_R + 4), node.y - (node.y / d) * (NODE_R + 4));
    strokes.push(stroke(`spoke-${i}`, 'network', 'muted', 'fine', line(from, surface)));
  });
  const handleFrom = 40;
  const handleTo = 100;
  const u = pt(Math.SQRT1_2, Math.SQRT1_2);
  const n = pt(-u.y, u.x);
  const h = 7;
  const at = (along, side) =>
    pt(LENS_AT.x + u.x * along + n.x * side, LENS_AT.y + u.y * along + n.y * side);
  strokes.push(
    stroke(
      'lens',
      'magnifier',
      'ink',
      'main',
      circle(LENS_AT.x, LENS_AT.y, LENS_R, (-3 * Math.PI) / 4),
    ),
    stroke(
      'glint',
      'magnifier',
      'muted',
      'fine',
      arc(LENS_AT.x, LENS_AT.y, LENS_R - 13, LENS_R - 13, 200 * DEG, 245 * DEG),
    ),
    stroke('handle', 'magnifier', 'ink', 'main', [
      ...line(at(handleFrom, h), at(handleTo, h)),
      ...arc(
        LENS_AT.x + u.x * handleTo,
        LENS_AT.y + u.y * handleTo,
        h,
        h,
        Math.PI / 4 + Math.PI / 2,
        Math.PI / 4 - Math.PI / 2,
      ).slice(1),
      ...line(at(handleTo, -h), at(handleFrom, -h)).slice(1),
    ]),
    stroke(
      'collar',
      'magnifier',
      'ink',
      'main',
      line(at(handleFrom, h + 3), at(handleFrom, -h - 3)),
    ),
  );
  return strokes;
}

// ── 3. A tower crane places a block into our interface ───────────────────────────────────────────────────────────

/** The interface: a browser frame with a header pill, a title, a filled card and an empty slot. */
export const UI = { x: -186, y: -34, w: 270, h: 206 };
export const SLOT = { x: -46, y: 52, w: 110, h: 100 };
/** The crane: mast at x, the jib's underside at `top`; the jib reaches left to `reach`. */
export const CRANE = { x: 150, top: -150, base: 172, reach: -70, counter: 222 };
/** Where the trolley stops: over the slot's centre; the hook hangs at `hookY` before lowering. */
export const TROLLEY_AT = SLOT.x + SLOT.w / 2;
export const HOOK_Y = -40;

/** A dashed outline, as separate short strokes along the perimeter (each draws on by itself). */
function dashedRect(x, y, w, h, dash, gap) {
  const corners = [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h), pt(x, y)];
  const strokes = [];
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    for (let at = 4; at + 2 < length; at += dash + gap) {
      const t0 = at / length;
      const t1 = Math.min(1, (at + dash) / length);
      strokes.push(
        line(
          pt(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0),
          pt(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1),
        ),
      );
    }
  }
  return strokes;
}

/** A zigzag between two chords: along the member from (x0, y0) to (x1, y1), `side` apart. */
function lattice(x0, y0, x1, y1, side, bays) {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const u = pt((x1 - x0) / length, (y1 - y0) / length);
  const n = pt(-u.y, u.x);
  const points = [];
  for (let i = 0; i <= bays; i += 1) {
    const along = (length * i) / bays;
    const s = i % 2 === 0 ? 0 : side;
    points.push(pt(x0 + u.x * along + n.x * s, y0 + u.y * along + n.y * s));
  }
  return poly(...points);
}

function crane() {
  const { x, top, base, reach, counter } = CRANE;
  const strokes = [
    stroke('ui-frame', 'ui', 'ink', 'main', roundRect(UI.x, UI.y, UI.w, UI.h, 14)),
    stroke(
      'ui-header',
      'ui',
      'muted',
      'fine',
      line(pt(UI.x, UI.y + 30), pt(UI.x + UI.w, UI.y + 30)),
    ),
    stroke('ui-pill', 'ui', 'muted', 'fine', roundRect(UI.x + UI.w - 74, UI.y + 9, 58, 13, 6.5)),
    stroke(
      'ui-title',
      'ui',
      'ink',
      'main',
      line(pt(UI.x + 20, UI.y + 52), pt(UI.x + 116, UI.y + 52)),
    ),
    stroke(
      'ui-sub',
      'ui',
      'muted',
      'fine',
      line(pt(UI.x + 20, UI.y + 68), pt(UI.x + 80, UI.y + 68)),
    ),
    stroke('ui-card', 'ui', 'ink', 'main', roundRect(UI.x + 20, SLOT.y, SLOT.w, SLOT.h, 10)),
  ];
  [74, 58, 66].forEach((length, i) => {
    const y = SLOT.y + 22 + i * 18;
    strokes.push(
      stroke(
        `ui-card-line-${i}`,
        'ui',
        'muted',
        'fine',
        line(pt(UI.x + 34, y), pt(UI.x + 34 + length, y)),
      ),
    );
  });
  for (let i = 0; i < 3; i += 1) {
    strokes.push(
      stroke(`ui-dot-${i}`, 'ui', 'muted', 'fine', circle(UI.x + 16 + i * 11, UI.y + 15, 3)),
    );
  }
  dashedRect(SLOT.x, SLOT.y, SLOT.w, SLOT.h, 9, 7).forEach((points, i) => {
    strokes.push(stroke(`slot-${i}`, 'slot', 'muted', 'fine', points));
  });
  // The mast with its lattice, the cab, the apex.
  strokes.push(
    stroke('mast-l', 'mast', 'ink', 'main', line(pt(x - 10, base), pt(x - 10, top))),
    stroke('mast-r', 'mast', 'ink', 'main', line(pt(x + 10, base), pt(x + 10, top))),
    stroke('mast-zig', 'mast', 'muted', 'fine', lattice(x - 10, base, x - 10, top + 12, -20, 14)),
    stroke('mast-foot', 'mast', 'ink', 'main', line(pt(x - 32, base), pt(x + 32, base))),
    stroke('cab', 'mast', 'ink', 'main', roundRect(x - 14, top + 6, 28, 20, 5)),
    stroke(
      'apex',
      'mast',
      'ink',
      'main',
      poly(pt(x - 9, top - 12), pt(x, top - 52), pt(x + 9, top - 12)),
    ),
  );
  // The jib (it swings in: foreshortened at first) with its ties, counterweight and trolley.
  strokes.push(
    stroke('jib-top', 'jib', 'ink', 'main', line(pt(counter, top - 12), pt(reach + 14, top - 12))),
    stroke('jib-bottom', 'jib', 'ink', 'main', line(pt(counter, top), pt(reach, top))),
    stroke('jib-tip', 'jib', 'ink', 'main', line(pt(reach, top), pt(reach + 14, top - 12))),
    stroke(
      'jib-zig',
      'jib',
      'muted',
      'fine',
      lattice(reach + 14, top - 12, x - 12, top - 12, -12, 16),
    ),
    stroke(
      'tie',
      'jib',
      'muted',
      'fine',
      poly(pt(reach + 30, top - 12), pt(x, top - 52), pt(counter - 8, top - 12)),
    ),
    stroke('weight', 'jib', 'ink', 'main', roundRect(counter - 26, top - 4, 24, 26, 4)),
    stroke('trolley', 'trolley', 'ink', 'main', roundRect(TROLLEY_AT - 10, top + 1, 20, 9, 3)),
  );
  // The cable (drawn by the scene at its length), the hook, the slings and the block.
  strokes.push(
    stroke(
      'cable',
      'cable',
      'muted',
      'fine',
      line(pt(TROLLEY_AT, top + 10), pt(TROLLEY_AT, HOOK_Y)),
    ),
    stroke(
      'hook',
      'load',
      'ink',
      'main',
      curve(
        pt(TROLLEY_AT, HOOK_Y),
        pt(TROLLEY_AT, HOOK_Y + 10),
        pt(TROLLEY_AT + 9, HOOK_Y + 12),
        pt(TROLLEY_AT + 7, HOOK_Y + 4),
      ),
    ),
  );
  const blockTop = HOOK_Y + 30;
  strokes.push(
    stroke(
      'sling',
      'load',
      'muted',
      'fine',
      poly(
        pt(SLOT.x + 12, blockTop),
        pt(TROLLEY_AT, HOOK_Y + 12),
        pt(SLOT.x + SLOT.w - 12, blockTop),
      ),
    ),
    stroke('block', 'block', 'ink', 'main', roundRect(SLOT.x, blockTop, SLOT.w, SLOT.h, 10)),
    stroke(
      'block-mark',
      'block',
      'accent',
      'main',
      poly(
        pt(SLOT.x + 22, blockTop + 66),
        pt(SLOT.x + 44, blockTop + 44),
        pt(SLOT.x + 62, blockTop + 58),
        pt(SLOT.x + 88, blockTop + 30),
      ),
    ),
  );
  // «Чертим таблицу»: once the block is in, a table draws itself on it.
  for (let i = 1; i < 3; i += 1) {
    const y = SLOT.y + (SLOT.h * i) / 3;
    strokes.push(
      stroke(
        `table-row-${i}`,
        'table',
        'muted',
        'fine',
        line(pt(SLOT.x + 8, y), pt(SLOT.x + SLOT.w - 8, y)),
        false,
      ),
    );
  }
  const column = SLOT.x + SLOT.w * 0.42;
  strokes.push(
    stroke(
      'table-col',
      'table',
      'muted',
      'fine',
      line(pt(column, SLOT.y + 8), pt(column, SLOT.y + SLOT.h - 8)),
      false,
    ),
  );
  return strokes;
}

// ── 4. A delivery robot on a road ─────────────────────────────────────────────────────────────────────────────────

export const ROAD_Y = 96;
export const WHEELS = [pt(-58, 74), pt(0, 74), pt(58, 74)];
export const WHEEL_R = 20;
/** Lane marks stream past: one period per scene keeps its last frame equal to its first. */
export const DASH = { y: 134, length: 34, period: 64, from: -250, to: 250 };

function robot() {
  const strokes = [
    stroke('road', 'road', 'ink', 'fine', line(pt(-240, ROAD_Y), pt(240, ROAD_Y))),
    stroke('body', 'body', 'ink', 'main', roundRect(-92, -42, 184, 92, 24)),
    stroke('lid', 'body', 'muted', 'fine', line(pt(-80, -16), pt(46, -16))),
    stroke('screen', 'body', 'ink', 'main', roundRect(52, -32, 30, 22, 8)),
    stroke('eye-0', 'body', 'ink', 'main', circle(61, -21, 1.6)),
    stroke('eye-1', 'body', 'ink', 'main', circle(73, -21, 1.6)),
    // A heart on the lid's side: a plate of food on its way.
    stroke(
      'heart',
      'body',
      'accent',
      'main',
      curve(
        pt(-14, 28),
        pt(-36, 14),
        pt(-38, -6),
        pt(-24, -6),
        pt(-18, -6),
        pt(-15, -1),
        pt(-14, 2),
        pt(-13, -1),
        pt(-10, -6),
        pt(-4, -6),
        pt(10, -6),
        pt(8, 14),
        pt(-14, 28),
      ),
    ),
    stroke('antenna', 'antenna', 'ink', 'fine', line(pt(-70, -42), pt(-80, -104))),
    stroke('flag', 'antenna', 'accent', 'main', poly(pt(-80, -104), pt(-50, -96), pt(-78, -86))),
  ];
  WHEELS.forEach((w, i) => {
    strokes.push(
      stroke(`wheel-${i}`, `wheel-${i}`, 'ink', 'main', circle(w.x, w.y, WHEEL_R)),
      stroke(`hub-${i}`, `wheel-${i}`, 'muted', 'fine', circle(w.x, w.y, 5)),
      stroke(
        `spoke-${i}`,
        `wheel-${i}`,
        'muted',
        'fine',
        line(pt(w.x - WHEEL_R + 6, w.y), pt(w.x + WHEEL_R - 6, w.y)),
      ),
      stroke(
        `spoke2-${i}`,
        `wheel-${i}`,
        'muted',
        'fine',
        line(pt(w.x, w.y - WHEEL_R + 6), pt(w.x, w.y + WHEEL_R - 6)),
      ),
    );
  });
  strokes.push(
    stroke(
      'bogie',
      'body',
      'muted',
      'fine',
      poly(pt(-58, 74), pt(-30, 50), pt(0, 74), pt(30, 50), pt(58, 74)),
    ),
  );
  for (let x = DASH.from, i = 0; x + DASH.length <= DASH.to; x += DASH.period, i += 1) {
    strokes.push(
      stroke(
        `dash-${i}`,
        'dashes',
        'muted',
        'main',
        line(pt(x, DASH.y), pt(x + DASH.length, DASH.y)),
      ),
    );
  }
  return strokes;
}

// ── 5. A pot with steam («Пишем рецепты») ─────────────────────────────────────────────────────────────────────────

export const POT = { x: -96, y: -6, w: 192, h: 112 };
/** The lid hinges on its left edge when the steam lifts it. */
export const LID_PIVOT = pt(-102, -8);

function steamCurl(x, i) {
  const y0 = -66;
  return curve(
    pt(x, y0),
    pt(x - 14, y0 - 18),
    pt(x + 14, y0 - 30),
    pt(x, y0 - 48),
    pt(x - 14, y0 - 66),
    pt(x + 12, y0 - 80),
    pt(x + 2 * (i - 1), y0 - 98),
  );
}

function pot() {
  const flameBase = POT.y + POT.h + 22;
  const strokes = [
    stroke('pot', 'pot', 'ink', 'main', roundRect(POT.x, POT.y, POT.w, POT.h, 22)),
    stroke('rim', 'pot', 'ink', 'main', line(pt(POT.x - 12, POT.y), pt(POT.x + POT.w + 12, POT.y))),
    stroke(
      'handle-l',
      'pot',
      'ink',
      'main',
      arc(POT.x - 2, POT.y + 30, 14, 12, Math.PI / 2, 1.5 * Math.PI),
    ),
    stroke(
      'handle-r',
      'pot',
      'ink',
      'main',
      arc(POT.x + POT.w + 2, POT.y + 30, 14, 12, -Math.PI / 2, Math.PI / 2),
    ),
    stroke(
      'band',
      'pot',
      'accent',
      'fine',
      line(pt(POT.x + 18, POT.y + 70), pt(POT.x + POT.w - 18, POT.y + 70)),
    ),
    stroke('lid', 'lid', 'ink', 'main', arc(0, POT.y - 2, POT.w / 2 + 6, 34, Math.PI, 2 * Math.PI)),
    stroke('knob', 'lid', 'ink', 'main', roundRect(-12, POT.y - 48, 24, 12, 6)),
    stroke('burner', 'stove', 'ink', 'main', line(pt(-120, flameBase + 4), pt(120, flameBase + 4))),
  ];
  [-44, 0, 44].forEach((x, i) => {
    strokes.push(
      stroke(
        `flame-${i}`,
        `flame-${i}`,
        'accent',
        'main',
        curve(
          pt(x - 9, flameBase),
          pt(x - 12, flameBase - 12),
          pt(x - 2, flameBase - 16),
          pt(x, flameBase - 24),
          pt(x + 2, flameBase - 16),
          pt(x + 12, flameBase - 12),
          pt(x + 9, flameBase),
        ),
      ),
    );
  });
  [-40, 0, 40].forEach((x, i) => {
    strokes.push(stroke(`steam-${i}`, 'steam', 'muted', 'fine', steamCurl(x, i), false));
  });
  return strokes;
}

export const SCENES = [
  { id: 'notebook', strokes: notebook() },
  { id: 'planet', strokes: planet() },
  { id: 'crane', strokes: crane() },
  { id: 'robot', strokes: robot() },
  { id: 'pot', strokes: pot() },
];
