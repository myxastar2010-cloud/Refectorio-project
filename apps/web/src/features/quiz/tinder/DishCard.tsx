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
import { whenIdle } from '../../../lib/idle';
import { DURATION, TINDER } from '../../../motion/tokens';
import { DishInfo, InfoChevron } from './DishInfo';
import type { DishTexts } from './dishData';
import {
  BLURHASH_SIZE,
  decodeBlurhash,
  hexLuminance,
  imageInfoLuminance,
  infoLuminance,
  photosFor,
  PHOTO_SIZES,
  reportPhoto,
  tintFor,
  type PhotoSource,
} from './photos';
import {
  decideGesture,
  flightAt,
  flightOf,
  pullFor,
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
/** The minimum darkening over the blurred photo of the open card (CSS token --quiz-info-shade-min). */
const MIN_INFO_SHADE = 0.45;

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
  /** The dish info is shown (§5.1): it opens and closes with a tap, a vertical swipe, the chevron, ↓ and ↑. */
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The descriptions chunk: null while it loads; `failed` hides the chevron. */
  readonly texts: DishTexts | null;
  readonly textsFailed: boolean;
  /** Numbers are left out (the eating-disorder flag is already known). */
  readonly deemphasize: boolean;
  /** The first card: the chevron dips once as a hint. */
  readonly nudge: boolean;
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
 * blur. Drag/swipe with pointer events on motion values; leaving and arriving are driven by presence. Open (§5), the
 * photo cross-fades to its pre-blurred copy under a shade chosen per photo, and the dish info comes in.
 */
export function DishCard({
  dish,
  enter,
  interactive,
  calm,
  open,
  onToggle,
  texts,
  textsFailed,
  deemphasize,
  nudge,
  onSwipe,
  onMove,
  onSource,
}: Props) {
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
    startT: number;
    x0: number;
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
  const [measured, setMeasured] = useState(0);
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return undefined;
    const observer = new ResizeObserver(() => {
      size.current = { width: card.offsetWidth, height: card.offsetHeight };
      setMeasured((n) => n + 1);
    });
    observer.observe(card);
    return () => {
      observer.disconnect();
    };
  }, []);

  // The buttons swell as the card moves towards them (a vertical drag opens the info, not «Пропустить»).
  const report = () => {
    if (!isPresent || size.current.width === 0) return;
    const width = size.current.width * TINDER.commitShare;
    const dx = x.get();
    onMove({
      like: Math.max(0, Math.min(1, dx / width)),
      dislike: Math.max(0, Math.min(1, -dx / width)),
      skip: 0,
    });
  };
  useMotionValueEvent(x, 'change', report);

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

  // The info: numbers (unless left out) and the description; a dish with neither, or a failed chunk, has no chevron.
  const text = texts?.[dish.id] ?? null;
  const hasInfo = !textsFailed && (texts === null || text !== null);
  const infoId = `quiz-card-info-${dish.id}`;

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
      startT: event.timeStamp,
      x0: x.get(),
      samples: [{ t: event.timeStamp, x: event.clientX, y: event.clientY }],
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    // A clearly vertical drag only nudges the card (it toggles the info); a horizontal one carries it.
    const vertical = Math.abs(dy) > Math.abs(dx) / 0.8;
    const nx = state.x0 + (vertical ? dx * TINDER.rubberBand : dx);
    x.set(nx);
    y.set(pullFor(dy, open));
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
    const gesture =
      event.type === 'pointercancel'
        ? null
        : decideGesture(
            {
              dx: event.clientX - state.startX,
              dy: event.clientY - state.startY,
              ms: event.timeStamp - state.startT,
            },
            velocity,
            { width: card.offsetWidth, height: card.offsetHeight },
            open,
          );
    if (gesture?.kind === 'answer' && onSwipe(gesture.answer, velocity)) return;
    if (gesture?.kind === 'toggle' && hasInfo) onToggle();
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
  // The shade of the open card: from the pre-blurred copy once it is decoded, until then from the blurhash.
  const [blurredLuminance, setBlurredLuminance] = useState<number | null>(null);
  const [blurredReady, setBlurredReady] = useState(false);
  // The blurred copy is fetched on idle after the card has arrived (or at once when it is opened), never in its way.
  const [wantBlurred, setWantBlurred] = useState(false);
  useEffect(
    () =>
      whenIdle(() => {
        setWantBlurred(true);
      }, TINDER.lookaheadIdleMs),
    [],
  );
  const underInfo =
    blurredLuminance ??
    (blur
      ? infoLuminance(blur.data.data, BLURHASH_SIZE.width, BLURHASH_SIZE.height)
      : photos.avgColor
        ? hexLuminance(photos.avgColor)
        : 0);
  // CSS variables for the tints and the colour behind the photo (Motion passes unknown keys through to style).
  const variables = {
    '--card-tint': tintFor(luminance, MIN_SHADE).toFixed(3),
    '--info-shade': tintFor(underInfo, MIN_INFO_SHADE).toFixed(3),
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
      className={clsx(
        'quiz-card',
        !photos.blurhash && !photos.avgColor && 'is-generated',
        open && 'is-open',
      )}
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
      {hasInfo ? (
        <m.div
          className="quiz-card-veil"
          aria-hidden
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={{
            duration: calm ? DURATION.fade : open ? TINDER.info.openS : TINDER.info.closeS,
          }}
        >
          {photos.blurred && (wantBlurred || open) ? (
            <img
              className={clsx('quiz-card-blurred', blurredReady && 'is-loaded')}
              src={photos.blurred}
              alt=""
              decoding="async"
              draggable={false}
              onLoad={(event) => {
                setBlurredLuminance(imageInfoLuminance(event.currentTarget));
                setBlurredReady(true);
              }}
            />
          ) : null}
          {!blurredReady && photos.blurhash ? (
            <BlurCanvas hash={photos.blurhash} className="quiz-card-blurred is-loaded" />
          ) : null}
          <div className="quiz-card-shade" />
        </m.div>
      ) : null}
      <figcaption className="quiz-card-name">{dish.nameRu}</figcaption>
      {hasInfo ? (
        <>
          <DishInfo
            id={infoId}
            dish={dish}
            open={open}
            calm={calm}
            text={text}
            deemphasize={deemphasize}
            measured={measured}
          />
          <InfoChevron
            controls={infoId}
            open={open}
            calm={calm}
            nudge={nudge && isPresent}
            enabled={interactive && isPresent}
            cardRef={cardRef}
            measured={measured}
            onToggle={onToggle}
          />
        </>
      ) : null}
    </m.figure>
  );
}
