import type { TasteAnswer } from '@refectorio/contracts';
import type { Dish } from '@refectorio/taste-core';
import { IconToolsKitchen2 } from '@tabler/icons-react';
import clsx from 'clsx';
import {
  animate,
  m,
  useMotionValue,
  useMotionValueEvent,
  usePresence,
  usePresenceData,
  type MotionStyle,
} from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { DURATION, TINDER } from '../../../motion/tokens';
import {
  BLURHASH_SIZE,
  decodeBlurhash,
  hexLuminance,
  photosFor,
  PHOTO_SIZES,
  reportPhoto,
  tintFor,
  type PhotoSource,
} from './photos';
import {
  decideSwipe,
  flightAt,
  flightOf,
  resistUp,
  rotationFor,
  velocityOf,
  type Sample,
} from './swipe';

/** How a card leaves (AnimatePresence custom data). */
export type CardExit =
  | {
      readonly kind: 'answer';
      readonly answer: TasteAnswer;
      readonly vx: number;
      readonly vy: number;
    }
  /** «Вернуться»: the shown card sinks back while the previous one returns. */
  | { readonly kind: 'undo' };

/** How a card arrives: rises from behind, comes back from where it left (undo), or is simply there (first card). */
export type CardEnter = 'rise' | 'still' | { readonly returnFrom: TasteAnswer };

/** The minimum tint under the dish name (CSS token mirror). */
const MIN_SHADE = 0.36;

const offscreen = (answer: TasteAnswer) => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (answer === 'like') return { x: w * 0.75 + 200, y: 0 };
  if (answer === 'dislike') return { x: -(w * 0.75 + 200), y: 0 };
  return { x: 0, y: h * 0.8 + 200 };
};

function BlurCanvas({ hash, className }: { readonly hash: string; readonly className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const image = decodeBlurhash(hash);
    if (canvas && image) canvas.getContext('2d')?.putImageData(image.data, 0, 0);
  }, [hash]);
  return (
    <canvas
      ref={ref}
      className={className}
      width={BLURHASH_SIZE.width}
      height={BLURHASH_SIZE.height}
      aria-hidden
    />
  );
}

type Props = {
  readonly dish: Dish;
  readonly enter: CardEnter;
  /** The top card takes swipes; a leaving one does not. */
  readonly interactive: boolean;
  readonly calm: boolean;
  /** A swipe decided an answer (with the release velocity). */
  /** `false`: the answer was not taken (too soon after the previous one) — the card springs back. */
  readonly onSwipe: (answer: TasteAnswer, velocity: { vx: number; vy: number }) => boolean;
  /** The card moved: shares of the commit distances towards each answer (the buttons swell). */
  readonly onMove: (towards: { like: number; dislike: number; skip: number }) => void;
  /** The photo source shown now (null: the placeholder) — for the credit line of the hotlink mode. */
  readonly onSource?: ((source: PhotoSource | null) => void) | undefined;
};

/**
 * A dish card (ТЗ §9.1): the photo (chain: our own copy → placeholder, ADR 0011), the dish name in white at the
 * top over the photo's own blurred placeholder masked by a gradient plus a tint that keeps the name ≥ 4.5:1 — no live
 * blur. Drag/swipe with pointer events on motion values; leaving and arriving are driven by presence.
 */
