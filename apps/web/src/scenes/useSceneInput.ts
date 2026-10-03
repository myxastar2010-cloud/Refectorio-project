import { useEffect, useRef } from 'react';
import { GESTURE } from '../motion/tokens';
import type { Scene } from '../app/useScene';
import {
  createWheelGesture,
  hasScrollRoom,
  keyDirection,
  keyScrollStepPx,
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
  /** The element that scrolls a scene's content when it does not fit (phones, tablets, small windows). */
  readonly scrollerOf: (scene: Scene) => HTMLElement | null;
};

/**
 * Scene switching by wheel/touchpad, keys and swipes (ТЗ 6.5). One movement — exactly one transition.
 * A scene taller than the screen scrolls first; only a movement that starts at its edge switches scenes.
 */
export function useSceneInput({ scene, go, locked, scrollerOf }: Options) {
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

    /** The active scene's scroll container, only while it really scrolls (the CSS of the layout decides). */
    const activeScroller = () => {
      const element = scrollerOf(sceneRef.current);
      if (!element) return null;
      const { overflowY } = getComputedStyle(element);
      return overflowY === 'auto' || overflowY === 'scroll' ? element : null;
    };

    // A wheel gesture that starts where the content can still scroll belongs to the browser to its very end
    // (inertia included); only a gesture that starts at the edge switches scenes.
    let nativeUntilMs = Number.NEGATIVE_INFINITY;

    const onWheel = (event: WheelEvent) => {
      // Sideways scrolling (the phone carousel) is the browser's.
      if (event.deltaY === 0) return;
      const delta = normalizeWheelDelta(event.deltaY, event.deltaMode, window.innerHeight);
      const scroller = activeScroller();
      if (
        scroller &&
        (hasScrollRoom(scroller, delta < 0 ? 'up' : 'down') || event.timeStamp < nativeUntilMs)
      ) {
        nativeUntilMs = event.timeStamp + GESTURE.wheelQuietMs;
        return;
      }
      event.preventDefault();
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
      if (locked()) return;
      // Home and End jump between the scenes; the other keys first scroll a scene that does not fit.
      const scroller = event.key === 'Home' || event.key === 'End' ? null : activeScroller();
      if (scroller && hasScrollRoom(scroller, direction)) {
        const step = keyScrollStepPx(event.key, scroller.clientHeight);
        scroller.scrollBy({ top: direction === 'down' ? step : -step });
        return;
      }
      // A held key scrolls to the edge and stops there; the next press switches scenes.
      if (!scroller || !event.repeat) navigate(direction);
    };

    type TouchStart = {
      readonly x: number;
      readonly y: number;
      readonly inCarousel: boolean;
      readonly room: Readonly<Record<Direction, boolean>>;
    };
    let touch: TouchStart | null = null;
    const onTouchStart = (event: TouchEvent) => {
      const point = event.touches[0];
      if (!point || event.touches.length > 1) {
        touch = null;
        return;
      }
      const target = event.target as Element | null;
      const scroller = activeScroller();
      touch = {
        x: point.clientX,
        y: point.clientY,
        inCarousel: Boolean(target?.closest('[data-carousel]')),
        room: {
          up: scroller ? hasScrollRoom(scroller, 'up') : false,
          down: scroller ? hasScrollRoom(scroller, 'down') : false,
        },
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
      // A swipe that started with room to scroll was a scroll, not a scene change.
      if (!direction || start.room[direction]) return;
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
  }, [go, locked, scrollerOf]);
}
