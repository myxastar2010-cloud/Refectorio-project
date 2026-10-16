import { useEffect, useRef, type RefObject } from 'react';
import { focusQuietly } from '../../../lib/quietFocus';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Everything around an open dialog of the quiz: made inert (not clickable, not reachable, not announced). */
const BACKGROUND = '.site-header, .quiz-header, .quiz-stage, .quiz-notice-layer, .quiz-toast';

type Options = {
  readonly open: boolean;
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  /** Where focus goes back when the dialog closes (the opener). */
  readonly returnFocusTo?: HTMLElement | null;
  /** The element to focus first (otherwise the first focusable inside). */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * Dialog behaviour for the quiz's sheets, notices and pickers (ТЗ §7.5, §8.3): focus moves in and is trapped, Esc
 * closes, the background is inert, focus returns to the opener. The landing's team dialog does the same its own way.
 */
export function useModal({ open, containerRef, onClose, returnFocusTo, initialFocusRef }: Options) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const container = containerRef.current;
    const opener = returnFocusTo ?? (document.activeElement as HTMLElement | null);
    const background = [...document.querySelectorAll<HTMLElement>(BACKGROUND)].filter(
      (element) => !container?.contains(element) && !element.contains(container),
    );
    const wasInert = background.map((element) => element.inert);
    for (const element of background) element.inert = true;

    // The control of a picker ([data-autofocus]: the wheel, the chosen option) before the × of its head.
    const first =
      initialFocusRef?.current ??
      container?.querySelector<HTMLElement>('[data-autofocus]') ??
      container?.querySelector<HTMLElement>(FOCUSABLE) ??
      container;
    // After the dialog's first frame: focusing a node that is still being inserted may scroll the page.
    const frame = window.requestAnimationFrame(() => {
      focusQuietly(first);
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // A field that handles Escape itself (typing a number into the wheel) cancels only its own edit.
        if ((event.target as Element | null)?.closest('[data-own-escape]')) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !container) return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      const firstItem = items[0];
      const lastItem = items.at(-1);
      if (!firstItem || !lastItem) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown, true);
      background.forEach((element, index) => {
        element.inert = wasInert[index] ?? false;
      });
      // Not into a step that is leaving (inert): the new step moves focus to its own title.
      if (opener?.isConnected && !opener.closest('[inert]')) focusQuietly(opener);
      // The opener is gone (the answers were deleted and the quiz started over): the current step's title.
      else if (!opener?.isConnected) focusQuietly(document.getElementById('quiz-step-title'));
    };
  }, [open, containerRef, returnFocusTo, initialFocusRef]);
}
