import type { QuizAnswersV1 } from '@refectorio/contracts';
import { AnimatePresence, m } from 'motion/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { quiz } from '../../../content/quiz.ru';
import { setFoodAttractor } from '../../../engine/food-field/attractorChannel';
import { focusQuietly } from '../../../lib/quietFocus';
import { DURATION, EASE_OUT_SOFT, FINALE } from '../../../motion/tokens';
import { PillButton } from '../components/PillButton';
import { PrivacyLabel } from '../components/PrivacyLabel';
import { StepFrame } from '../components/StepFrame';
import { saveResult } from '../flow/persistence';
import { buildResult } from '../flow/result';
import { useQuiz } from '../quizContext';
import { tasteProfileOf } from '../tinder/tasteSession';
import { Captions } from './Captions';
import { captionDurationMs, captionsFor } from './captionPlan';
import { Core } from './Core';
import { Handoff, type Box, type Point } from './Handoff';
import { RevealWave } from './RevealWave';

/** The core's body radius as a share of the canvas half-size (the food dissolves around it). */
const CORE_BODY_SHARE = 0.3;

/** `?debug=answers`: the validated JSON of the answers. */
function DebugAnswers({ result }: { readonly result: QuizAnswersV1 | null }) {
  return (
    <details className="quiz-finale-debug" open>
      <summary>{quiz.finale.debugTitle}</summary>
      <pre>{result ? JSON.stringify(result, null, 2) : '—'}</pre>
    </details>
  );
}

/** The core's box: up to 520 CSS px, smaller on short or narrow screens. */
function coreSize(): number {
  return Math.round(
    Math.min(FINALE.canvasMaxPx, window.innerWidth * 0.86, window.innerHeight * 0.52),
  );
}

/**
 * «Готовим меню» (ТЗ §12): the bar fills to 100 % with a shimmer, detaches, becomes a red dot, glides to the centre and
 * grows into the core; captions change under it; the food spirals into it. Generation never ends in stage 2 — after
 * ≈ 40 s an honest line says so (hidden by `?demo`).
 */
