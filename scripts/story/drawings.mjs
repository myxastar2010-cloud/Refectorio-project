// The drawings of the generation story (stage 3, §7.2; ADR 0012): original line art in a 512-unit box centred on
// (0, 0), y down. Precise and quiet: every drawing is built on a grid, symmetric where it can be, and stays inside the
// safe area (|x|, |y| ≤ 176) so nothing ever touches the edge of the canvas.
// A stroke: { key, part, color: 'ink' | 'muted' | 'accent', width: 'main' | 'fine', points, intro? }. `part` names a
// group the scene's code moves (apps/web/src/features/quiz/finale/story/); `intro: false` marks strokes that appear
// during the scene — the cloud that forms the drawing lands only on the others.
import { arc, circle, curve, ellipse, line, poly, pt, roundRect } from './geometry.mjs';

/** Nothing is drawn beyond this (units from the centre). */
export const SAFE = 176;

const stroke = (key, part, color, width, points, intro = true) => ({
  key,
  part,
  color,
  width,
  points,
  intro,
});

// ── 1. Notebook + pencil ─────────────────────────────────────────────────────────────────────────────────────────

export const PAGE = { x: -104, y: -132, w: 208, h: 264, r: 20 };
/** The written lines: straight bars from the margin, in writing order; then the tick. */
export const TEXT_LINES = [
  { y: -62, length: 136 },
  { y: -24, length: 112 },
  { y: 14, length: 128 },
];
const TEXT_X = -68;
export const TICK = [pt(-66, 72), pt(-50, 88), pt(-18, 56)];

/** The pencil: tip at (0, 0), the body up and to the right at 45°. */
export const PENCIL_ANGLE = -Math.PI / 4;
function pencil() {
  const u = pt(Math.cos(PENCIL_ANGLE), Math.sin(PENCIL_ANGLE));
  const n = pt(-u.y, u.x);
  const at = (along, side) => pt(u.x * along + n.x * side, u.y * along + n.y * side);
  const w = 9;
  const cone = 24;
  const length = 132;
  return [
    stroke('pencil-graphite', 'pencil', 'accent', 'main', poly(at(8, 3), pt(0, 0), at(8, -3))),
    stroke('pencil-cone', 'pencil', 'ink', 'main', poly(at(cone, w), at(8, 3))),
    stroke('pencil-cone-2', 'pencil', 'ink', 'main', poly(at(8, -3), at(cone, -w))),
    stroke('pencil-body', 'pencil', 'ink', 'main', [
      ...line(at(cone, w), at(length, w)),
      ...arc(
        u.x * length,
        u.y * length,
        w,
        w,
        PENCIL_ANGLE + Math.PI / 2,
        PENCIL_ANGLE - Math.PI / 2,
      ).slice(1),
      ...line(at(length, -w), at(cone, -w)).slice(1),
      ...line(at(cone, -w), at(cone, w)).slice(1),
    ]),
    stroke('pencil-band', 'pencil', 'muted', 'fine', line(at(length - 18, w), at(length - 18, -w))),
  ];
}

function notebook() {
  const strokes = [
    stroke('page', 'notebook', 'ink', 'main', roundRect(PAGE.x, PAGE.y, PAGE.w, PAGE.h, PAGE.r)),
    stroke('rule', 'notebook', 'accent', 'fine', line(pt(TEXT_X, -96), pt(-TEXT_X, -96))),
  ];
  [-60, -20, 20, 60].forEach((x, i) => {
    strokes.push(
      stroke(`ring-${i}`, 'notebook', 'muted', 'fine', circle(x, PAGE.y, 7, Math.PI / 2)),
    );
  });
  TEXT_LINES.forEach(({ y, length }, i) => {
    strokes.push(
      stroke(
        `text-${i}`,
        'notebook',
        'ink',
        'main',
        line(pt(TEXT_X, y), pt(TEXT_X + length, y)),
        false,
      ),
    );
  });
  strokes.push(stroke('tick', 'notebook', 'accent', 'main', poly(...TICK), false));
  strokes.push(stroke('done', 'notebook', 'muted', 'fine', line(pt(4, 72), pt(68, 72)), false));
  return [...strokes, ...pencil()];
}

// ── 2. A magnifier over a turning planet with satellites ────────────────────────────────────────────────────────

