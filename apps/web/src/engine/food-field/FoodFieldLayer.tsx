import { m } from 'motion/react';
import { useEffect, useRef } from 'react';
import type { Scene } from '../../app/useScene';
import { foodSprites } from '../../lib/assets';
import type { TestParams } from '../../lib/params';
import { useCalmMotion } from '../../motion/hooks';
import { DURATION, EASE_OUT_EXPO, SCENE } from '../../motion/tokens';
import { createFoodField, type Device, type FoodField } from './engine';
import type { Rect } from './math';

const RESIZE_DEBOUNCE_MS = 200;
const BLUR_PRELOAD_MS = 2500;
const NOT_FOOD = '[data-opaque], button, a, input, textarea, select, [role="dialog"]';

type Props = {
  readonly scene: Scene;
  readonly params: TestParams;
  readonly teamOpen: boolean;
};

declare global {
  interface Window {
    /** Test hook (only with ?seed, ?freeze or ?pose): read-only view of the field for e2e tests. */
    __refectorioFood?: Pick<FoodField, 'snapshot' | 'hitTest'>;
  }
}

function device(): Device {
  const width = window.innerWidth;
  if (width < 768) return 'phone';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/** The 1920×1080 mockup frame inside the viewport (same geometry as .stage in layout.css). */
function frame() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  return { scale, left: (window.innerWidth - 1920 * scale) / 2, top: 0 };
}

function obstacles(): Rect[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      // The header belongs to part 1: it is inert (and invisible) in part 2.
      '[data-scene-active="true"] [data-food-avoid], .site-header:not([inert]) [data-food-avoid]',
    ),
  ]
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }));
}

/**
 * React wrapper of the food engine (ТЗ 6.7). The camera layer recedes in part 2 exactly as in Figma
 * (scale 0.8874 about a point below the frame), the sharp sprites cross-fade into pre-blurred ones.
 */
export function FoodFieldLayer({ scene, params, teamOpen }: Props) {
  const sharpRef = useRef<HTMLDivElement>(null);
  const blurRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<FoodField | null>(null);
  const sceneRef = useRef(scene);
  const teamOpenRef = useRef(teamOpen);
  const calm = useCalmMotion();
  const about = scene === 'about';

  useEffect(() => {
    sceneRef.current = scene;
    teamOpenRef.current = teamOpen;
    const field = fieldRef.current;
    if (!field) return;
    field.setSpeedFactor(about ? SCENE.food.speedFactor : 1);
    field.setObstacles(about ? [] : obstacles());
    if (about) field.ensureBlur();
  }, [scene, teamOpen, about]);

  useEffect(() => {
    const sharpPlane = sharpRef.current;
    const blurPlane = blurRef.current;
    if (!sharpPlane || !blurPlane) return;
    const field = createFoodField({
      sprites: foodSprites,
      sharpPlane,
      blurPlane,
      seed: params.seed ?? Math.floor(Math.random() * 1e9),
      reduced: calm,
      frozen: params.freeze,
      designPose: params.designPose,
      adaptiveQuality: params.seed === null && !params.designPose,
      frame,
      device,
    });
    fieldRef.current = field;
    field.setObstacles(obstacles());
    field.start();
    if (sceneRef.current === 'about') field.ensureBlur();
    if (params.seed !== null || params.freeze || params.designPose) {
      window.__refectorioFood = {
        snapshot: () => field.snapshot(),
        hitTest: (x, y) => field.hitTest(x, y),
      };
    }

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        field.setObstacles(sceneRef.current === 'hero' ? obstacles() : []);
        field.resize();
      }, RESIZE_DEBOUNCE_MS);
    };
    // Text boxes change once the web font arrives.
    void document.fonts.ready.then(() => {
      field.setObstacles(sceneRef.current === 'hero' ? obstacles() : []);
    });
    const preload = window.setTimeout(() => {
      field.ensureBlur();
    }, BLUR_PRELOAD_MS);

    const onPointerDown = (event: PointerEvent) => {
      if (sceneRef.current !== 'hero' || teamOpenRef.current || event.button !== 0) return;
      if ((event.target as Element | null)?.closest(NOT_FOOD)) return;
      const index = field.hitTest(event.clientX, event.clientY);
      if (index >= 0) field.bounce(index);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', onPointerDown);
      window.clearTimeout(resizeTimer);
      window.clearTimeout(preload);
      field.stop();
      fieldRef.current = null;
      delete window.__refectorioFood;
    };
  }, [calm, params]);

  const food = SCENE.food;
  const ease = EASE_OUT_EXPO;
  const camera = calm ? { duration: 0 } : { duration: food.durationMs / 1000, ease };
  const blurFade = calm
    ? { duration: DURATION.fade }
    : {
        duration: (food.blurCrossfadeEndMs - food.blurCrossfadeStartMs) / 1000,
        delay: food.blurCrossfadeStartMs / 1000,
        ease,
      };

  return (
    <div className="food-layer" aria-hidden>
      <m.div
        className="food-camera"
        initial={false}
        animate={{ transform: `scale(${about ? food.scale : 1})` }}
        transition={camera}
      >
        <m.div
          ref={sharpRef}
          className="food-plane"
          initial={false}
          animate={{ opacity: about ? 0 : 1 }}
          transition={about ? blurFade : { ...blurFade, delay: 0 }}
        />
        <m.div
          ref={blurRef}
          className="food-plane"
          initial={false}
          animate={{ opacity: about ? food.opacity : 0 }}
          transition={about ? blurFade : { ...blurFade, delay: 0 }}
        />
      </m.div>
    </div>
  );
}
