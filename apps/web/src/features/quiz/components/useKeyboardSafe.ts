import { useEffect, type RefObject } from 'react';

/** Space kept between a focused field and the on-screen keyboard (px). */
const KEYBOARD_GAP_PX = 16;

/**
 * Phones (ТЗ §7.10): the focused field is never covered by the on-screen keyboard. The keyboard shrinks the visual
 * viewport; when the field's bottom ends up under it, the step's own scroll container scrolls by the hidden part.
 */
export function useKeyboardSafe(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const field = ref.current;
    const viewport = window.visualViewport;
    if (!field || !viewport) return undefined;
    const reveal = () => {
      if (document.activeElement !== field) return;
      const rect = field.getBoundingClientRect();
      const hidden = rect.bottom + KEYBOARD_GAP_PX - (viewport.offsetTop + viewport.height);
      if (hidden <= 0) return;
      const scroller = field.closest<HTMLElement>('.quiz-screen');
      scroller?.scrollBy({ top: Math.min(hidden, Math.max(0, rect.top - KEYBOARD_GAP_PX)) });
    };
    viewport.addEventListener('resize', reveal);
    field.addEventListener('focus', reveal);
    return () => {
      viewport.removeEventListener('resize', reveal);
      field.removeEventListener('focus', reveal);
    };
  }, [ref]);
}
