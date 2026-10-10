import {
  IconCalculator,
  IconCalendar,
  IconChefHat,
  IconListSearch,
  IconScale,
  IconShoppingCart,
  IconSparkles,
  IconTable,
  IconToolsKitchen2,
  type Icon,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { AnimatePresence, animate, m, useMotionValue, useTransform } from 'motion/react';
import { useLayoutEffect, useRef } from 'react';
import { DURATION, FINALE } from '../../../motion/tokens';
import type { Caption } from './captionPlan';

const ICONS: Record<string, Icon> = {
  listSearch: IconListSearch,
  calculator: IconCalculator,
  calendar: IconCalendar,
  toolsKitchen: IconToolsKitchen2,
  chefHat: IconChefHat,
  table: IconTable,
  shoppingCart: IconShoppingCart,
  sparkles: IconSparkles,
  scale: IconScale,
};

/** Pill geometry in CSS px (mirrors --quiz-caption-h and --quiz-caption-pad-x in tokens.css). */
const CAP_PX = 24;
const PAD_X = 22;
const MID_PX = 100;

/**
 * The caption pill under the core (ТЗ §12.3, design/reference/caption-animation.md): icon + text change with
 * `AnimatePresence mode="popLayout"` — the text comes in from 14 px lower and 6 px of blur, leaves 14 px up; the icon
 * pops with scale, rotation and blur. The pill's width follows on the same spring, transform only: a 3-slice (two
 * round caps and a middle stretched by scaleX), never a width transition. The last caption stays with a travelling
 * shimmer (a band moved by transform).
 */
export function Captions({
  captions,
  index,
  calm,
}: {
  readonly captions: readonly Caption[];
  readonly index: number;
  readonly calm: boolean;
}) {
  const caption = captions[Math.min(index, captions.length - 1)];
  const final = index >= captions.length - 1;
  const width = useMotionValue(0);
  const itemRef = useRef<HTMLSpanElement | null>(null);
  const capLeft = useTransform(width, (w) => `translateX(${(-w / 2).toFixed(2)}px)`);
  const middle = useTransform(
    width,
    (w) =>
      `translateX(${(-w / 2 + CAP_PX).toFixed(2)}px) scaleX(${(Math.max(0, w - 2 * CAP_PX) / MID_PX).toFixed(4)})`,
  );
  const capRight = useTransform(width, (w) => `translateX(${(w / 2 - CAP_PX).toFixed(2)}px)`);

  useLayoutEffect(() => {
    const item = itemRef.current;
    if (!item) return undefined;
    const target = item.offsetWidth + PAD_X * 2;
    if (width.get() === 0 || calm) {
      width.jump(target);
      return undefined;
    }
    const controls = animate(width, target, FINALE.captionSpring);
    return () => {
      controls.stop();
    };
  }, [index, calm, width]);

  if (!caption) return null;
  const CaptionIcon = ICONS[caption.icon] ?? IconSparkles;
  const spring = calm ? { duration: DURATION.fade } : FINALE.captionSpring;

  return (
    <div className={clsx('quiz-caption', final && 'is-final')}>
      <div className="quiz-caption-pill" aria-hidden>
        <m.span
          className="quiz-caption-cap quiz-caption-cap--left"
          style={{ transform: capLeft }}
        />
        <m.span className="quiz-caption-mid" style={{ transform: middle }} />
        <m.span
          className="quiz-caption-cap quiz-caption-cap--right"
          style={{ transform: capRight }}
        />
      </div>
      <div className="quiz-caption-content" aria-hidden>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={index}
            ref={itemRef}
            className="quiz-caption-item"
            initial={calm ? { opacity: 0 } : { opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{
              opacity: 1,
              y: 0,
              filter: 'blur(0px)',
              transition: spring,
              transitionEnd: { filter: 'none' },
            }}
            exit={
              calm
                ? { opacity: 0, transition: { duration: DURATION.micro } }
                : { opacity: 0, y: -14, filter: 'blur(6px)', transition: spring }
            }
          >
            <m.span
              className="quiz-caption-icon"
              initial={
                calm ? false : { opacity: 0, scale: 0.4, rotate: -25, y: 10, filter: 'blur(4px)' }
              }
              animate={{
                opacity: 1,
                scale: 1,
                rotate: 0,
                y: 0,
                filter: 'blur(0px)',
                transition: spring,
                transitionEnd: { filter: 'none' },
              }}
              exit={
                calm
                  ? { opacity: 0, transition: { duration: DURATION.micro } }
                  : {
                      opacity: 0,
                      scale: 0.4,
                      rotate: 25,
                      y: -10,
                      filter: 'blur(4px)',
                      transition: spring,
                    }
              }
            >
              <CaptionIcon aria-hidden stroke={2} />
            </m.span>
            <span className="quiz-caption-text">
              {caption.text}
              {final && !calm ? (
                <span className="quiz-shimmer" aria-hidden>
                  <span className="quiz-shimmer-band">
                    <span className="quiz-shimmer-text">{caption.text}</span>
                  </span>
                </span>
              ) : null}
            </span>
          </m.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
