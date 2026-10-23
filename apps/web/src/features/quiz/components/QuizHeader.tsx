import { IconArrowLeft } from '@tabler/icons-react';
import { animate, m, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { useCalmMotion } from '../../../motion/hooks';
import { DURATION, EASE_IN_OUT, EASE_OUT_SOFT, QUIZ } from '../../../motion/tokens';
import { useWave } from '../../../motion/useWave';
import { WaveLayer } from '../../../motion/WaveHover';
import { TOTAL_SLOTS } from '../flow/steps';
import { fill } from '../quizContext';

type Props = {
  /** 0…1 (flow/machine progressOf). */
  readonly progress: number;
  readonly number: number;
  readonly valueText: string;
  readonly canGoBack: boolean;
  readonly onBack: () => void;
  /** The finale: the bar fills to 100 % and a shimmer sweeps over it (ТЗ §12.1)… */
  readonly finale: boolean;
  /** …then the finale draws it itself (detached into the red dot). */
  readonly detached: boolean;
};

/** The track's height over its width: the smallest visible fill is the rounded cap (as in the dish game mockup). */
const CAP_SHARE = 40 / 440;

const headerItem = (calm: boolean, order: number) => ({
  initial: { opacity: 0, transform: 'translateY(-8px) scale(0.96)' },
  animate: {
    opacity: 1,
    transform: 'translateY(0px) scale(1)',
    transition: calm
      ? { duration: DURATION.fade }
      : {
          duration: QUIZ.header.durationMs / 1000,
          ease: EASE_OUT_SOFT,
          delay: (QUIZ.header.delayMs + order * QUIZ.stepIn.staggerMs) / 1000,
        },
  },
  exit: {
    opacity: 0,
    transform: 'translateY(-8px) scale(0.96)',
    transition: calm
      ? { duration: DURATION.fade }
      : { duration: QUIZ.stepOut.durationMs / 1000, ease: EASE_IN_OUT },
  },
});

/**
 * Progress (ТЗ §7.3, stage 3 — 4.14): an outlined track with the fill floating inside it; the fill is a full-width
 * pill moved by translateX (transform only) on a spring with a tiny settle, and never shows less than its rounded cap.
 * When it grows, a light band runs along it once. role="progressbar" with «Вопрос n из 12».
 */
export function ProgressBar({
  value,
  number,
  valueText,
  finale = false,
  detached = false,
}: {
  value: number;
  number: number;
  valueText: string;
  finale?: boolean;
  detached?: boolean;
}) {
  const calm = useCalmMotion();
  const shown = useMotionValue(Math.max(CAP_SHARE, value));
  const transform = useTransform(shown, (v) => `translateX(${((v - 1) * 100).toFixed(3)}%)`);
  const sheenRef = useRef<HTMLSpanElement>(null);
  // The band's and the rail's widths, kept by a ResizeObserver: read after a commit, they forced a layout in every
  // answer of the game (performance audit, F4).
  const sizes = useRef({ band: 0, width: 0 });
  useEffect(() => {
    const sheen = sheenRef.current;
    const fill = sheen?.parentElement;
    if (!sheen || !fill) return undefined;
    const observer = new ResizeObserver(() => {
      sizes.current = { band: sheen.offsetWidth, width: fill.offsetWidth };
    });
    observer.observe(sheen);
    observer.observe(fill);
    return () => {
      observer.disconnect();
    };
  }, []);
  const previous = useRef(value);
  useEffect(() => {
    const target = Math.max(CAP_SHARE, value);
    const grew = value > previous.current;
    previous.current = value;
    const controls = calm
      ? animate(shown, target, { duration: 0 })
      : animate(shown, target, QUIZ.progressSpring);
    const sheen = sheenRef.current;
    let run: Animation | null = null;
    if (grew && !calm && !finale && sheen) {
      // From the rail's start to the fill's new end, in the fill's own coordinates (it is moved left by 1 − value).
      const { band, width } = sizes.current;
      const from = (1 - target) * width - band;
      const to = width;
      run = sheen.animate(
        [
          { transform: `translateX(${from.toFixed(1)}px)`, opacity: 1 },
          { transform: `translateX(${to.toFixed(1)}px)`, opacity: 1 },
        ],
        {
          duration: QUIZ.progressSheen.durationMs,
          delay: QUIZ.progressSheen.delayMs,
          easing: `cubic-bezier(${EASE_IN_OUT.join(', ')})`,
        },
      );
    }
    return () => {
      controls.stop();
      run?.cancel();
    };
  }, [value, calm, shown, finale]);
  return (
    <div
      className="quiz-progress"
      data-finale={finale || undefined}
      data-detached={detached || undefined}
      role="progressbar"
      aria-label={quiz.common.progressLabel}
      aria-valuemin={0}
      aria-valuemax={TOTAL_SLOTS}
      aria-valuenow={number}
      aria-valuetext={
        /^\d+$/.test(valueText)
          ? fill(quiz.common.progressValue, { n: number, total: TOTAL_SLOTS })
          : valueText
      }
    >
      <div className="quiz-progress-rail">
        <m.div className="quiz-progress-fill" style={{ transform }}>
          <span ref={sheenRef} className="quiz-progress-sheen" aria-hidden />
        </m.div>
      </div>
      <span className="quiz-progress-solid" aria-hidden />
      {finale && !calm ? <span className="quiz-progress-shimmer" aria-hidden /> : null}
    </div>
  );
}

/** Logo and «Выйти ×» belong to the landing header; the quiz adds «Вернуться» and the progress bar between them. */
export function QuizHeader({
  progress,
  number,
  valueText,
  canGoBack,
  onBack,
  finale,
  detached,
}: Props) {
  const calm = useCalmMotion();
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  return (
    <div className="quiz-header">
      <m.button
        ref={setHost}
        type="button"
        className="quiz-back wave-host"
        aria-label={quiz.common.back}
        title={quiz.common.back}
        data-hidden={!canGoBack || undefined}
        tabIndex={canGoBack ? 0 : -1}
        aria-hidden={!canGoBack}
        onClick={(event) => {
          act(event, onBack);
        }}
        {...handlers}
        {...headerItem(calm, 0)}
      >
        <span className="wave-content">
          <IconArrowLeft aria-hidden className="quiz-back-icon" stroke={2.25} />
        </span>
        <WaveLayer clipPath={clipPath} className="wave-layer--ink">
          <IconArrowLeft aria-hidden className="quiz-back-icon" stroke={2.25} />
        </WaveLayer>
      </m.button>
      <m.div className="quiz-progress-slot" {...headerItem(calm, 1)}>
        <ProgressBar
          value={progress}
          number={number}
          valueText={valueText}
          finale={finale}
          detached={detached}
        />
      </m.div>
    </div>
  );
}
