import { useIsPresent } from 'motion/react';
import { useEffect, useRef } from 'react';

/** Elements that use Enter themselves. */
const OWN_ENTER =
  'button, a, input, textarea, select, [role="radio"], [role="spinbutton"], [contenteditable="true"]';

/**
 * Enter continues a step when its answer is complete (ТЗ §7.8) — from the step title (where focus lands) or the page,
 * never from a control that uses Enter itself, and not while a dialog or notice is open.
 */
export function useEnterToContinue(enabled: boolean, onContinue: () => void) {
  const present = useIsPresent();
  const latest = useRef(onContinue);
  useEffect(() => {
    latest.current = onContinue;
  }, [onContinue]);

  useEffect(() => {
    if (!enabled || !present) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.repeat) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if ((event.target as Element | null)?.closest(OWN_ENTER)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled, present]);
}
