import { useCallback, useEffect, useRef, useState } from 'react';

export type Scene = 'hero' | 'about';

export const ABOUT_HASH = '#about';

const sceneFromHash = (hash: string): Scene => (hash === ABOUT_HASH ? 'about' : 'hero');

type HistoryState = { scene?: Scene } | null;

/**
 * Scene state synced with the address: part 2 lives at #about, the browser Back button works,
 * a direct visit to #about opens part 2 without the long transition (`instant`).
 */
export function useScene() {
  const [scene, setScene] = useState<Scene>(() => sceneFromHash(window.location.hash));
  // True until the first change: the initial scene appears without choreography.
  const [instant, setInstant] = useState(true);
  const sceneRef = useRef(scene);

  useEffect(() => {
    const sync = () => {
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
    if (next === 'about') {
      window.history.pushState({ scene: 'about' } satisfies HistoryState, '', ABOUT_HASH);
    } else if ((window.history.state as HistoryState)?.scene === 'about') {
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

  return { scene, instant, go };
}