export const PLANET_R = 72;
export const MERIDIANS = 2;
export const meridianLongitude = (i) => Math.PI / 4 + (i * Math.PI) / MERIDIANS;
/** The orbit: an ellipse tilted a little, the satellites run along it. */
export const ORBIT = { rx: 152, ry: 50, tilt: (-16 * Math.PI) / 180 };
export const SATELLITES = 3;
export const NODE_R = 6;
/** The magnifier at rest: lens centre here; the handle down and to the right. */
export const LENS_R = 36;
export const LENS_AT = pt(-62, -48);

const orbitPoint = (angle) => {
  const x = ORBIT.rx * Math.cos(angle);
  const y = ORBIT.ry * Math.sin(angle);
  const c = Math.cos(ORBIT.tilt);
  const s = Math.sin(ORBIT.tilt);
  return pt(x * c - y * s, x * s + y * c);
};
export const satelliteAngle = (i) => (2 * Math.PI * i) / SATELLITES + Math.PI / 6;

function planet() {
  const strokes = [
    stroke('planet', 'planet', 'ink', 'main', circle(0, 0, PLANET_R)),
    stroke('equator', 'planet', 'muted', 'fine', ellipse(0, 0, PLANET_R, PLANET_R * 0.2)),
    stroke(
      'orbit',
      'orbit',
      'muted',
      'fine',
      ellipse(0, 0, ORBIT.rx, ORBIT.ry, -Math.PI / 2, ORBIT.tilt),
    ),
  ];
  for (let i = 0; i < MERIDIANS; i += 1) {
    const rx = PLANET_R * Math.abs(Math.sin(meridianLongitude(i)));
    strokes.push(
      stroke(`meridian-${i}`, 'meridians', 'muted', 'fine', ellipse(0, 0, rx, PLANET_R)),
    );
  }
  for (let i = 0; i < SATELLITES; i += 1) {
    const p = orbitPoint(satelliteAngle(i));
    strokes.push(stroke(`node-${i}`, `node-${i}`, 'ink', 'main', circle(p.x, p.y, NODE_R)));
  }
  const u = pt(Math.SQRT1_2, Math.SQRT1_2);
  const n = pt(-u.y, u.x);
  const h = 6;
  const from = LENS_R + 4;
  const to = LENS_R + 46;
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
      arc(
        LENS_AT.x,
        LENS_AT.y,
        LENS_R - 11,
        LENS_R - 11,
        (200 * Math.PI) / 180,
        (250 * Math.PI) / 180,
      ),
    ),
    stroke('handle', 'magnifier', 'ink', 'main', [
      ...line(at(from, h), at(to, h)),
      ...arc(
        LENS_AT.x + u.x * to,
        LENS_AT.y + u.y * to,
        h,
        h,
        (3 * Math.PI) / 4,
        -Math.PI / 4,
      ).slice(1),
      ...line(at(to, -h), at(from, -h)).slice(1),
    ]),
  );
  return strokes;
}

// ── 3. A tower crane sets a block into our interface ─────────────────────────────────────────────────────────────

/** The interface card, its filled card and the empty slot the block fills. */
export const UI = { x: -176, y: -40, w: 212, h: 172, r: 16 };
export const CARD = { x: -156, y: 32, w: 80, h: 80 };
export const SLOT = { x: -64, y: 32, w: 80, h: 80 };
/** The crane: the mast at x, from the foot up to the jib at `top`; the jib reaches left to `reach`. */
export const CRANE = { x: 140, foot: 136, top: -140, reach: -60, end: 176 };
/** Where the block starts (hanging under the trolley near the mast) and where it lands. */
export const TROLLEY_FROM = 92;
export const TROLLEY_AT = SLOT.x + SLOT.w / 2;
export const HOOK_Y = -84;

function dashed(points, dash, gap) {
  // A dashed polyline as separate strokes (they draw on one by one).
  const out = [];
  let current = [];
  let along = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const on = along % (dash + gap) < dash;
    if (on) current.push(a);
    else if (current.length > 0) {
      out.push(current);
      current = [];
    }
    along += length;
  }
  if (current.length > 1) out.push(current);
  return out.filter((s) => s.length > 1);
}

