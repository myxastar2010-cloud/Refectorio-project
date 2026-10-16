import { animate, useMotionValue, useMotionValueEvent } from 'motion/react';
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { EASE_IN_OUT, FINALE } from '../../../motion/tokens';

export type Box = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};
export type Point = { readonly x: number; readonly y: number };

/**
 * The hand-off of ТЗ §12.1: the filled progress bar (drawn here from the moment it detaches, exactly over the header's
 * bar) contracts into a red dot of its own height, then glides along a soft curve to the core's centre, where the core
 * takes over at the same colour and size. Transform only: scaleX with the corners corrected every frame (R/sx / R).
 */
export function Handoff({
  from,
  to,
  onDone,
}: {
  readonly from: Box;
  readonly to: Point;
  readonly onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const contract = useMotionValue(0);
  const glide = useMotionValue(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const paint = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const c = contract.get();
    const g = glide.get();
    const sx = 1 + (from.height / from.width - 1) * c;
    const start = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
    // A quadratic curve: it leaves the bar sideways-down and falls into the core from above.
    const control = { x: start.x + (to.x - start.x) * 0.15, y: start.y + (to.y - start.y) * 0.85 };
    const u = 1 - g;
    const x = u * u * start.x + 2 * u * g * control.x + g * g * to.x;
    const y = u * u * start.y + 2 * u * g * control.y + g * g * to.y;
    const radius = from.height / 2;
    element.style.transform = `translate(${(x - start.x).toFixed(2)}px, ${(y - start.y).toFixed(2)}px) scaleX(${sx.toFixed(4)})`;
    element.style.borderRadius = `${(radius / sx).toFixed(2)}px / ${radius.toFixed(2)}px`;
  }, [contract, glide, from, to]);
  useMotionValueEvent(contract, 'change', paint);
  useMotionValueEvent(glide, 'change', paint);

  useEffect(() => {
    let cancelled = false;
    // A function, not the flag itself: TypeScript would keep its narrowing across the awaits.
    const stopped = () => cancelled;
    paint();
    const run = async () => {
      await animate(contract, 1, { duration: FINALE.dotMs / 1000, ease: EASE_IN_OUT });
      if (stopped()) return;
      await animate(glide, 1, { duration: FINALE.glideMs / 1000, ease: EASE_IN_OUT });
      if (!stopped()) onDoneRef.current();
    };
    void run();
    return () => {
      cancelled = true;
      contract.stop();
      glide.stop();
    };
  }, [contract, glide, paint]);

  const host = document.querySelector<HTMLElement>('.quiz') ?? document.body;
  return createPortal(
    <div
      ref={ref}
      className="quiz-handoff"
      aria-hidden
      style={{ left: from.left, top: from.top, width: from.width, height: from.height }}
    />,
    host,
  );
}