export function DishCard({ dish, enter, interactive, calm, onSwipe, onMove, onSource }: Props) {
  const [isPresent, safeToRemove] = usePresence();
  const exit = usePresenceData() as CardExit | undefined;
  const cardRef = useRef<HTMLElement>(null);
  const from = typeof enter === 'object' && !calm ? offscreen(enter.returnFrom) : { x: 0, y: 0 };
  const rising = enter === 'rise' && !calm;
  const x = useMotionValue(from.x);
  const y = useMotionValue(from.y);
  const rotate = useMotionValue(0);
  const scale = useMotionValue(rising ? TINDER.nextFromScale : 1);
  const opacity = useMotionValue(
    rising ? TINDER.nextFromOpacity : calm && enter !== 'still' ? 0 : 1,
  );
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    x0: number;
    y0: number;
    samples: Sample[];
  } | null>(null);

  // Arriving.
  useEffect(() => {
    const controls = [
      animate(x, 0, TINDER.springBack),
      animate(y, 0, TINDER.springBack),
      animate(scale, 1, { ...TINDER.rise }),
      animate(opacity, 1, calm ? { duration: DURATION.fade } : { ...TINDER.rise }),
    ];
    return () => {
      for (const control of controls) control.stop();
    };
  }, [x, y, scale, opacity, calm]);

  // The card's size, kept by a ResizeObserver: read on every move, it forced a layout per frame (audit, F8).
  const size = useRef({ width: 0, height: 0 });
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return undefined;
    const observer = new ResizeObserver(() => {
      size.current = { width: card.offsetWidth, height: card.offsetHeight };
    });
    observer.observe(card);
    return () => {
      observer.disconnect();
    };
  }, []);

  // The buttons swell as the card moves towards them.
  const report = () => {
    if (!isPresent || size.current.width === 0) return;
    const width = size.current.width * TINDER.commitShare;
    const height = size.current.height * TINDER.commitDownShare;
    const dx = x.get();
    const dy = y.get();
    onMove({
      like: Math.max(0, Math.min(1, dx / width)),
      dislike: Math.max(0, Math.min(1, -dx / width)),
      skip: Math.max(0, Math.min(1, dy / height)) * (Math.abs(dx) < Math.abs(dy) ? 1 : 0.3),
    });
  };
  useMotionValueEvent(x, 'change', report);
  useMotionValueEvent(y, 'change', report);

  // How this card leaves is latched when it is removed: a newer answer changes the presence data, not its flight.
  const leaving = useRef<{ exit: CardExit | undefined; remove: () => void } | null>(null);
  useLayoutEffect(() => {
    if (!isPresent && !leaving.current) {
      const removeNow = safeToRemove;
      leaving.current = {
        exit,
        remove: () => {
          removeNow();
        },
      };
    }
  });

  // Leaving.
  useEffect(() => {
    if (isPresent || !leaving.current) return undefined;
    const { exit, remove } = leaving.current;
    const card = cardRef.current;
    let cancelled = false;
    const done = () => {
      if (!cancelled) remove();
    };
    if (calm || !exit || !card) {
      void animate(opacity, 0, { duration: DURATION.micro }).then(done);
      return () => {
        cancelled = true;
      };
    }
    if (exit.kind === 'undo') {
      void Promise.all([
        animate(scale, TINDER.nextFromScale, { duration: DURATION.micro }),
        animate(opacity, 0, { duration: DURATION.micro }),
      ]).then(done);
      return () => {
        cancelled = true;
      };
    }
    const target = offscreen(exit.answer);
    const startX = x.get();
    const startY = y.get();
    const horizontal = exit.answer !== 'skip';
    const distance = horizontal ? Math.abs(target.x - startX) : Math.max(0, target.y - startY);
    const speed = horizontal ? Math.abs(exit.vx) : Math.max(0, exit.vy);
    const flight = flightOf(
      distance,
      Math.max(speed, TINDER.flyMinPxS * 0.4),
      TINDER.flyDurationMs,
    );
    const sign = horizontal ? Math.sign(target.x) : 1;
    // The other axis keeps drifting with its own release speed.
    const drift = horizontal ? exit.vy : exit.vx;
    const width = card.offsetWidth;
    const controls = animate(0, flight.durationS, {
      duration: flight.durationS,
      ease: 'linear',
      onUpdate: (s) => {
        const along = flightAt(flight, s) * sign;
        if (horizontal) {
          x.set(startX + along);
          y.set(startY + drift * s * 0.5);
        } else {
          y.set(startY + along);
          x.set(startX + drift * s * 0.5);
        }
        rotate.set(rotationFor(x.get(), width) * 1.4);
      },
    });
    void controls.then(done);
    return () => {
      cancelled = true;
      controls.stop();
    };
  }, [isPresent, calm, opacity, rotate, scale, x, y]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!interactive || !isPresent || drag.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    x.stop();
    y.stop();
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x0: x.get(),
      y0: y.get(),
      samples: [{ t: event.timeStamp, x: event.clientX, y: event.clientY }],
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const nx = state.x0 + event.clientX - state.startX;
    const ny = state.y0 + resistUp(event.clientY - state.startY);
    x.set(nx);
    y.set(ny);
    rotate.set(rotationFor(nx, event.currentTarget.offsetWidth));
    state.samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
    if (state.samples.length > 12) state.samples.shift();
  };
  const onPointerEnd = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    const velocity = velocityOf(state.samples);
    const card = event.currentTarget;
    const answer =
      event.type === 'pointercancel'
        ? null
        : decideSwipe({ x: x.get(), y: y.get() }, velocity, {
            width: card.offsetWidth,
            height: card.offsetHeight,
          });
    if (answer && onSwipe(answer, velocity)) return;
    void animate(x, 0, { ...TINDER.springBack, velocity: velocity.vx });
    void animate(y, 0, { ...TINDER.springBack, velocity: velocity.vy });
    void animate(rotate, 0, TINDER.springBack);
  };

  // The photo chain.
  const photos = useMemo(() => photosFor(dish.id), [dish.id]);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const source = photos.sources[step] ?? null;
  useEffect(() => {
    onSource?.(loaded ? source : null);
  }, [loaded, source, onSource]);
  useEffect(() => {
    if (!source || loaded) return undefined;
    const timer = window.setTimeout(() => {
      reportPhoto(false);
      setStep((s) => s + 1);
    }, TINDER.photoTimeoutMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [source, loaded]);

  const blur = photos.blurhash ? decodeBlurhash(photos.blurhash) : null;
  const luminance = blur?.topLuminance ?? (photos.avgColor ? hexLuminance(photos.avgColor) : 0);
  // CSS variables for the tint and the colour behind the photo (Motion passes unknown keys through to style).
  const variables = {
    '--card-tint': tintFor(luminance, MIN_SHADE).toFixed(3),
    ...(photos.avgColor ? { '--card-color': photos.avgColor } : {}),
  } as unknown as MotionStyle;
  const style: MotionStyle = {
    x,
    y,
    rotate,
    scale,
    opacity,
    zIndex: isPresent ? 1 : 2,
    ...variables,
  };

  return (
    <m.figure
      ref={cardRef}
      className={clsx('quiz-card', !photos.blurhash && !photos.avgColor && 'is-generated')}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      aria-hidden={!isPresent || undefined}
    >
      {photos.blurhash ? (
        <BlurCanvas hash={photos.blurhash} className="quiz-card-placeholder" />
      ) : null}
      {!photos.blurhash && !photos.avgColor ? (
        <IconToolsKitchen2 aria-hidden className="quiz-card-generated-icon" stroke={1.5} />
      ) : null}
      {source ? (
        <picture key={source.key}>
          {source.avifSrcSet ? (
            <source type="image/avif" srcSet={source.avifSrcSet} sizes={PHOTO_SIZES} />
          ) : null}
          <img
            className={clsx('quiz-card-photo', loaded && 'is-loaded')}
            src={source.src}
            srcSet={source.srcSet}
            sizes={PHOTO_SIZES}
            alt={dish.altRu}
            decoding="async"
            fetchPriority={interactive ? 'high' : 'auto'}
            draggable={false}
            onLoad={() => {
              reportPhoto(true);
              setLoaded(true);
            }}
            onError={() => {
              reportPhoto(false);
              setLoaded(false);
              setStep((s) => s + 1);
            }}
          />
        </picture>
      ) : null}
      <div className="quiz-card-top" aria-hidden>
        {photos.blurhash ? (
          <BlurCanvas hash={photos.blurhash} className="quiz-card-top-blur" />
        ) : null}
      </div>
      <figcaption className="quiz-card-name">{dish.nameRu}</figcaption>
    </m.figure>
  );
}
