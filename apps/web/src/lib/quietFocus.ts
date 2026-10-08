/**
 * Focus that moves with the content (a new scene, a closed dialog) must not look like a keyboard focus when the
 * person uses a mouse, a touchpad or a finger: browsers show the focus ring (and our buttons start their wave) on
 * script focus unless a pointer was clicked just before — a wheel or a swipe does not count. So the last input is
 * tracked, and focus moved after a non-keyboard input is marked quiet until the next key press.
 */

const QUIET = 'data-quiet-focus';
let lastInputWasKeyboard = false;
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  const keyboard = () => {
    lastInputWasKeyboard = true;
    for (const element of document.querySelectorAll(`[${QUIET}]`)) element.removeAttribute(QUIET);
  };
  const pointer = () => {
    lastInputWasKeyboard = false;
  };
  window.addEventListener('keydown', keyboard, true);
  window.addEventListener('pointerdown', pointer, true);
  window.addEventListener('wheel', pointer, { capture: true, passive: true });
  window.addEventListener('touchstart', pointer, { capture: true, passive: true });
}

/** Moves focus without scrolling; after a non-keyboard input the element shows no focus ring. */
export function focusQuietly(element: HTMLElement | null | undefined) {
  listen();
  if (!element) return;
  if (lastInputWasKeyboard) element.removeAttribute(QUIET);
  else {
    element.setAttribute(QUIET, '');
    element.addEventListener(
      'blur',
      () => {
        element.removeAttribute(QUIET);
      },
      { once: true },
    );
  }
  element.focus({ preventScroll: true });
}

/** Starts tracking the input early (before the first scene change). */
export function trackInputModality() {
  listen();
}
