import { animate, useMotionTemplate, useMotionValue } from 'motion/react';
import { useCallback, useMemo, useRef, type FocusEvent, type PointerEvent } from 'react';
import { useCalmMotion } from './hooks';
import { DURATION, EASE_OUT_EXPO } from './tokens';
import { coverRadius, localPoint, waveDuration, type Point } from './wave';

/**
 * «Black wave» (ТЗ 6.8): a circle grows from the point where the pointer entered up to the far corner
 * and shrinks towards the exit point. The layer above the content is a copy in the "after-wave" colours
 * clipped by clip-path: circle(). Keyboard focus starts the wave from the centre; touch — from the tap.
 */
export function useWave<T extends HTMLElement>() {
  const hostRef = useRef<T | null>(null);
  /** Callback ref for the host element (a function, so reading the hook result in render is fine). */
  const setHost = useCallback((node: T | null) => {
    hostRef.current = node;
  }, []);
  const radius = useMotionValue(0);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const clipPath = useMotionTemplate`circle(${radius}px at ${x}px ${y}px)`;
  const calm = useCalmMotion();

  const size = useCallback(() => {
    const rect = hostRef.current?.getBoundingClientRect();
    return rect ? { rect, box: { width: rect.width, height: rect.height } } : null;
  }, []);

  const grow = useCallback(
    (point: Point, seconds: number) => {
      const s = size();
      if (!s) return;
      // Re-entering while the circle is still visible keeps its centre: moving it would flash.
      if (radius.get() < 1) {
        x.set(point.x);
        y.set(point.y);
      }
      const target = coverRadius({ x: x.get(), y: y.get() }, s.box);
      animate(radius, target, {
        duration: calm ? 0 : waveDuration(target - radius.get(), s.box, seconds),
        ease: EASE_OUT_EXPO,
      });
    },
    [calm, radius, size, x, y],
  );

  const shrink = useCallback(
    (towards: Point | null) => {
      const s = size();
      if (!s) return;
      const center = { x: x.get(), y: y.get() };
      // Fully covered: re-centre on the exit point at a covering radius (no visual change), then shrink there.
      if (towards && radius.get() >= coverRadius(center, s.box) - 0.5) {
        x.set(towards.x);
        y.set(towards.y);
        radius.set(coverRadius(towards, s.box));
      }
      animate(radius, 0, {
        duration: calm ? 0 : waveDuration(radius.get(), s.box, DURATION.wave),
        ease: EASE_OUT_EXPO,
      });
    },
    [calm, radius, size, x, y],
  );

  const handlers = useMemo(
    () => ({
      onPointerEnter(event: PointerEvent<T>) {
        if (event.pointerType === 'touch') return;
        const s = size();
        if (s) grow(localPoint(event.clientX, event.clientY, s.rect), DURATION.wave);
      },
      onPointerLeave(event: PointerEvent<T>) {
        if (event.pointerType === 'touch') return;
        const s = size();
        shrink(s ? localPoint(event.clientX, event.clientY, s.rect) : null);
      },
      onPointerDown(event: PointerEvent<T>) {
        if (event.pointerType !== 'touch') return;
        const s = size();
        if (s) grow(localPoint(event.clientX, event.clientY, s.rect), DURATION.waveTap);
      },
      onPointerUp(event: PointerEvent<T>) {
        if (event.pointerType === 'touch') shrink(null);
      },
      onPointerCancel() {
        shrink(null);
      },
      onFocus(event: FocusEvent<T>) {
        if (!event.currentTarget.matches(':focus-visible')) return;
        const s = size();
        if (s) grow({ x: s.box.width / 2, y: s.box.height / 2 }, DURATION.wave);
      },
      onBlur() {
        shrink(null);
      },
    }),
    [grow, shrink, size],
  );

  return { setHost, handlers, clipPath };
}
