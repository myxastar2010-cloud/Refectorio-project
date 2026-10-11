import { WHEEL } from '../../../motion/tokens';

/**
 * Pure maths of the wheel picker (ТЗ §8.3), unit-tested: positions are in «items» (0 = the first value),
 * speeds in items per second.
 */

export type WheelRange = { readonly min: number; readonly max: number; readonly step: number };

export const itemCount = (range: WheelRange) =>
  Math.round((range.max - range.min) / range.step) + 1;
export const valueAt = (range: WheelRange, index: number) => range.min + index * range.step;
export const indexOf = (range: WheelRange, value: number) => (value - range.min) / range.step;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Where a flick ends: the free glide of an exponentially decaying speed (v / friction) from the release position,
 * snapped to the nearest value inside the range. Slow releases simply snap.
 */
export function flingTarget(offset: number, velocity: number, count: number, calm = false): number {
  const speed = clamp(velocity, -WHEEL.maxFlingItemsS, WHEEL.maxFlingItemsS);
  const glide = calm || Math.abs(speed) < WHEEL.snapSpeed ? 0 : speed / WHEEL.friction;
  return clamp(Math.round(offset + glide), 0, count - 1);
}

/** Speed from the last pointer samples (items/s): the slope over at most the last 100 ms. */
export function releaseVelocity(
  samples: readonly { readonly t: number; readonly offset: number }[],
): number {
  const last = samples.at(-1);
  if (!last) return 0;
  const first = samples.find((s) => last.t - s.t <= 100) ?? last;
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? (last.offset - first.offset) / dt : 0;
}

/** Dragging past either end resists (rubber band): beyond the range only a third of the movement shows. */
export function rubberBand(offset: number, count: number): number {
  if (offset < 0) return offset / 3;
  if (offset > count - 1) return count - 1 + (offset - (count - 1)) / 3;
  return offset;
}

/**
 * The cylinder: an item `distance` items away from the centre sits on a drum turned by distance × itemDeg — shown
 * by a vertical shift, foreshortening, size and fading (transform and opacity only, no live blur).
 */
export function drum(distance: number, itemPx: number) {
  const angle = (distance * WHEEL.itemDeg * Math.PI) / 180;
  const radius = itemPx / ((WHEEL.itemDeg * Math.PI) / 180);
  const cos = Math.cos(angle);
  // WHEEL.visible values at rest (ТЗ §8.3: 5–7); the next ones fade out over half an item while the drum turns. At
  // rest the outermost shown value stays readable (≥ 3:1 for this large bold text).
  const edge = WHEEL.visible / 2;
  const inView = Math.min(1, Math.max(0, edge + 0.5 - Math.abs(distance)));
  const visible = inView > 0 && Math.abs(angle) < Math.PI / 2;
  return {
    visible,
    y: radius * Math.sin(angle),
    scaleY: Math.max(0, cos),
    scale: 0.82 + 0.18 * Math.max(0, cos),
    opacity: visible ? (0.2 + 0.8 * Math.max(0, cos) ** 2) * inView : 0,
  };
}

/**
 * Mouse wheel / touchpad → steps (one notch of a mouse = one value whatever the system setting; a touchpad's many
 * small deltas add up to a value per `pxPerStep`). Returns the steps to take and the remainder to keep.
 */
export function wheelSteps(
  deltaY: number,
  deltaMode: number,
  carry: number,
  pxPerStep: number,
): { steps: number; carry: number } {
  if (deltaMode !== 0)
    return { steps: Math.sign(deltaY) * Math.max(1, Math.round(Math.abs(deltaY))), carry: 0 };
  // A real notch (≥ 30 px in Chromium at «1 line», 100+ at «3 lines») is one value.
  if (Math.abs(deltaY) >= 30) return { steps: Math.sign(deltaY), carry: 0 };
  const total = carry + deltaY;
  const steps = Math.trunc(total / pxPerStep);
  return { steps, carry: total - steps * pxPerStep };
}

/** Typed text → value: comma or dot, clamped to the range, rounded to `decimals`. null when it is not a number. */
export function parseTyped(
  text: string,
  range: WheelRange,
  decimals: number,
): { value: number; clamped: boolean } | null {
  const normalised = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalised)) return null;
  const raw = Number(normalised);
  const factor = 10 ** decimals;
  const rounded = Math.round(raw * factor) / factor;
  const value = clamp(rounded, range.min, range.max);
  return { value, clamped: value !== rounded };
}
