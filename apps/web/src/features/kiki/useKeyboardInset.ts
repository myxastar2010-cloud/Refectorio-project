import { useEffect, type RefObject } from 'react';

/** Below this the visual viewport is only the browser's own toolbars, not a keyboard (px). */
const KEYBOARD_MIN_PX = 120;

/**
 * Phones (ТЗ 07 §10): Kiki's sheet follows the visual viewport, so the on-screen keyboard never covers the composer.
 * Safari on iOS and Chrome on Android keep the layout viewport when the keyboard opens, and a fixed full-height sheet
 * would stay under the keys. The sheet gets the visible band as `--kiki-vv-top` / `--kiki-vv-bottom` (used by the
 * phone layout only) and `data-keyboard` while the keyboard is up (the quick cards step aside).
 */
export function useKeyboardInset(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const sheet = ref.current?.closest<HTMLElement>('.menu-kiki-slot');
    if (!viewport || !sheet) return undefined;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // A pinch zoom also shrinks the visual viewport; only the keyboard (scale 1) moves the sheet.
        const zoomed = viewport.scale > 1.01;
        const top = zoomed ? 0 : Math.max(0, viewport.offsetTop);
        const bottom = zoomed ? 0 : Math.max(0, window.innerHeight - viewport.height - top);
        sheet.style.setProperty('--kiki-vv-top', `${Math.round(top)}px`);
        sheet.style.setProperty('--kiki-vv-bottom', `${Math.round(bottom)}px`);
        sheet.toggleAttribute('data-keyboard', bottom > KEYBOARD_MIN_PX);
      });
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      sheet.style.removeProperty('--kiki-vv-top');
      sheet.style.removeProperty('--kiki-vv-bottom');
      sheet.removeAttribute('data-keyboard');
    };
  }, [ref]);
}