function crane() {
  const { x, foot, top, reach, end } = CRANE;
  const strokes = [
    stroke('ui', 'ui', 'ink', 'main', roundRect(UI.x, UI.y, UI.w, UI.h, UI.r)),
    stroke('ui-bar', 'ui', 'muted', 'fine', line(pt(UI.x, UI.y + 28), pt(UI.x + UI.w, UI.y + 28))),
    stroke('ui-pill', 'ui', 'muted', 'fine', roundRect(UI.x + UI.w - 56, UI.y + 9, 40, 10, 5)),
    stroke(
      'ui-title',
      'ui',
      'ink',
      'main',
      line(pt(UI.x + 20, UI.y + 50), pt(UI.x + 92, UI.y + 50)),
    ),
    stroke('card', 'ui', 'muted', 'fine', roundRect(CARD.x, CARD.y, CARD.w, CARD.h, 10)),
    stroke(
      'card-line-0',
      'ui',
      'muted',
      'fine',
      line(pt(CARD.x + 14, CARD.y + 24), pt(CARD.x + 66, CARD.y + 24)),
    ),
    stroke(
      'card-line-1',
      'ui',
      'muted',
      'fine',
      line(pt(CARD.x + 14, CARD.y + 42), pt(CARD.x + 52, CARD.y + 42)),
    ),
  ];
  dashed(roundRect(SLOT.x, SLOT.y, SLOT.w, SLOT.h, 10), 7, 6).forEach((points, i) => {
    strokes.push(stroke(`slot-${i}`, 'slot', 'muted', 'fine', points));
  });
  strokes.push(
    stroke('mast', 'mast', 'ink', 'main', line(pt(x, foot), pt(x, top))),
    stroke('foot', 'mast', 'ink', 'main', line(pt(x - 24, foot), pt(x + 24, foot))),
    stroke('jib', 'mast', 'ink', 'main', line(pt(reach, top), pt(end, top))),
    stroke('apex', 'mast', 'ink', 'main', poly(pt(x - 12, top), pt(x, top - 32), pt(x + 12, top))),
    stroke(
      'tie',
      'mast',
      'muted',
      'fine',
      poly(pt(reach + 8, top), pt(x, top - 32), pt(end - 4, top)),
    ),
    stroke('weight', 'mast', 'ink', 'main', roundRect(end - 22, top + 4, 22, 18, 4)),
    stroke('trolley', 'trolley', 'ink', 'main', roundRect(TROLLEY_FROM - 9, top + 2, 18, 8, 3)),
    stroke(
      'cable',
      'cable',
      'muted',
      'fine',
      line(pt(TROLLEY_FROM, top + 10), pt(TROLLEY_FROM, HOOK_Y)),
    ),
    stroke(
      'hook',
      'load',
      'ink',
      'main',
      poly(pt(TROLLEY_FROM - 7, HOOK_Y), pt(TROLLEY_FROM + 7, HOOK_Y)),
    ),
    stroke(
      'sling',
      'load',
      'muted',
      'fine',
      poly(
        pt(TROLLEY_FROM - 30, HOOK_Y + 24),
        pt(TROLLEY_FROM, HOOK_Y),
        pt(TROLLEY_FROM + 30, HOOK_Y + 24),
      ),
    ),
  );
  const bx = TROLLEY_FROM - SLOT.w / 2;
  const by = HOOK_Y + 24;
  strokes.push(
    stroke('block', 'block', 'ink', 'main', roundRect(bx, by, SLOT.w, SLOT.h, 10)),
    stroke(
      'block-mark',
      'block',
      'accent',
      'main',
      poly(pt(bx + 20, by + 42), pt(bx + 34, by + 56), pt(bx + 60, by + 28)),
    ),
  );
  // «Чертим таблицу»: once the block is in, a small table draws itself on the filled card next to it.
  [CARD.y + 58, CARD.y + 70].forEach((y, i) => {
    strokes.push(
      stroke(
        `table-${i}`,
        'table',
        'muted',
        'fine',
        line(pt(CARD.x + 14, y), pt(CARD.x + CARD.w - 14, y)),
        false,
      ),
    );
  });
  strokes.push(
    stroke(
      'table-col',
      'table',
      'muted',
      'fine',
      line(pt(CARD.x + 40, CARD.y + 52), pt(CARD.x + 40, CARD.y + 76)),
      false,
    ),
  );
  return strokes;
}

// ── 4. A shopping cart someone sent rolling ─────────────────────────────────────────────────────────────────────

export const FLOOR_Y = 104;
export const CART_WHEEL_R = 12;
export const CART_WHEELS = [pt(-50, FLOOR_Y - CART_WHEEL_R), pt(50, FLOOR_Y - CART_WHEEL_R)];
/** The cart turns about this vertical line (the middle of its body, handle included). */
export const CART_PIVOT_X = -14;
/** The basket: the back edge nearly upright under the handle, the front one leaning in. */
const BASKET = [pt(-82, -34), pt(84, -34), pt(62, 34), pt(-74, 34)];

