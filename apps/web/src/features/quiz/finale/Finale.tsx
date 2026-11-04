import type { QuizAnswersV1 } from '@refectorio/contracts';
import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { quiz } from '../../../content/quiz.ru';
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
import { captionsFor } from './captionPlan';
import { Handoff, type Box, type Point } from './Handoff';
import { Story } from './Story';
import type { MenuClientError } from '../../menu/engine/client';
import { useMenuGeneration, type MenuGeneration } from '../../menu/engine/useMenuGeneration';

/** `?debug=answers`: the validated JSON of the answers. */
function DebugAnswers({ result }: { readonly result: QuizAnswersV1 | null }) {
  return (
    <details className="quiz-finale-debug" open>
      <summary>{quiz.finale.debugTitle}</summary>
      <pre>{result ? JSON.stringify(result, null, 2) : '—'}</pre>
    </details>
  );
}

/** `?debug=menu`: what the menu engine produced (phase 4 turns it into the menu page). */
function DebugMenu({ generation }: { readonly generation: MenuGeneration }) {
  const summary =
    generation.status === 'ready'
      ? {
          status: generation.status,
          ms: Math.round(generation.ms),
          days: generation.plan.days.length,
          horizonEnd: generation.plan.horizonEnd,
          energyTarget: Math.round(generation.plan.targets.energyKcal),
          firstDay: generation.plan.days[0],
          notes: generation.plan.notes,
        }
      : generation;
  return (
    <details className="quiz-finale-debug" open data-menu-status={generation.status}>
      <summary>{quiz.finale.debugMenuTitle}</summary>
      <pre>{JSON.stringify(summary, null, 2)}</pre>
    </details>
  );
}

/** The story's box (§7.1): min(520 px, 100vw − 32 px, 55svh). */
function coreSize(): number {
  return Math.round(
    Math.min(FINALE.canvasMaxPx, window.innerWidth - 32, window.innerHeight * 0.55),
  );
}

/** The step a failed generation sends back to: the diet, from where allergies and dislikes follow (phase 4 §1). */
const CONFLICT_STEP = 'foodStyle';

/** Our own failures (worker, timeout) — the others come from the answers. */
const ownFailure = (error: MenuClientError) =>
  error.code === 'worker' ||
  error.code === 'timeout' ||
  error.code === 'cancelled' ||
  error.code === 'internal';

/** The menu could not be made: a calm screen in the finale's style (ТЗ фаза 4 §1). */
function GenerationFailed({
  error,
  onRetry,
}: {
  readonly error: MenuClientError;
  readonly onRetry: () => void;
}) {
  const { state, backBy, calm } = useQuiz();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    focusQuietly(titleRef.current);
  }, []);
  const steps = (() => {
    const at = state.history.lastIndexOf(CONFLICT_STEP);
    return at >= 0 ? state.history.length - at : 1;
  })();
  return (
    <m.div
      className="quiz-finale-failed"
      role="alert"
      initial={calm ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: DURATION.fade * 3, ease: EASE_OUT_SOFT },
      }}
    >
      <h2 ref={titleRef} tabIndex={-1} className="quiz-finale-failed-title">
        {quiz.finale.failed.title}
      </h2>
      <p className="quiz-finale-honest">
        {ownFailure(error) ? quiz.finale.failed.broken : quiz.finale.failed.infeasible}
      </p>
      <div className="quiz-refused-actions">
        <PillButton tone="accent" onClick={onRetry}>
          {quiz.finale.failed.retry}
        </PillButton>
        <PillButton
          tone="outline"
          onClick={() => {
            backBy(steps);
          }}
        >
          {quiz.finale.failed.change}
        </PillButton>
      </div>
    </m.div>
  );
}

function RestartButton() {
  const { restart } = useQuiz();
  return (
    <button type="button" className="quiz-finale-again" onClick={restart}>
      {quiz.finale.again}
    </button>
  );
}

/**
 * «Готовим меню» (ТЗ §12, stage 3 §7, stage 4 phase 4 §1): the bar fills to 100 % with a shimmer, detaches, becomes a
 * dot and glides to the centre, where it becomes the pencil's tip of the generation story. The menu is made in the
 * worker meanwhile; once it is stored and the menu's code is here, the story ends at the end of the pot scene in a
 * bright pulse (from the dots loop at once, if it took longer) and the reveal wave uncovers the menu from there.
 */
