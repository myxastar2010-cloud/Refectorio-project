import { m } from 'motion/react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { girlAssets } from '../lib/assets';
import { useCalmMotion } from '../motion/hooks';
import { GIRL } from '../motion/tokens';
import { heroVariants, type Phase } from './choreography';
import {
  fitGirl,
  GIRL_START,
  isFirstFrame,
  nextGirl,
  pixelGrid,
  shouldPlay,
  type GirlEvent,
} from './girlPlayback';

type Props = {
  readonly phase: Phase;
  readonly instant: boolean;
  /** Her place in part 1: an empty box of the scene, which lies above the food (HeroScene). */
  readonly slotRef: RefObject<HTMLElement | null>;
  /** Part 1 itself: it scrolls where it does not fit, and she scrolls with it. */
  readonly scrollerRef: RefObject<HTMLElement | null>;
  /** ?freeze=1: time stops for her too, so a screenshot is always the same picture. */
  readonly frozen: boolean;
};

const FRAME_S = 1 / GIRL.fps;
const FRAME_CALLBACKS =
  typeof HTMLVideoElement !== 'undefined' &&
  'requestVideoFrameCallback' in HTMLVideoElement.prototype;

/** The cascade of part 1: she comes with the lead and the button. */
const CASCADE_INDEX = 2;

/**
 * The animated girl (stage 4, §1.5). Her video is white-backed and gets its white off by multiply, so she needs a backdrop
 * of her own: a box painted in the page colour, below the food (a box above it would cut the food with its edges). She
 * therefore lives under the scenes, and follows the empty slot that part 1 keeps for her.
 *
 * The still is the loop's first frame: it shows at once, and the video takes over in the frame in which its own first
 * frame is presented. Reduced motion or Save-Data: the still, and the video is never requested.
 */
export const HeroGirl = memo(function HeroGirl({
  phase,
  instant,
  slotRef,
  scrollerRef,
  frozen,
}: Props) {
  const calm = useCalmMotion();
  const stillOnly = calm || frozen;
  const placeRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeRef = useRef(phase === 'shown');
  const syncRef = useRef<() => void>(() => undefined);

  // Her box follows the slot: at the start, when the layout changes and while part 1 scrolls.
  useLayoutEffect(() => {
    const place = placeRef.current;
    const slot = slotRef.current;
    const scroller = scrollerRef.current;
    if (!place || !slot || !scroller) return;
    let scrollAtMeasure = 0;
    const measure = () => {
      const box = fitGirl(slot.getBoundingClientRect(), GIRL.width / GIRL.height);
      scrollAtMeasure = scroller.scrollTop;
      // On a grid that is whole in CSS and in device pixels: at a fractional box an image and a video are snapped
      // differently, and the swap would shift her lines by a fraction of a pixel.
      const step = pixelGrid(window.devicePixelRatio);
      const snap = (px: number) => `${String(Math.round(px / step) * step)}px`;
      place.style.left = snap(box.left);
      place.style.top = snap(box.top);
      place.style.width = snap(box.width);
      place.style.height = snap(box.height);
      place.style.transform = '';
    };
    const onScroll = () => {
      place.style.transform = `translate3d(0, ${String(scrollAtMeasure - scroller.scrollTop)}px, 0)`;
    };
    measure();
    // The web font changes the height of the text above her on small screens, and her slot moves without resizing.
    void document.fonts.ready.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    observer.observe(scroller);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [slotRef, scrollerRef]);

  useEffect(() => {
    const video = videoRef.current;
    const art = artRef.current;
    if (!video || !art) return;
    let state = GIRL_START;
    let onScreen = true;
    let frameHandle = 0;
    let stallTimer = 0;

    const send = (event: GirlEvent) => {
      state = nextGirl(state, event);
    };
    const presented = () => {
      window.clearTimeout(stallTimer);
      send('presented');
      // In the frame callback itself: the still leaves in the frame in which the same picture arrives.
      art.dataset.girl = 'video';
    };
    const blocked = () => {
      window.clearTimeout(stallTimer);
      send('blocked');
    };

    const watchFirstFrame = () => {
      if (!FRAME_CALLBACKS) return;
      const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
        if (state.phase === 'playing') return;
        if (isFirstFrame(metadata.mediaTime, FRAME_S)) presented();
        else frameHandle = video.requestVideoFrameCallback(onFrame);
      };
      frameHandle = video.requestVideoFrameCallback(onFrame);
    };
    /** Browsers without frame callbacks: the first time update of the loop's first moments. */
    const onTimeUpdate = () => {
      if (FRAME_CALLBACKS || state.phase === 'playing') return;
      if (video.currentTime > 0 && isFirstFrame(video.currentTime, GIRL.lateFirstFrameS)) {
        presented();
      }
    };

    const play = () => {
      send('start');
      window.clearTimeout(stallTimer);
      if (state.phase === 'starting') {
        stallTimer = window.setTimeout(blocked, GIRL.stallMs);
        watchFirstFrame();
      }
      video.play().catch(blocked);
    };
    const sync = () => {
      const wanted = shouldPlay({
        active: activeRef.current,
        onScreen,
        pageVisible: !document.hidden,
      });
      if (wanted && video.paused) play();
      else if (!wanted && !video.paused) video.pause();
    };
    syncRef.current = sync;

    const onGesture = () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      const before = state.phase;
      send('gesture');
      if (before === 'blocked' && state.phase === 'starting') {
        stallTimer = window.setTimeout(blocked, GIRL.stallMs);
        watchFirstFrame();
        video.play().catch(blocked);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      sync();
    });
    observer.observe(art);
    video.addEventListener('error', blocked);
    video.addEventListener('timeupdate', onTimeUpdate);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    sync();
    return () => {
      syncRef.current = () => undefined;
      observer.disconnect();
      window.clearTimeout(stallTimer);
      if (FRAME_CALLBACKS) video.cancelVideoFrameCallback(frameHandle);
      video.removeEventListener('error', blocked);
      video.removeEventListener('timeupdate', onTimeUpdate);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      video.pause();
    };
  }, [stillOnly]);

  useEffect(() => {
    activeRef.current = phase === 'shown';
    syncRef.current();
  }, [phase]);

  const variants = useMemo(() => heroVariants(CASCADE_INDEX, calm), [calm]);
  const { still, video } = girlAssets;

  return (
    <div ref={placeRef} className="hero-girl" aria-hidden>
      <m.div
        ref={artRef}
        className="hero-girl-art"
        data-girl="still"
        variants={variants}
        animate={phase}
        {...(instant ? { initial: false as const } : {})}
      >
        <picture>
          <source type="image/avif" srcSet={still.avif} media={GIRL.wideMedia} />
          <source type="image/webp" srcSet={still.webp} media={GIRL.wideMedia} />
          <source type="image/avif" srcSet={still.avifSmall} />
          <img
            className="hero-girl-still"
            src={still.webpSmall}
            width={GIRL.width}
            height={GIRL.height}
            alt=""
            fetchPriority="high"
            decoding="sync"
            draggable={false}
          />
        </picture>
        {!stillOnly && (
          <video
            ref={videoRef}
            className="hero-girl-video"
            muted
            playsInline
            loop
            preload="auto"
            disablePictureInPicture
            tabIndex={-1}
          >
            <source src={video.av1} type={GIRL.av1} media={GIRL.wideMedia} />
            <source src={video.av1Small} type={GIRL.av1} />
            <source src={video.h264} type={GIRL.h264} media={GIRL.wideMedia} />
            <source src={video.h264Small} type={GIRL.h264} />
          </video>
        )}
      </m.div>
    </div>
  );
});
