import type { FoodSprite } from '../../lib/assets';
import { DESIGN_POSE } from './designPose';
import {
  assignSprites,
  createRandom,
  maskHit,
  repulsion,
  scatter,
  stepSpring,
  toLocal,
  wrap,
  type Random,
  type Rect,
  type Spring,
} from './math';

/** Tunables of the field (ТЗ 6.7). Pixel values are CSS px of the viewport. */
export const FIELD = {
  /** A little more than on screen at a time: items also drift through the margins beyond the edges. */
  count: { desktop: 14, tablet: 10, phone: 8 },
  /** Sprite edge: desktop scales with the frame (mockup ≈ 185 px at 1920), tablet/phone are fixed. */
  sizeDesktopFrame: 185,
  sizeTablet: 130,
  sizePhone: 95,
  sizeJitter: 0.1,
  speedPxS: [10, 60] as const,
  spinDegS: [3, 15] as const,
  wanderRad: 0.6,
  wanderRadS: [0.08, 0.25] as const,
  /** Text repulsion: reach beyond the item radius and acceleration. Strong enough to deflect most passes. */
  avoidReachPx: 70,
  avoidAccelPxS2: 260,
  avoidDragS: 0.9,
  bounce: { stiffness: 180, damping: 12, kick: 3.2 },
  impulsePxS: [120, 180] as const,
  impulseDecayS: 0.5,
  spinKickDegS: 40,
  maxStepS: 0.05,
  fpsProbeMs: 2000,
  minFps: 50,
} as const;

export type Device = 'desktop' | 'tablet' | 'phone';

export type FieldOptions = {
  readonly sprites: readonly FoodSprite[];
  readonly sharpPlane: HTMLElement;
  readonly blurPlane: HTMLElement;
  readonly seed: number;
  readonly reduced: boolean;
  readonly frozen: boolean;
  readonly designPose: boolean;
  /**
   * Lower the quality on a slow device (FPS probe). Off in the test modes (?seed, ?pose): the same field must not
   * depend on how busy the machine running the tests is.
   */
  readonly adaptiveQuality: boolean;
  /** Mockup frame → viewport: px per frame px and frame origin in the viewport. */
  readonly frame: () => { scale: number; left: number; top: number };
  /**
   * The part of the plane that can be on screen (in any scene) for a viewport of this size; items wrap around only
   * once they have left all of it.
   */
  readonly visibleArea: (width: number, height: number) => Rect;
  readonly device: () => Device;
};

type Item = {
  sprite: FoodSprite;
  x: number;
  y: number;
  size: number;
  baseHeading: number;
  speed: number;
  wanderPhase: [number, number];
  wanderRate: [number, number];
  angle: number;
  spin: number;
  pushX: number;
  pushY: number;
  impulseY: number;
  spinKick: number;
  bounce: Spring;
  sharp: HTMLElement;
  blur: HTMLElement | null;
  hidden: boolean;
};

const sizesAttr = (px: number) => `${Math.round(px)}px`;

function makeImage(src: FoodSprite['sharp'], sizePx: number, className: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = className;
  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.type = 'image/avif';
  source.srcset = src.avifSrcSet;
  source.sizes = sizesAttr(sizePx);
  const img = document.createElement('img');
  img.src = src.fallback;
  img.srcset = src.webpSrcSet;
  img.sizes = sizesAttr(sizePx);
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  picture.append(source, img);
  wrapper.append(picture);
  return wrapper;
}

/**
 * The flying food: one requestAnimationFrame loop, state in plain objects, transforms written straight to
 * `style.transform` (no React re-renders). Items drift with smooth wandering, softly avoid open text, wrap around
 * only when fully hidden and bounce when clicked.
 */