function Generating({
  result,
  onRetry,
}: {
  readonly result: QuizAnswersV1 | null;
  readonly onRetry: () => void;
}) {
  const { safety, calm, params, announce, detachBar, prepareMenu, revealMenu } = useQuiz();
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
  const [dotPx, setDotPx] = useState(24);
  const generation = useMenuGeneration(result, params.seed);
  const [chunk, setChunk] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    let alive = true;
    prepareMenu().then(
      () => {
        if (alive) setChunk('ready');
      },
      () => {
        if (alive) setChunk('failed');
      },
    );
    return () => {
      alive = false;
    };
  }, [prepareMenu]);
  // `?demo` holds the story (screenshots, videos, the story's own tests).
  const ready = generation.status === 'ready' && chunk === 'ready' && !params.demo;
  const failure: MenuClientError | null =
    generation.status === 'error'
      ? generation.error
      : chunk === 'failed'
        ? { code: 'worker' }
        : null;

  useEffect(() => {
    focusQuietly(titleRef.current);
  }, []);

  const center = useCallback((): Point | null => {
    const box = coreBoxRef.current?.getBoundingClientRect();
    return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  }, []);

  // The bar has filled and shimmered: it detaches here (the header hides its own in the same render). Once: detaching
  // re-renders the quiz, and a second hand-off would send another dot across the story.
  const handedOff = useRef(false);
  useEffect(() => {
    if (calm || handedOff.current) return undefined;
    const timer = window.setTimeout(() => {
      handedOff.current = true;
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

  // Captions follow the story's scenes; screen readers hear the first and the last.
  const onCaption = useCallback(
    (index: number) => {
      setCaptionIndex(index);
      if (index === 0 || index === captions.length - 1) announce(captions[index]?.text ?? '');
    },
    [captions, announce],
  );

  const onPulse = useCallback(() => {
    revealMenu(center() ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  }, [center, revealMenu]);

  const onArrived = useCallback(() => {
    setGrown(true);
    setHandoff(null);
  }, []);

  // `?reveal=demo`: the story starts at the pot, so the reveal comes within seconds.
  const startAt = params.story ?? (params.revealDemo ? 'pot' : null);

  return (
    <div
      className="quiz-finale"
      data-paused={failure ? true : undefined}
      data-menu={generation.status}
      style={{ '--core-size': `${size}px` } as CSSProperties}
    >
      <h2 ref={titleRef} id="quiz-step-title" className="visually-hidden" tabIndex={-1}>
        {quiz.finale.generatingLabel}
      </h2>
      <div ref={coreBoxRef} className="quiz-finale-core" data-shown={grown || undefined}>
        <Story
          started={grown}
          sizePx={size}
          dotPx={dotPx}
          calm={calm}
          paused={failure !== null}
          seed={params.seed ?? 0}
          onCaption={onCaption}
          ready={ready}
          onPulse={onPulse}
          startAt={startAt}
        />
      </div>
      <div className="quiz-finale-captions">
        {captionIndex >= 0 && !failure ? (
          <Captions captions={captions} index={captionIndex} calm={calm} />
        ) : null}
      </div>
      <AnimatePresence>
        {result ? null : (
          <m.div
            className="quiz-finale-after"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: DURATION.fade * 3, ease: EASE_OUT_SOFT },
            }}
          >
            <p className="quiz-finale-honest">{quiz.finale.notSaved}</p>
            <div className="quiz-finale-actions">
              <PrivacyLabel />
              <RestartButton />
            </div>
          </m.div>
        )}
      </AnimatePresence>
      {failure ? <GenerationFailed error={failure} onRetry={onRetry} /> : null}
      {params.debugAnswers ? <DebugAnswers result={result} /> : null}
      {params.debugMenu ? <DebugMenu generation={generation} /> : null}
      {handoff ? <Handoff from={handoff.from} to={handoff.to} onDone={onArrived} /> : null}
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
  // «Попробовать снова» starts the generation afresh (a new instance: its own worker request and story).
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
  return safety.decision.status === 'refused' ? (
    <RefusedScreen result={result} />
  ) : (
    <Generating key={attempt} result={result} onRetry={retry} />
  );
}
