import { m } from 'motion/react';
import { memo, useEffect, useRef } from 'react';
import type { Scene } from '../../app/useScene';
import { foodSprites } from '../../lib/assets';
import type { TestParams } from '../../lib/params';
import { useCalmMotion } from '../../motion/hooks';
import { EASE_OUT_EXPO, QUIZ, SCENE } from '../../motion/tokens';
import { createFoodField, type Device, type FoodField } from './engine';
import { cameraVisibleArea, type Rect } from './math';
import { whenIdle } from '../../lib/idle';

const RESIZE_DEBOUNCE_MS = 200;
/** The pre-blurred copies are fetched and decoded once the page is idle (at the latest after this). */
const BLUR_PRELOAD_MS = 1500;
/** The field starts with the mockups' nine foods; the six of stage 3 (§8) join once the page has settled. */
const FIRST_FOODS = 9;
const LATE_FOODS_AFTER_MS = 4000;
/** After the cross-fade between the sharp and the blurred food only one plane is moved. */
const PLANE_SETTLE_MS = SCENE.food.blurCrossfadeEndMs + 150;
const NOT_FOOD = '[data-opaque], button, a, input, textarea, select, [role="dialog"]';

type Props = {
  readonly scene: Scene;
  readonly params: TestParams;
  /** An expanded card of part 2 is open (the team's or the project's). */
  readonly cardOpen: boolean;
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

/**
 * The plane area that is on screen in part 2. It shrinks the plane towards a point below the frame, so there the
 * plane's own edges come into view (most of all the top one): the food must wrap around beyond them (setWideWrap).
 */
const visibleArea = (width: number, height: number): Rect =>
  cameraVisibleArea(width, height, SCENE.food);

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

/** The quiz's central column: the food drifts around it softly (ТЗ §7.9). */
function quizColumn(): Rect {
  const width = window.innerWidth;
  const half = (width * QUIZ.foodColumn) / 2;
  return { left: width / 2 - half, top: 0, right: width / 2 + half, bottom: window.innerHeight };
}

const speedOf = (scene: Scene) =>
  scene === 'about' || scene === 'pricing'
    ? SCENE.food.speedFactor
    : scene === 'quiz'
      ? QUIZ.foodSpeed
      : 1;

/**
 * React wrapper of the food engine (ТЗ 6.7). The camera layer recedes in part 2 and «Цены» exactly as in Figma
 * (scale 0.8874 about a point below the frame), the sharp sprites cross-fade into pre-blurred ones.
 */
/* memo: a scene change re-rendered every scene, the hidden ones too (stage-3 performance audit, F3). */
export const FoodFieldLayer = memo(function FoodFieldLayer({ scene, params, cardOpen }: Props) {
  const sharpRef = useRef<HTMLDivElement>(null);
  const blurRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<FoodField | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef(scene);
  const cardOpenRef = useRef(cardOpen);
  /**
   * Part 1's text boxes, measured at rest (load, fonts, resize): coming back to part 1 its titles are still moving in,
   * and measuring them then cost a forced layout in the click (performance audit, F3) and gave shifted boxes.
   */
  const heroRectsRef = useRef<Rect[] | null>(null);
  const calm = useCalmMotion();
  // Part 2, «Цены» and the quiz look at the food from the same pulled-back camera, blurred (ТЗ §7.9).
  const about = scene !== 'hero';

  useEffect(() => {
    sceneRef.current = scene;
    cardOpenRef.current = cardOpen;
    const field = fieldRef.current;
    if (!field) return;
    field.pauseProbe();
    field.setSpeedFactor(speedOf(scene));
    field.setAvoidStrength(scene === 'quiz' ? QUIZ.foodAvoidStrength : 1);
    field.setObstacles(
      scene === 'quiz' ? [quizColumn()] : about ? [] : (heroRectsRef.current ?? obstacles()),
    );
    if (about) field.ensureBlur();
  }, [scene, cardOpen, about]);

  // Both planes move during the cross-fade, then only the one that is seen. The wider wrap of part 2 starts at once
  // and ends only when the camera is back (then the margins are off screen again).
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.setVisiblePlanes(true, about);
    if (about) field.setWideWrap(true);
    const settle = window.setTimeout(() => {
      field.setVisiblePlanes(!about, about);
    }, PLANE_SETTLE_MS);
    const narrow = about
      ? 0
      : window.setTimeout(() => {
          field.setWideWrap(false);
        }, SCENE.food.durationMs);
    return () => {
      window.clearTimeout(settle);
      window.clearTimeout(narrow);
    };
  }, [about]);

  useEffect(() => {
    const sharpPlane = sharpRef.current;
    const blurPlane = blurRef.current;
    if (!sharpPlane || !blurPlane) return;
    const field = createFoodField({
      sprites: foodSprites,
      initialSprites: FIRST_FOODS,
      sharpPlane,
      blurPlane,
      seed: params.seed ?? Math.floor(Math.random() * 1e9),
      reduced: calm,
      frozen: params.freeze,
      designPose: params.designPose,
      adaptiveQuality: params.seed === null && !params.designPose,
      frame,
      visibleArea,
      device,
    });
    fieldRef.current = field;
    const startScene = sceneRef.current;
    const receded = startScene !== 'hero';
    /** The obstacles of a scene; part 1's are measured now and kept, a window changed elsewhere forgets them. */
    const obstaclesOf = (current: Scene): Rect[] => {
      if (current === 'hero') {
        heroRectsRef.current = obstacles();
        return heroRectsRef.current;
      }
      heroRectsRef.current = null;
      return current === 'quiz' ? [quizColumn()] : [];
    };
    field.setObstacles(obstaclesOf(startScene));
    field.setSpeedFactor(speedOf(startScene));
    field.setAvoidStrength(startScene === 'quiz' ? QUIZ.foodAvoidStrength : 1);
    field.start();
    if (receded) field.ensureBlur();
    field.setVisiblePlanes(!receded, receded);
    field.setWideWrap(receded);
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
        field.setObstacles(obstaclesOf(sceneRef.current));
        field.resize();
      }, RESIZE_DEBOUNCE_MS);
    };
    // Text boxes change once the web font arrives.
    void document.fonts.ready.then(() => {
      field.setObstacles(obstaclesOf(sceneRef.current));
    });
    const cancelPreload = whenIdle(() => {
      field.ensureBlur();
    }, BLUR_PRELOAD_MS);
    // Test modes keep the first nine: their layouts and snapshots are fixed.
    const fixedLayout = params.seed !== null || params.freeze || params.designPose;
    let cancelLate = (): void => undefined;
    const lateTimer = fixedLayout
      ? 0
      : window.setTimeout(() => {
          cancelLate = whenIdle(() => {
            void field.addSprites();
          }, LATE_FOODS_AFTER_MS);
        }, LATE_FOODS_AFTER_MS);

    const onPointerDown = (event: PointerEvent) => {
      if (sceneRef.current !== 'hero' || cardOpenRef.current || event.button !== 0) return;
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
      window.clearTimeout(lateTimer);
      cancelLate();
      cancelPreload();
      field.stop();
      fieldRef.current = null;
      delete window.__refectorioFood;
    };
  }, [calm, params]);

  const food = SCENE.food;
  const camera = calm ? { duration: 0 } : { duration: food.durationMs / 1000, ease: EASE_OUT_EXPO };

  // The sharp and the pre-blurred food cross-fade item by item (CSS transitions in components.css): a whole plane
  // fading would make the GPU draw two full-screen layers on every frame of the scene change.
  return (
    <div ref={layerRef} className="food-layer" aria-hidden data-scene={scene}>
      <m.div
        className="food-camera"
        initial={false}
        animate={{ transform: `scale(${about ? food.scale : 1})` }}
        transition={camera}
      >
        <div ref={sharpRef} className="food-plane" />
        <div ref={blurRef} className="food-plane" />
      </m.div>
    </div>
  );
});
