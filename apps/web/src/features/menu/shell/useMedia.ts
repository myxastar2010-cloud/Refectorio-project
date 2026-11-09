import { useSyncExternalStore } from 'react';

/** Below this width Kiki is a sheet (a dialog) instead of a column (ТЗ фаза 4 §2; styles/menu.css). */
export const KIKI_SHEET_MEDIA = '(max-width: 1279.98px)';

/** A media query as React state: follows window resizes and rotations. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', listener);
      return () => {
        list.removeEventListener('change', listener);
      };
    },
    () => window.matchMedia(query).matches,
  );
}
