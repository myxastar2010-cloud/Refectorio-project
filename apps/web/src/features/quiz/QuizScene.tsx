import './zodConfig';
import '../../styles/quiz.css';

import type { TasteDecision } from '@refectorio/contracts';
import { m } from 'motion/react';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { quiz } from '../../content/quiz.ru';
import type { TestParams } from '../../lib/params';
import { useCalmMotion } from '../../motion/hooks';
import { QuizHeader } from './components/QuizHeader';
import { NoticeLayer } from './components/NoticeLayer';
import { PrivacySheet } from './components/PrivacySheet';
import { ResumeToast } from './components/ResumeToast';
import { StepStage } from './components/StepStage';
import { historyDepth, initialQuizState, progressOf, quizReducer } from './flow/machine';
import { loadDraft, saveDraft } from './flow/persistence';
import { safetyOf } from './flow/safety';
import { firstIncompleteStep, questionNumber, TOTAL_SLOTS } from './flow/steps';
import { testState } from './flow/testStates';
import type { QuizState } from './flow/types';
import { QuizContext, readQuizParams, type QuizApi } from './quizContext';
import { useQuizHistory } from './useQuizHistory';

type Props = {
  readonly instant: boolean;
  readonly onExit: () => void;
  readonly params: TestParams;
};

const quizParams = readQuizParams(window.location.search);

const randomSeed = () => Math.floor(Math.random() * 1e9);

/**
 * A saved draft resumes where it stopped; a finale whose answers became incomplete (an older draft) goes back to the
 * first unanswered step. ?seed always starts a fresh, reproducible game.
 */
function startState(seed: number | null): { state: QuizState; resumed: boolean } {
  if (__TEST_HOOKS__ && quizParams.step) {
    const test = testState(quizParams.step, quizParams.state, seed ?? 1);
    if (test) return { state: test, resumed: false };
  }
  const draft = loadDraft();
  if (draft && seed === null) {
    const incomplete = firstIncompleteStep(draft.answers);
    const state =
      draft.screen === 'finale' && incomplete ? { ...draft, screen: incomplete } : draft;
    return { state, resumed: historyDepth(draft) > 0 || draft.screen !== 'taste' };
  }
  return {
    state: initialQuizState(seed ?? randomSeed(), new Date().toISOString()),
    resumed: false,
  };
}

/**
 * The quiz (stage 2): a lazy chunk on top of the landing. State is a pure reducer (flow/machine), persisted as a
 * guest draft in localStorage after every answer, mirrored in the browser history (one entry per step and per dish
 * answer).
 */
export function QuizScene({ instant, onExit, params }: Props) {
  const calm = useCalmMotion();
  const seed = quizParams.seed ?? params.seed;
  const [initial] = useState(() => startState(seed));
  const [state, dispatch] = useReducer(quizReducer, initial.state);
  const [showResume, setShowResume] = useState(
    initial.resumed && initial.state.screen !== 'finale',
  );
  const [privacyOpener, setPrivacyOpener] = useState<HTMLElement | null | false>(false);
  const [announcement, setAnnouncement] = useState('');
  // The finale's hand-off: from then on the header's bar is drawn by the finale (reset when leaving the finale).
  const [barDetached, setBarDetached] = useState(false);
  if (barDetached && state.screen !== 'finale') setBarDetached(false);

  useEffect(() => {
    saveDraft(state);
  }, [state]);

  const safety = useMemo(() => safetyOf(state.answers), [state.answers]);

  const history = useQuizHistory({
    depth: historyDepth(state),
    onRewind: (steps) => {
      dispatch({ type: 'rewind', steps });
    },
    onLeave: onExit,
  });

  const announce = useCallback((text: string) => {
    // Re-announce the same text: clear first.
    setAnnouncement('');
    window.requestAnimationFrame(() => {
      setAnnouncement(text);
    });
  }, []);

  const restart = useCallback(() => {
    setShowResume(false);
    history.restart(() => {
      dispatch({
        type: 'restart',
        seed: quizParams.seed ?? randomSeed(),
        now: new Date().toISOString(),
      });
    });
  }, [history]);

  const api = useMemo<QuizApi>(
    () => ({
      state,
      safety,
      calm,
      params: quizParams,
      dispatch,
      patch: (patch) => {
        dispatch({ type: 'patch', patch });
      },
      next: () => {
        dispatch({ type: 'next' });
      },
      back: history.back,
      backBy: history.backBy,
      detachBar: () => {
        setBarDetached(true);
      },
      tasteAnswer: (decision: TasteDecision) => {
        dispatch({ type: 'tasteAnswer', decision });
      },
      openPrivacy: (opener) => {
        setPrivacyOpener(opener);
      },
      exit: onExit,
      restart,
      announce,
    }),
    [state, safety, calm, history.back, history.backBy, onExit, restart, announce],
  );

  const screen = state.screen;
  const progress = progressOf(state);
  const number =
    screen === 'finale' || screen === 'adjustments' ? TOTAL_SLOTS : questionNumber(screen);

  return (
    <QuizContext.Provider value={api}>
      {/* No opacity or filter here: the glass of «Вернуться» must see the food behind it (D-030). The pieces animate
          themselves; AnimatePresence in App waits for their exit animations. */}
      <m.section
        className="quiz"
        data-screen={screen}
        data-dialog-open={privacyOpener !== false || undefined}
        aria-labelledby="quiz-step-title"
        exit={{ zIndex: 0 }}
      >
        <QuizHeader
          progress={progress}
          valueText={screen === 'finale' ? quiz.finale.generatingLabel : `${number}`}
          number={number}
          canGoBack={screen !== 'finale'}
          onBack={history.back}
          finale={screen === 'finale'}
          detached={barDetached}
        />
        <StepStage instant={instant} />
        <NoticeLayer />
        <PrivacySheet
          open={privacyOpener !== false}
          returnFocusTo={privacyOpener === false ? null : privacyOpener}
          onClose={() => {
            setPrivacyOpener(false);
          }}
          onDeleted={restart}
        />
        <ResumeToast
          show={showResume}
          number={number}
          onRestart={restart}
          onDone={() => {
            setShowResume(false);
          }}
        />
        <p className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </p>
      </m.section>
    </QuizContext.Provider>
  );
}
