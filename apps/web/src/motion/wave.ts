/** Geometry of the WaveHover circle (pure, unit-tested). */

export type Point = { readonly x: number; readonly y: number };
export type Size = { readonly width: number; readonly height: number };

/** Radius that covers the whole element from point p: distance to the farthest corner. */
export function coverRadius(p: Point, size: Size): number {
  const dx = Math.max(p.x, size.width - p.x);
  const dy = Math.max(p.y, size.height - p.y);
  return Math.hypot(dx, dy);
}

/** Pointer position relative to the element, clamped to its box (entry/exit points can be a pixel outside). */
export function localPoint(clientX: number, clientY: number, rect: DOMRectReadOnly): Point {
  return {
    x: Math.min(Math.max(clientX - rect.left, 0), rect.width),
    y: Math.min(Math.max(clientY - rect.top, 0), rect.height),
  };
}

/** Wave duration scales with the distance so small and large elements feel equally fast. */
export function waveDuration(radius: number, size: Size, baseSeconds: number): number {
  const full = Math.hypot(size.width, size.height);
  if (full === 0) return 0;
  return baseSeconds * Math.min(1, 0.6 + (0.4 * radius) / full);
}
