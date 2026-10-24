// Geometry helpers of the generation story drawings (stage 3, §7): everything is drawn as polylines in a 512-unit box
// centred on (0, 0), y down. Curves are flattened here, at build time — the browser never measures a path.

/** Flattening step along curves (units): fine enough for a smooth draw-on at 520 CSS px. */
export const STEP = 2.5;

export const pt = (x, y) => ({ x, y });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** A straight segment, subdivided so the draw-on and the sampling are even. */
export function line(a, b) {
  const n = Math.max(1, Math.ceil(dist(a, b) / STEP));
  return Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
}

/** A polyline through points (each leg subdivided). */
export function poly(...points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) out.push(...line(points[i - 1], points[i]).slice(1));
  return out;
}

/** A cubic Bézier. */
export function cubic(p0, p1, p2, p3) {
  const rough = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
  const n = Math.max(2, Math.ceil(rough / STEP));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
  });
}

/** A chain of cubic Béziers: [p0, c1, c2, p1, c1, c2, p2, …]. */
export function curve(...points) {
  const out = [points[0]];
  for (let i = 0; i + 3 < points.length; i += 3) {
    out.push(...cubic(points[i], points[i + 1], points[i + 2], points[i + 3]).slice(1));
  }
  return out;
}

/** An elliptical arc from angle a0 to a1 (radians, clockwise on screen as the angle grows), rotated by `rot`. */
export function arc(cx, cy, rx, ry, a0, a1, rot = 0) {
  const span = Math.abs(a1 - a0) * Math.max(rx, ry);
  const n = Math.max(4, Math.ceil(span / STEP));
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    return { x: cx + x * c - y * s, y: cy + x * s + y * c };
  });
}

export const circle = (cx, cy, r, from = -Math.PI / 2) =>
  arc(cx, cy, r, r, from, from + 2 * Math.PI);
export const ellipse = (cx, cy, rx, ry, from = -Math.PI / 2, rot = 0) =>
  arc(cx, cy, rx, ry, from, from + 2 * Math.PI, rot);

/** A rounded rectangle, starting at the top-left corner's end and running clockwise. */
export function roundRect(x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  return [
    ...line(pt(x + k, y), pt(x + w - k, y)),
    ...arc(x + w - k, y + k, k, k, -Math.PI / 2, 0).slice(1),
    ...line(pt(x + w, y + k), pt(x + w, y + h - k)).slice(1),
    ...arc(x + w - k, y + h - k, k, k, 0, Math.PI / 2).slice(1),
    ...line(pt(x + w - k, y + h), pt(x + k, y + h)).slice(1),
    ...arc(x + k, y + h - k, k, k, Math.PI / 2, Math.PI).slice(1),
    ...line(pt(x, y + h - k), pt(x, y + k)).slice(1),
    ...arc(x + k, y + k, k, k, Math.PI, 1.5 * Math.PI).slice(1),
  ];
}

/** Points moved and turned about a pivot. */
export function transform(points, { dx = 0, dy = 0, angle = 0, pivot = pt(0, 0), scale = 1 }) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return points.map((p) => {
    const x = (p.x - pivot.x) * scale;
    const y = (p.y - pivot.y) * scale;
    return { x: pivot.x + x * c - y * s + dx, y: pivot.y + x * s + y * c + dy };
  });
}

/** Length of a polyline. */
export function lengthOf(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += dist(points[i - 1], points[i]);
  return total;
}

/**
 * `count` points spread evenly by length over the strokes (the cloud a drawing dissolves into, or forms from): each
 * carries the colour and the part of its stroke.
 */
export function sample(strokes, count) {
  const lengths = strokes.map((stroke) => lengthOf(stroke.points));
  const total = lengths.reduce((a, b) => a + b, 0);
  const out = [];
  let stroke = 0;
  let before = 0;
  for (let k = 0; k < count; k += 1) {
    const at = ((k + 0.5) * total) / count;
    while (stroke < strokes.length - 1 && before + (lengths[stroke] ?? 0) < at) {
      before += lengths[stroke] ?? 0;
      stroke += 1;
    }
    const points = strokes[stroke].points;
    let along = at - before;
    let i = 1;
    for (; i < points.length; i += 1) {
      const leg = dist(points[i - 1], points[i]);
      if (along <= leg) break;
      along -= leg;
    }
    const a = points[Math.min(i - 1, points.length - 1)];
    const b = points[Math.min(i, points.length - 1)];
    const leg = dist(a, b) || 1;
    const p = lerp(a, b, Math.min(1, along / leg));
    out.push({ x: p.x, y: p.y, color: strokes[stroke].color, part: strokes[stroke].part });
  }
  return out;
}
