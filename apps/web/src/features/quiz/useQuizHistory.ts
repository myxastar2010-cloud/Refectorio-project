import { useCallback, useEffect, useRef } from 'react';
import { leavingQuiz, QUIZ_HASH, type HistoryState } from '../../app/useScene';
import { QUIZ } from '../../motion/tokens';

type Options = {
  /** Entries the quiz state owns now (machine.historyDepth). */
  readonly depth: number;
  /** Undo this many entries (the browser Back button or «Вернуться»). */
  readonly onRewind: (steps: number) => void;
  /** Back from the very first entry: the landing. */
  readonly onLeave: () => void;
};

const readState = () => window.history.state as HistoryState;
const browserDepthNow = () => {
  const state = readState();
  return state?.scene === 'quiz' ? (state.quiz ?? 0) : 0;
};

/**
 * The quiz in the browser history (ТЗ §7.4): one entry per step and per dish answer, the address stays #quiz.
 * Forward moves push entries (always after a click, a key or a swipe — entries pushed without user activation are
 * skipped by some browsers' Back button). Back — ours or the browser's — goes through history.back(), and the
 * popstate event rewinds the quiz state by as many entries as the browser went back. A resumed draft may own more
 * entries than the browser has (a reload keeps only the entries of this tab): «Вернуться» then rewinds the state
 * directly.
 */
export function useQuizHistory({ depth, onRewind, onLeave }: Options) {
  const depthRef = useRef(depth);
  const browserDepthRef = useRef(0);
  /** The quiz was opened from the landing (the entry before depth 0 is the landing's). */
  const fromLandingRef = useRef(false);
  /** A depth change we caused ourselves (rewind, restart): the effect below must not push entries for it. */
  const quietRef = useRef(false);
  /** We undid a browser Forward ourselves: its popstate is not a step. */
  const undoingForwardRef = useRef(false);
  const onRewindRef = useRef(onRewind);
  const onLeaveRef = useRef(onLeave);
  useEffect(() => {
    onRewindRef.current = onRewind;
    onLeaveRef.current = onLeave;
  }, [onRewind, onLeave]);

  // A direct visit (or a reload): make sure the current entry is a quiz entry.
  useEffect(() => {
    const state = readState();
    if (state?.scene !== 'quiz') {
      window.history.replaceState(
        { scene: 'quiz', quiz: 0, fromLanding: false } satisfies HistoryState,
        '',
        QUIZ_HASH,
      );
    }
    browserDepthRef.current = browserDepthNow();
    fromLandingRef.current = readState()?.fromLanding === true;
  }, []);

  // Forward moves push one entry per new level of depth.
  useEffect(() => {
    const previous = depthRef.current;
    depthRef.current = depth;
    if (quietRef.current) {
      quietRef.current = false;
      return;
    }
    const state = readState();
    if (state?.scene !== 'quiz' || depth <= previous) return;
    const fromLanding = state.fromLanding === true;
    for (let i = 0; i < depth - previous; i += 1) {
      browserDepthRef.current += 1;
      window.history.pushState(
        { scene: 'quiz', quiz: browserDepthRef.current, fromLanding } satisfies HistoryState,
        '',
        QUIZ_HASH,
      );
    }
  }, [depth]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (leavingQuiz()) return;
      if (undoingForwardRef.current) {
        undoingForwardRef.current = false;
        return;
      }
      const state = event.state as HistoryState;
      // The address #quiz opened again from inside the quiz (a link, Enter in the address bar): the browser adds an
      // entry without state. It is this very place of the quiz, not a way out.
      if (state === null && window.location.hash === QUIZ_HASH) {
        window.history.replaceState(
          {
            scene: 'quiz',
            quiz: browserDepthRef.current,
            fromLanding: fromLandingRef.current,
          } satisfies HistoryState,
          '',
          QUIZ_HASH,
        );
        return;
      }
      if (state?.scene !== 'quiz') {
        onLeaveRef.current();
        return;
      }
      const target = state.quiz ?? 0;
      const steps = browserDepthRef.current - target;
      if (steps < 0) {
        // Forward through the browser (after Back): an undone answer cannot be redone, so the browser returns to
        // where the quiz is — otherwise it would stay ahead and the next Back would do nothing.
        undoingForwardRef.current = true;
        window.history.go(steps);
        return;
      }
      browserDepthRef.current = target;
      if (steps === 0 || depthRef.current === 0) return;
      quietRef.current = true;
      onRewindRef.current(Math.min(steps, depthRef.current));
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  /** «Вернуться»: through the browser history while it has our entries, directly otherwise. */
  const back = useCallback(() => {
    if (browserDepthRef.current > 0 && browserDepthNow() > 0) {
      window.history.back();
      return;
    }
    if (depthRef.current > 0) {
      quietRef.current = true;
      onRewindRef.current(1);
      return;
    }
    onLeaveRef.current();
  }, []);

  /** Several entries back at once: through the browser while it has them, directly otherwise. */
  const backBy = useCallback((steps: number) => {
    const count = Math.min(steps, depthRef.current);
    if (count <= 0) return;
    if (browserDepthNow() >= count && browserDepthRef.current >= count) {
      window.history.go(-count);
      return;
    }
    quietRef.current = true;
    onRewindRef.current(count);
  }, []);

  /** «Начать заново»: back to the quiz's first entry, then the fresh state. */
  const restart = useCallback((reset: () => void) => {
    const steps = browserDepthNow();
    // Nothing to rewind and nothing to reset: a quiet flag left behind would swallow the next forward step.
    quietRef.current = depthRef.current > 0;
    if (steps > 0) {
      // The popstate of this jump must not rewind: the state is reset as a whole once we arrive.
      depthRef.current = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('popstate', finish);
        window.clearTimeout(fallback);
        reset();
      };
      window.addEventListener('popstate', finish);
      const fallback = window.setTimeout(finish, QUIZ.historyFallbackMs);
      window.history.go(-steps);
      return;
    }
    reset();
  }, []);

  return { back, backBy, restart };
}
