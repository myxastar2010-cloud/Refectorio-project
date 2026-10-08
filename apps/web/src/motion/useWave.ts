import {
  animate,
  useMotionTemplate,
  useMotionValue,
  type AnimationPlaybackControlsWithThen,
} from 'motion/react';
import { useCallback, useMemo, useRef, type FocusEvent, type PointerEvent } from 'react';
import { useCalmMotion } from './hooks';
import { DURATION, EASE_OUT_EXPO, WAVE } from './tokens';
import { coverRadius, localPoint, waveDuration, type Point } from './wave';

type Preventable = { preventDefault: () => void };

/**
 * «Black wave» (ТЗ 6.8): a circle grows from the point where the pointer entered up to the far corner
 * and shrinks towards the exit point. The layer above the content is a copy in the "after-wave" colours
 * clipped by clip-path: circle(). Keyboard focus starts the wave from the centre; touch — from the tap, and the
 * button's action waits until the wave has filled it (`act`), as the hover wave does on a computer.
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
  /** When the last touch went down on the host, and the fill it started. */
  const touchedAt = useRef(Number.NEGATIVE_INFINITY);
  const fill = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const laterShrink = useRef(0);

  const size = useCallback(() => {
    const rect = hostRef.current?.getBoundingClientRect();
    return rect ? { rect, box: { width: rect.width, height: rect.height } } : null;
  }, []);

  const grow = useCallback(
    (point: Point, seconds: number, ease: readonly number[] = EASE_OUT_EXPO) => {
      const s = size();
      if (!s) return null;
      // Re-entering while the circle is still visible keeps its centre: moving it would flash.
      if (radius.get() < 1) {
        x.set(point.x);
        y.set(point.y);
      }
      const target = coverRadius({ x: x.get(), y: y.get() }, s.box);
      return animate(radius, target, {
        duration: calm ? 0 : waveDuration(target - radius.get(), s.box, seconds),
        ease: [...ease] as [number, number, number, number],
      });
    },
    [calm, radius, size, x, y],
  );

  const shrink = useCallback(
    (towards: Point | null) => {
      window.clearTimeout(laterShrink.current);
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

  /**
   * Runs a click's action: after a tap — once the wave has filled the button (then the wave goes); mouse and
   * keyboard clicks act at once (their wave already ran on hover / focus). Call it from the click handler.
   */
  const act = useCallback(
    <E extends Preventable>(event: E, action: (event: E) => void) => {
      const tapped = performance.now() - touchedAt.current < WAVE.tapClickWindowMs;
      touchedAt.current = Number.NEGATIVE_INFINITY;
      if (!tapped || calm) {
        action(event);
        return;
      }
      // Links must not follow their address before the action decides (it calls preventDefault itself later).
      event.preventDefault();
      window.clearTimeout(laterShrink.current);
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        action(event);
        laterShrink.current = window.setTimeout(() => {
          shrink(null);
        }, WAVE.tapHoldMs);
      };
      const filling = fill.current;
      fill.current = null;
      if (!filling) {
        run();
        return;
      }
      void filling.then(run);
      // Never wait longer than the fill itself, even if the animation is cut short.
      window.setTimeout(run, DURATION.waveTap * 1000 + WAVE.tapGraceMs);
    },
    [calm, shrink],
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
        if (!s) return;
        window.clearTimeout(laterShrink.current);
        touchedAt.current = performance.now();
        fill.current = grow(
          localPoint(event.clientX, event.clientY, s.rect),
          DURATION.waveTap,
          WAVE.tapEase,
        );
      },
      onPointerUp(event: PointerEvent<T>) {
        if (event.pointerType !== 'touch') return;
        // The click that follows waits for the fill (act); if no click comes, the wave goes by itself.
        window.clearTimeout(laterShrink.current);
        laterShrink.current = window.setTimeout(() => {
          shrink(null);
        }, WAVE.tapNoClickMs);
      },
      onPointerCancel() {
        touchedAt.current = Number.NEGATIVE_INFINITY;
        fill.current = null;
        shrink(null);
      },
      onFocus(event: FocusEvent<T>) {
        // Focus moved by the page after a mouse or touch input is quiet (lib/quietFocus): no wave.
        const host = event.currentTarget;
        if (!host.matches(':focus-visible') || host.hasAttribute('data-quiet-focus')) return;
        const s = size();
        if (s) grow({ x: s.box.width / 2, y: s.box.height / 2 }, DURATION.wave);
      },
      onBlur() {
        shrink(null);
      },
    }),
    [grow, shrink, size],
  );

  return { setHost, handlers, clipPath, act };
}