/** A closed polygon with its corners rounded by `r` (a quadratic corner as a cubic). */
function roundPoly(points, r) {
  const n = points.length;
  const toward = (a, b, d) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return pt(a.x + ((b.x - a.x) * d) / len, a.y + ((b.y - a.y) * d) / len);
  };
  const corner = (i) => {
    const p = points[i];
    const start = toward(p, points[(i - 1 + n) % n], r);
    const end = toward(p, points[(i + 1) % n], r);
    const c1 = pt(start.x + ((p.x - start.x) * 2) / 3, start.y + ((p.y - start.y) * 2) / 3);
    const c2 = pt(end.x + ((p.x - end.x) * 2) / 3, end.y + ((p.y - end.y) * 2) / 3);
    return { start, end, c1, c2 };
  };
  const corners = points.map((_, i) => corner(i));
  const out = [corners[0].end];
  for (let i = 1; i <= n; i += 1) {
    const c = corners[i % n];
    out.push(...line(out[out.length - 1], c.start).slice(1));
    out.push(...curve(c.start, c.c1, c.c2, c.end).slice(1));
  }
  return out;
}

/** The x of the basket's edge from a to b at height y. */
const edgeX = (a, b, y) => a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);

function cart() {
  const [backTop, frontTop, frontBottom, backBottom] = BASKET;
  const handleEnd = pt(-104, -62);
  const dir = pt((handleEnd.x - backTop.x) / 35.6, (handleEnd.y - backTop.y) / 35.6);
  const grip = pt(handleEnd.x + dir.x * 14, handleEnd.y + dir.y * 14);
  const strokes = [
    stroke('floor', 'floor', 'muted', 'fine', line(pt(-SAFE, FLOOR_Y), pt(SAFE, FLOOR_Y))),
    stroke('basket', 'cart', 'ink', 'main', roundPoly(BASKET, 7)),
    stroke('handle', 'cart', 'ink', 'main', line(backTop, handleEnd)),
    stroke('grip', 'cart', 'accent', 'main', line(handleEnd, grip)),
    stroke(
      'wire-h',
      'cart',
      'muted',
      'fine',
      line(pt(edgeX(backTop, backBottom, 0), 0), pt(edgeX(frontTop, frontBottom, 0), 0)),
    ),
    stroke('leg-back', 'cart', 'ink', 'main', line(pt(-70, 34), pt(-56, 80))),
    stroke('leg-front', 'cart', 'ink', 'main', line(pt(58, 34), pt(54, 80))),
    stroke('chassis', 'cart', 'ink', 'main', line(pt(-64, 80), pt(64, 80))),
  ];
  [-46, -10, 26].forEach((x, i) => {
    strokes.push(stroke(`wire-${i}`, 'cart', 'muted', 'fine', line(pt(x, -34), pt(x, 34))));
  });
  // Groceries over the rim: a baguette, an apple, a carton of milk.
  const a = pt(-50, -36);
  const b = pt(-24, -86);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const u = pt((b.x - a.x) / len, (b.y - a.y) / len);
  const nrm = pt(-u.y, u.x);
  const side = (p, d) => pt(p.x + nrm.x * d, p.y + nrm.y * d);
  const angle = Math.atan2(u.y, u.x);
  strokes.push(
    stroke('baguette', 'goods', 'ink', 'main', [
      ...line(side(a, 8), side(b, 8)),
      ...arc(b.x, b.y, 8, 8, angle + Math.PI / 2, angle - Math.PI / 2).slice(1),
      ...line(side(b, -8), side(a, -8)).slice(1),
    ]),
  );
  [0.35, 0.6, 0.85].forEach((at, i) => {
    const c = pt(a.x + u.x * len * at, a.y + u.y * len * at);
    strokes.push(
      stroke(
        `score-${i}`,
        'goods',
        'muted',
        'fine',
        line(
          pt(c.x + nrm.x * 4 - u.x * 4, c.y + nrm.y * 4 - u.y * 4),
          pt(c.x - nrm.x * 4 + u.x * 4, c.y - nrm.y * 4 + u.y * 4),
        ),
      ),
    );
  });
  strokes.push(
    stroke('apple', 'goods', 'accent', 'main', circle(8, -50, 15)),
    stroke('stem', 'goods', 'ink', 'fine', line(pt(8, -64), pt(11, -73))),
    stroke(
      'carton',
      'goods',
      'ink',
      'main',
      poly(pt(38, -36), pt(38, -80), pt(44, -92), pt(58, -92), pt(64, -80), pt(64, -36)),
    ),
    stroke('carton-fold', 'goods', 'muted', 'fine', line(pt(38, -80), pt(64, -80))),
  );
  CART_WHEELS.forEach((w, i) => {
    strokes.push(
      stroke(`wheel-${i}`, `wheel-${i}`, 'ink', 'main', circle(w.x, w.y, CART_WHEEL_R)),
      stroke(`hub-${i}`, `wheel-${i}`, 'muted', 'fine', line(pt(w.x - 6, w.y), pt(w.x + 6, w.y))),
    );
  });
  // Speed lines behind it while it is fast (they appear during the scene).
  [
    [-4, -138, -100],
    [24, -136, -106],
    [52, -128, -98],
  ].forEach(([y, x0, x1], i) => {
    strokes.push(
      stroke(`streak-${i}`, 'streaks', 'muted', 'fine', line(pt(x0, y), pt(x1, y)), false),
    );
  });
  return strokes;
}

