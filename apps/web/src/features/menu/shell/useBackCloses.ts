import { useEffect, useRef } from 'react';

/**
 * Our own step back (an overlay closed by its ✕): the next overlay waits for its popstate, so it never takes that event
 * for the Back button.
 */
let settled: Promise<void> = Promise.resolve();

function stepBack(): void {
  settled = new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('popstate', done);
      resolve();
    };
    window.addEventListener('popstate', done);
    window.history.back();
  });
}

/**
 * An overlay of the menu (dish details, search, a letter) is a history entry of its own (ТЗ фаза 4 §2): the browser
 * Back button closes it, and closing it otherwise takes the entry away again. The address stays the same, so the scene
 * router (app/useScene) does not move.
 */
export function useBackCloses(open: boolean, onClose: () => void, key: string): void {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    let pushed = false;
    let popped = false;
    const onPop = () => {
      popped = true;
      closeRef.current();
    };
    void settled.then(() => {
      if (!alive) return;
      const state: unknown = window.history.state;
      window.history.pushState(
        { ...(typeof state === 'object' && state ? state : {}), overlay: key },
        '',
      );
      pushed = true;
      window.addEventListener('popstate', onPop);
    });
    return () => {
      alive = false;
      window.removeEventListener('popstate', onPop);
      const state = window.history.state as { overlay?: string } | null;
      if (pushed && !popped && state?.overlay === key) stepBack();
    };
  }, [open, key]);
}
