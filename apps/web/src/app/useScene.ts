import { useCallback, useEffect, useRef, useState } from 'react';

export type Scene = 'hero' | 'about' | 'quiz';

export const ABOUT_HASH = '#about';
export const QUIZ_HASH = '#quiz';

const sceneFromHash = (hash: string): Scene =>
  hash === ABOUT_HASH ? 'about' : hash === QUIZ_HASH ? 'quiz' : 'hero';

/**
 * History entries the site writes. Inside the quiz every step and every dish answer is an entry of its own (`quiz` =
 * its depth), so the browser Back button walks back through the quiz (features/quiz/useQuizHistory).
 */
export type HistoryState = {
  scene?: Scene;
  quiz?: number;
  /** The quiz was opened from the landing (there is a landing entry right before depth 0). */
  fromLanding?: boolean;
} | null;

/**
 * Scene state synced with the address: part 2 lives at #about, the quiz at #quiz; the browser Back button works,
 * a direct visit opens the scene without the long transition (`instant`).
 */
/**
 * True from «Выйти» until the browser has rewound the quiz's entries: the quiz's own history listener must not take
 * that rewind for «Назад» and undo the answers (a quiz opened directly lands on its own first entry).
 */
let leavingQuizNow = false;
export const leavingQuiz = () => leavingQuizNow;

export function useScene() {
  const [scene, setScene] = useState<Scene>(() => sceneFromHash(window.location.hash));
  // True until the first change: the initial scene appears without choreography.
  const [instant, setInstant] = useState(true);
  const sceneRef = useRef(scene);
  /** While leaving the quiz the history is rewound: those popstate events are ours, not navigation. */
  const leavingRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      if (leavingRef.current) return;
      const next = sceneFromHash(window.location.hash);
      if (next === sceneRef.current) return;
      sceneRef.current = next;
      setInstant(false);
      setScene(next);
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const go = useCallback((next: Scene) => {
    if (sceneRef.current === next) return;
    const state = window.history.state as HistoryState;
    if (next === 'about') {
      window.history.pushState({ scene: 'about' } satisfies HistoryState, '', ABOUT_HASH);
    } else if (next === 'quiz') {
      window.history.pushState(
        { scene: 'quiz', quiz: 0, fromLanding: true } satisfies HistoryState,
        '',
        QUIZ_HASH,
      );
    } else if (state?.scene === 'about') {
      // We added the #about entry ourselves: going back keeps the history short and Back predictable.
      window.history.back();
    } else {
      const { pathname, search } = window.location;
      window.history.pushState({ scene: 'hero' } satisfies HistoryState, '', pathname + search);
    }
    sceneRef.current = next;
    setInstant(false);
    setScene(next);
  }, []);

  /**
   * Leaves the quiz for the landing in one action, rewinding the quiz's own history entries so Back on the landing
   * never re-enters it (ТЗ §7.4). A quiz opened directly (no landing entry before it) replaces its entry instead.
   */
  const leaveQuiz = useCallback(() => {
    if (sceneRef.current !== 'quiz') return;
    const state = window.history.state as HistoryState;
    const depth = state?.quiz ?? 0;
    const fromLanding = state?.fromLanding === true;
    const { pathname, search } = window.location;
    sceneRef.current = 'hero';
    setInstant(false);
    setScene('hero');
    const finish = () => {
      leavingRef.current = false;
      leavingQuizNow = false;
      if (!fromLanding) {
        window.history.replaceState(
          { scene: 'hero' } satisfies HistoryState,
          '',
          pathname + search,
        );
      }
    };
    const steps = fromLanding ? depth + 1 : depth;
    if (steps === 0) {
      finish();
      return;
    }
    leavingRef.current = true;
    leavingQuizNow = true;
    window.addEventListener('popstate', finish, { once: true });
    window.history.go(-steps);
  }, []);

  return { scene, instant, go, leaveQuiz };
}