// ── 5. A pot with steam («Пишем рецепты») ────────────────────────────────────────────────────────────────────────

export const POT = { x: -88, y: -8, w: 176, h: 104, r: 22 };
/** The lid hinges on its left edge when the steam lifts it. */
export const LID_PIVOT = pt(-96, -10);

function steamCurl(x) {
  // An S that rises: three gentle half-waves.
  const points = [];
  for (let i = 0; i <= 48; i += 1) {
    const t = i / 48;
    points.push(pt(x + 9 * Math.sin(t * Math.PI * 3), -58 - t * 92));
  }
  return points;
}

function pot() {
  const flameBase = POT.y + POT.h + 26;
  const strokes = [
    stroke('pot', 'pot', 'ink', 'main', roundRect(POT.x, POT.y, POT.w, POT.h, POT.r)),
    stroke('rim', 'pot', 'ink', 'main', line(pt(POT.x - 10, POT.y), pt(POT.x + POT.w + 10, POT.y))),
    stroke(
      'handle-l',
      'pot',
      'ink',
      'main',
      arc(POT.x, POT.y + 28, 12, 10, Math.PI / 2, 1.5 * Math.PI),
    ),
    stroke(
      'handle-r',
      'pot',
      'ink',
      'main',
      arc(POT.x + POT.w, POT.y + 28, 12, 10, -Math.PI / 2, Math.PI / 2),
    ),
    stroke(
      'band',
      'pot',
      'accent',
      'fine',
      line(pt(POT.x + 20, POT.y + 66), pt(POT.x + POT.w - 20, POT.y + 66)),
    ),
    stroke('lid', 'lid', 'ink', 'main', arc(0, POT.y - 2, POT.w / 2 + 4, 28, Math.PI, 2 * Math.PI)),
    stroke('knob', 'lid', 'ink', 'main', roundRect(-10, POT.y - 42, 20, 10, 5)),
    stroke('burner', 'stove', 'ink', 'main', line(pt(-112, flameBase + 6), pt(112, flameBase + 6))),
  ];
  [-40, 0, 40].forEach((x, i) => {
    strokes.push(
      stroke(
        `flame-${i}`,
        `flame-${i}`,
        'accent',
        'main',
        curve(
          pt(x, flameBase - 24),
          pt(x + 3, flameBase - 16),
          pt(x + 9, flameBase - 10),
          pt(x + 8, flameBase - 4),
          pt(x + 7, flameBase + 2),
          pt(x - 7, flameBase + 2),
          pt(x - 8, flameBase - 4),
          pt(x - 9, flameBase - 10),
          pt(x - 3, flameBase - 16),
          pt(x, flameBase - 24),
        ),
      ),
    );
  });
  [-36, 0, 36].forEach((x, i) => {
    strokes.push(stroke(`steam-${i}`, 'steam', 'muted', 'fine', steamCurl(x), false));
  });
  return strokes;
}

export const SCENES = [
  { id: 'notebook', strokes: notebook() },
  { id: 'planet', strokes: planet() },
  { id: 'crane', strokes: crane() },
  { id: 'cart', strokes: cart() },
  { id: 'pot', strokes: pot() },
];

/** Every point of every drawing is inside the safe area (checked by the build). */
export function outsideSafe() {
  const out = [];
  for (const scene of SCENES) {
    for (const s of scene.strokes) {
      for (const p of s.points) {
        if (Math.abs(p.x) > SAFE + 0.5 || Math.abs(p.y) > SAFE + 0.5) {
          out.push(`${scene.id}/${s.key} (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
          break;
        }
      }
    }
  }
  return out;
}