function Generating({ result }: { readonly result: QuizAnswersV1 | null }) {
  const { safety, calm, params, announce, detachBar, restart } = useQuiz();
  const captions = useMemo(
    () => captionsFor(safety.decision.deemphasizeNumbers),
    [safety.decision.deemphasizeNumbers],
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const coreBoxRef = useRef<HTMLDivElement>(null);
  const [size] = useState(coreSize);
  const [handoff, setHandoff] = useState<{ from: Box; to: Point } | null>(null);
  const [grown, setGrown] = useState(calm);
  const [captionIndex, setCaptionIndex] = useState(-1);
  const [honest, setHonest] = useState(false);
  const [revealAt, setRevealAt] = useState<Point | null>(null);
  const [dotPx, setDotPx] = useState(24);
  // A health text the menu cannot follow: the honest line says so too (review-health-synonyms.md B.4, 3).
  const unmatchedHealth = safety.decision.reasons.includes('OTHER_CHRONIC');

  useEffect(() => {
    focusQuietly(titleRef.current);
  }, []);

  const center = useCallback((): Point | null => {
    const box = coreBoxRef.current?.getBoundingClientRect();
    return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  }, []);

  // The bar has filled and shimmered: it detaches here (the header hides its own in the same render).
  useEffect(() => {
    if (calm) return undefined;
    const timer = window.setTimeout(() => {
      const bar = document.querySelector('.quiz-progress')?.getBoundingClientRect();
      const to = center();
      if (!bar || !to || bar.width === 0) {
        setGrown(true);
        return;
      }
      setDotPx(bar.height);
      setHandoff({
        from: { left: bar.left, top: bar.top, width: bar.width, height: bar.height },
        to,
      });
      detachBar();
    }, FINALE.fillMs + FINALE.shimmerMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [calm, center, detachBar]);

  // Captions: the first once the core grows, then one after another; the last one stays.
  useEffect(() => {
    if (!grown) return undefined;
    let index = 0;
    let timer = window.setTimeout(function show() {
      setCaptionIndex(index);
      if (index === 0) announce(captions[0]?.text ?? '');
      if (index === captions.length - 1) {
        announce(captions[index]?.text ?? '');
        return;
      }
      const wait = captionDurationMs(index);
      index += 1;
      timer = window.setTimeout(show, wait);
    }, FINALE.firstCaptionMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [grown, captions, announce]);

  // The honest line and the reveal demo.
  useEffect(() => {
    const timers = [
      params.demo
        ? 0
        : window.setTimeout(() => {
            setHonest(true);
            // The line and its two buttons appear: screen readers hear the line too (WCAG 4.1.3).
            announce(
              unmatchedHealth
                ? `${quiz.finale.honest} ${quiz.finale.unmatchedHealth}`
                : quiz.finale.honest,
            );
          }, FINALE.honestAfterMs),
    ];
    if (params.revealDemo) {
      timers.push(
        window.setTimeout(() => {
          setRevealAt(center());
        }, FINALE.revealDemoAfterMs),
      );
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [params.demo, params.revealDemo, center, announce, unmatchedHealth]);

  // The food spirals into the core while it is shown (ТЗ §12.2).
  useLayoutEffect(() => {
    if (!grown || calm) return undefined;
    const publish = () => {
      const point = center();
      if (point) setFoodAttractor({ ...point, radiusPx: (size / 2) * CORE_BODY_SHARE });
    };
    publish();
    window.addEventListener('resize', publish);
    return () => {
      window.removeEventListener('resize', publish);
      setFoodAttractor(null);
    };
  }, [grown, calm, center, size]);

  const onArrived = useCallback(() => {
    setGrown(true);
    setHandoff(null);
  }, []);

  return (
    <div
      className="quiz-finale"
      data-paused={honest || undefined}
      style={{ '--core-size': `${size}px` } as CSSProperties}
    >
      <h2 ref={titleRef} id="quiz-step-title" className="visually-hidden" tabIndex={-1}>
        {quiz.finale.generatingLabel}
      </h2>
      <div ref={coreBoxRef} className="quiz-finale-core" data-shown={grown || undefined}>
        <Core
          grown={grown}
          pulse={captionIndex + 1}
          dotPx={dotPx}
          sizePx={size}
          calm={calm}
          paused={honest}
        />
      </div>
      <div className="quiz-finale-captions">
        {captionIndex >= 0 ? (
          <Captions captions={captions} index={captionIndex} calm={calm} />
        ) : null}
      </div>
      <AnimatePresence>
        {honest || !result ? (
          <m.div
            className="quiz-finale-after"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: DURATION.fade * 3, ease: EASE_OUT_SOFT },
            }}
          >
            <p className="quiz-finale-honest">
              {result ? quiz.finale.honest : quiz.finale.notSaved}
            </p>
            {result && unmatchedHealth ? (
              <p className="quiz-finale-honest">{quiz.finale.unmatchedHealth}</p>
            ) : null}
            {/* The generation never ends in stage 2: a way to start over and to the privacy sheet (delete answers). */}
            <div className="quiz-finale-actions">
              <PrivacyLabel />
              <button type="button" className="quiz-finale-again" onClick={restart}>
                {quiz.finale.again}
              </button>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
      {params.debugAnswers ? <DebugAnswers result={result} /> : null}
      {handoff ? <Handoff from={handoff.from} to={handoff.to} onDone={onArrived} /> : null}
      {revealAt ? <RevealWave origin={revealAt} calm={calm} /> : null}
    </div>
  );
}

/**
 * `refused` (ТЗ §12.4, §8.7): a calm end screen instead of the generation — what we can't do and why, the doctor, and
 * the two ways on.
 */
function RefusedScreen({ result }: { readonly result: QuizAnswersV1 | null }) {
  const { state, exit, backBy, params } = useQuiz();
  // «Изменить ответы» goes back to the health question (the browser history walks there step by step).
  const steps = (() => {
    const at = state.history.lastIndexOf('healthConditions');
    const from = at >= 0 ? at : state.history.lastIndexOf('health');
    return from >= 0 ? state.history.length - from : 1;
  })();
  return (
    <StepFrame
      icon={null}
      title={quiz.finale.refused.title}
      privacy
      className="quiz-frame--refused"
      footer={
        <div className="quiz-refused-actions">
          <PillButton
            tone="accent"
            onClick={() => {
              backBy(steps);
            }}
          >
            {quiz.finale.refused.change}
          </PillButton>
          <PillButton tone="outline" onClick={exit}>
            {quiz.finale.refused.home}
          </PillButton>
        </div>
      }
    >
      <div className="quiz-refused">
        <p>{quiz.finale.refused.text}</p>
        <p>{quiz.finale.refused.doctor}</p>
      </div>
      {params.debugAnswers ? <DebugAnswers result={result} /> : null}
    </StepFrame>
  );
}

/** The final screen: the answers are saved (QuizAnswersV1) and the generation — or the calm end screen — starts. */
export function Finale() {
  const { state, safety } = useQuiz();
  const [result] = useState(() =>
    buildResult(
      state,
      tasteProfileOf(state.answers.tasteSeed, state.answers.tasteDecisions),
      new Date().toISOString(),
    ),
  );
  useEffect(() => {
    if (result) saveResult(result);
  }, [result]);
  return safety.decision.status === 'refused' ? (
    <RefusedScreen result={result} />
  ) : (
    <Generating result={result} />
  );
}