export function createFoodField(options: FieldOptions) {
  const { sprites, sharpPlane, blurPlane } = options;
  let random: Random = createRandom(options.seed);
  let items: Item[] = [];
  let obstacles: Rect[] = [];
  let width = window.innerWidth;
  let height = window.innerHeight;
  let area = options.visibleArea(width, height);
  let speedFactor = 1;
  let raf = 0;
  let last = 0;
  let time = 0;
  let quality = 0;
  let probe = { start: -1, frames: 0 };
  let blurMounted = false;

  const motionless = options.reduced || options.frozen;

  function sizeFor(device: Device): number {
    if (device === 'phone') return FIELD.sizePhone;
    if (device === 'tablet') return FIELD.sizeTablet;
    return FIELD.sizeDesktopFrame * options.frame().scale;
  }

  function mountItem(item: Item) {
    sharpPlane.append(item.sharp);
    if (blurMounted) mountBlur(item);
  }

  function mountBlur(item: Item) {
    if (item.blur) return;
    const outer = item.size * (1 + 2 * item.sprite.blurPadRatio);
    item.blur = makeImage(item.sprite.blurred, outer, 'food-item food-item--blur');
    item.blur.style.width = `${outer}px`;
    item.blur.style.height = `${outer}px`;
    blurPlane.append(item.blur);
    render(item);
  }

  function build() {
    sharpPlane.replaceChildren();
    blurPlane.replaceChildren();
    random = createRandom(options.seed);
    width = window.innerWidth;
    height = window.innerHeight;
    area = options.visibleArea(width, height);
    const device = options.device();
    const base = sizeFor(device);

    if (options.designPose) {
      const frame = options.frame();
      items = DESIGN_POSE.flatMap((pose) => {
        const sprite = sprites.find((s) => s.slug === pose.slug);
        if (!sprite) return [];
        return [
          createItem(
            sprite,
            frame.left + pose.centerX * frame.scale,
            frame.top + pose.centerY * frame.scale,
            pose.sizePx * frame.scale,
            pose.rotateDeg,
          ),
        ];
      });
    } else {
      const count = FIELD.count[device];
      const minDistance = Math.sqrt((width * height) / count) * 0.75;
      const avoid = obstacles.map((r) => ({
        left: r.left - base / 2,
        top: r.top - base / 2,
        right: r.right + base / 2,
        bottom: r.bottom + base / 2,
      }));
      const points = scatter(random, count, width, height, minDistance, avoid);
      const assigned = assignSprites(random, points, sprites.length, minDistance * 1.6);
      items = points.flatMap((point, index) => {
        const sprite = sprites[assigned[index] ?? 0];
        if (!sprite) return [];
        const size = base * (1 + random.range(-FIELD.sizeJitter, FIELD.sizeJitter));
        return [createItem(sprite, point.x, point.y, size, random.range(-25, 25))];
      });
    }
    items.forEach(mountItem);
    applyQuality();
    items.forEach(render);
  }

  function createItem(sprite: FoodSprite, x: number, y: number, size: number, angle: number): Item {
    const sharp = makeImage(sprite.sharp, size, 'food-item');
    sharp.style.width = `${size}px`;
    sharp.style.height = `${size}px`;
    return {
      sprite,
      x,
      y,
      size,
      baseHeading: random.range(0, Math.PI * 2),
      speed: random.range(FIELD.speedPxS[0], FIELD.speedPxS[1]),
      wanderPhase: [random.range(0, Math.PI * 2), random.range(0, Math.PI * 2)],
      wanderRate: [
        random.range(FIELD.wanderRadS[0], FIELD.wanderRadS[1]),
        random.range(FIELD.wanderRadS[0], FIELD.wanderRadS[1]),
      ],
      angle,
      spin: random.sign() * random.range(FIELD.spinDegS[0], FIELD.spinDegS[1]),
      pushX: 0,
      pushY: 0,
      impulseY: 0,
      spinKick: 0,
      bounce: { value: 1, velocity: 0 },
      sharp,
      blur: null,
      hidden: false,
    };
  }

  function render(item: Item) {
    const { x, y } = item;
    const transform = `translate3d(${(x - item.size / 2).toFixed(2)}px, ${(y - item.size / 2).toFixed(2)}px, 0) rotate(${item.angle.toFixed(2)}deg) scale(${item.bounce.value.toFixed(4)})`;
    item.sharp.style.transform = transform;
    if (item.blur) {
      const pad = item.size * item.sprite.blurPadRatio;
      item.blur.style.transform = `translate3d(${(x - item.size / 2 - pad).toFixed(2)}px, ${(y - item.size / 2 - pad).toFixed(2)}px, 0) rotate(${item.angle.toFixed(2)}deg) scale(${item.bounce.value.toFixed(4)})`;
    }
  }

  function step(dt: number) {
    time += dt;
    const decayPush = Math.exp(-dt / FIELD.avoidDragS);
    const decayImpulse = Math.exp(-dt / FIELD.impulseDecayS);
    for (const item of items) {
      if (item.hidden) continue;
      const heading =
        item.baseHeading +
        FIELD.wanderRad * Math.sin(item.wanderRate[0] * time + item.wanderPhase[0]) +
        FIELD.wanderRad * 0.5 * Math.sin(item.wanderRate[1] * time + item.wanderPhase[1]);
      const speed = item.speed * speedFactor;
      for (const rect of obstacles) {
        const push = repulsion(
          item,
          rect,
          item.size / 2 + FIELD.avoidReachPx,
          FIELD.avoidAccelPxS2,
        );
        item.pushX += push.x * dt;
        item.pushY += push.y * dt;
      }
      item.pushX *= decayPush;
      item.pushY *= decayPush;
      item.impulseY *= decayImpulse;
      item.spinKick *= decayImpulse;
      item.x += (Math.cos(heading) * speed + item.pushX) * dt;
      item.y += (Math.sin(heading) * speed + item.pushY + item.impulseY) * dt;
      if (quality < 1) item.angle += (item.spin * speedFactor + item.spinKick) * dt;
      // The pre-blurred copy is larger than the sprite (transparent padding for the blur).
      const radius =
        (item.size / 2) *
        (1 + 2 * item.sprite.blurPadRatio) *
        Math.SQRT2 *
        Math.max(1, item.bounce.value);
      const wrapped = wrap(item, radius, area);
      item.x = wrapped.x;
      item.y = wrapped.y;
      item.bounce = stepSpring(item.bounce, dt, FIELD.bounce.stiffness, FIELD.bounce.damping);
      render(item);
    }
  }

  function measureFps(now: number) {
    if (quality >= 2 || motionless || !options.adaptiveQuality) return;
    if (probe.start < 0) {
      probe = { start: now, frames: 0 };
      return;
    }
    probe.frames += 1;
    const elapsed = now - probe.start;
    if (elapsed < FIELD.fpsProbeMs) return;
    const fps = (probe.frames * 1000) / elapsed;
    probe = { start: now, frames: 0 };
    if (fps < FIELD.minFps) {
      quality += 1;
      applyQuality();
    }
  }

  /** Quality levels: 0 full; 1 fewer items (−30 %), no rotation; 2 half of the items. */
  function applyQuality() {
    const keep =
      quality === 0 ? items.length : Math.ceil(items.length * (quality === 1 ? 0.7 : 0.5));
    items.forEach((item, index) => {
      item.hidden = index >= keep;
      item.sharp.style.display = item.hidden ? 'none' : '';
      if (item.blur) item.blur.style.display = item.hidden ? 'none' : '';
    });
  }

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, FIELD.maxStepS);
    last = now;
    measureFps(now);
    step(motionless ? 0 : dt);
  };

  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      last = performance.now();
      probe = { start: -1, frames: 0 };
      raf = requestAnimationFrame(frame);
    }
  };

  return {
    start() {
      build();
      if (motionless) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
      document.addEventListener('visibilitychange', onVisibility);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener('visibilitychange', onVisibility);
      sharpPlane.replaceChildren();
      blurPlane.replaceChildren();
    },
    /** Viewport changed: rebuild the layout (positions are viewport-relative). */
    resize() {
      build();
    },
    setObstacles(rects: readonly Rect[]) {
      obstacles = [...rects];
    },
    setSpeedFactor(factor: number) {
      speedFactor = factor;
    },
    /** Pre-blurred copies are created lazily — only before the first visit to part 2. */
    ensureBlur() {
      if (blurMounted) return;
      blurMounted = true;
      items.forEach(mountBlur);
    },
    /** Top-most item under the point, by its alpha mask (not the bounding box). */
    hitTest(x: number, y: number): number {
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];
        if (!item || item.hidden) continue;
        const local = toLocal({ x, y }, item, item.size * item.bounce.value, item.angle);
        if (local && maskHit(item.sprite.mask, item.sprite.mask.length, local)) return index;
      }
      return -1;
    },
    /** Click bounce: scale 1 → 1.18 → 0.95 → 1, a push upwards and a little spin; drifting continues. */
    bounce(index: number) {
      const item = items[index];
      if (!item || options.reduced) return;
      item.bounce = { value: item.bounce.value, velocity: FIELD.bounce.kick };
      item.impulseY = -random.range(FIELD.impulsePxS[0], FIELD.impulsePxS[1]);
      item.spinKick = random.sign() * FIELD.spinKickDegS;
      if (options.frozen) render(item);
    },
    /** Test hook: positions of the items (e2e tests use it through window.__food). */
    snapshot() {
      return items.map((item) => ({
        slug: item.sprite.slug,
        x: item.x,
        y: item.y,
        size: item.size,
        scale: item.bounce.value,
        hidden: item.hidden,
      }));
    },
  };
}

export type FoodField = ReturnType<typeof createFoodField>;
