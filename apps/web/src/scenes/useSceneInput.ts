import { useEffect, useRef } from 'react';
import { GESTURE } from '../motion/tokens';
import type { Scene } from '../app/useScene';
import {
  createWheelGesture,
  keyDirection,
  normalizeWheelDelta,
  swipeDirection,
  type Direction,
} from './gesture';

/** Elements that need every key themselves (typing, the carousel's own arrow scrolling). */
const OWNS_KEYS = 'input, textarea, select, [contenteditable="true"], [data-carousel]';
/** Space presses these; the other scene keys still switch scenes from them. */
const CONTROL = 'button, a[href], a[role="link"], [role="button"]';

type Options = {
  readonly scene: Scene;
  readonly go: (scene: Scene) => void;
  /** True while a transition is running (input is locked) or the team dialog is open. */
  readonly locked: () => boolean;
  /** Scroll container of part 2 on phones: a swipe down goes back only when it is scrolled to the top. */
  readonly aboutScroller: () => HTMLElement | null;
};

/**
 * Scene switching by wheel/touchpad, keys and swipes (ТЗ 6.5). One movement — exactly one transition.
 */
export function useSceneInput({ scene, go, locked, aboutScroller }: Options) {
  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    const wheel = createWheelGesture({
      thresholdPx: GESTURE.wheelThresholdPx,
      windowMs: GESTURE.wheelWindowMs,
      quietMs: GESTURE.wheelQuietMs,
      reverseMinPx: GESTURE.wheelReverseMinPx,
    });

    const navigate = (direction: Direction) => {
      const current = sceneRef.current;
      if (direction === 'down' && current === 'hero') go('about');
      else if (direction === 'up' && current === 'about') go('hero');
      else return false;
      wheel.consume();
      return true;
    };

    const onWheel = (event: WheelEvent) => {
      const scroller = aboutScroller();
      // Phone part 2 scrolls internally: let the browser scroll it.
      if (
        scroller &&
        sceneRef.current === 'about' &&
        scroller.scrollHeight > scroller.clientHeight + 1
      )
        return;
      event.preventDefault();
      const delta = normalizeWheelDelta(event.deltaY, event.deltaMode, window.innerHeight);
      const direction = wheel.push(delta, event.timeStamp, locked());
      if (direction) navigate(direction);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as Element | null;
      if (target?.closest(OWNS_KEYS)) return;
      const direction = keyDirection(event.key, event.shiftKey);
      if (!direction) return;
      if (event.key === ' ' && target?.closest(CONTROL)) return;
      event.preventDefault();
      if (!locked()) navigate(direction);
    };

    let touch: { x: number; y: number; inCarousel: boolean; scrollTop: number } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      const point = event.touches[0];
      if (!point || event.touches.length > 1) {
        touch = null;
        return;
      }
      const target = event.target as Element | null;
      touch = {
        x: point.clientX,
        y: point.clientY,
        inCarousel: Boolean(target?.closest('[data-carousel]')),
        scrollTop: aboutScroller()?.scrollTop ?? 0,
      };
    };
    const onTouchEnd = (event: TouchEvent) => {
      const start = touch;
      touch = null;
      const point = event.changedTouches[0];
      if (!start || !point || start.inCarousel || locked()) return;
      const direction = swipeDirection(point.clientX - start.x, point.clientY - start.y, {
        minPx: GESTURE.swipeMinPx,
        dominance: GESTURE.swipeDominance,
      });
      if (!direction) return;
      // Back from part 2 only from the very top of its scroll.
      if (direction === 'up' && sceneRef.current === 'about' && start.scrollTop > 0) return;
      navigate(direction);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [go, locked, aboutScroller]);
}
