import { animate } from 'motion/react';
import { DURATION, EASE_OUT_SOFT, QUIZ } from '../../../motion/tokens';

/**
 * The «chosen» moment of a single-choice answer (ТЗ §7.7): a small press and a light spring back with a little
 * overshoot, then the step moves on — ≤ ≈ 450 ms with the wave on desktop. Reduced motion: at once.
 */
export async function bounceThen(element: HTMLElement, calm: boolean, then: () => void) {
  if (calm) {
    then();
    return;
  }
  // Explicit keyframes: from «none» Motion would start the press at scale(0).
  await animate(
    element,
    { transform: ['scale(1)', `scale(${QUIZ.choice.bounceScale})`] },
    { duration: QUIZ.choice.pressMs / 1000, ease: 'easeOut' },
  );
  const back = animate(
    element,
    { transform: [`scale(${QUIZ.choice.bounceScale})`, 'scale(1)'] },
    QUIZ.choiceSpring,
  );
  await new Promise((resolve) => window.setTimeout(resolve, QUIZ.choice.settleMs));
  then();
  await back;
}

/**
 * Single-key shortcuts act only while the focus is in the current step (or nowhere): with «Выйти», «Вернуться» or the
 * landing in focus a letter or a digit must not answer (WCAG 2.1.4).
 */
export function focusInStep(): boolean {
  const active = document.activeElement;
  return (
    !active || active === document.body || active.closest('.quiz-screen:not([inert])') !== null
  );
}

/** Digits 1–9 choose the n-th answer of a single-choice step (never inside a text field). */
export function digitIndex(event: KeyboardEvent): number | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (!focusInStep()) return null;
  const target = event.target as Element | null;
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return null;
  return /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : null;
}

/**
 * A chip that comes after the step has entered (typed through «+», surfaced by its words) arrives like the step's own
 * blocks (4.5): a blur-in with a small rise, on the same curve; the chips present from the start enter with their block.
 */
export function arriveChip(element: HTMLElement, calm: boolean) {
  if (!element.closest('.quiz-screen[data-entering]')) return;
  const into = QUIZ.stepIn;
  if (calm) {
    void animate(element, { opacity: [0, 1] }, { duration: DURATION.fade });
    return;
  }
  void animate(
    element,
    {
      opacity: [0, 1],
      filter: [`blur(${String(into.blurPx)}px)`, 'blur(0px)'],
      transform: [`translateY(${String(into.risePx / 2)}px)`, 'translateY(0px)'],
    },
    { duration: into.durationMs / 1000, ease: EASE_OUT_SOFT },
  ).then(() => {
    element.style.removeProperty('filter');
  });
}

/** The micro-bounce of a chip that changed state (ТЗ §7.7): a light press, then a spring back with a little overshoot. */
export function popChip(element: HTMLElement, calm: boolean) {
  if (calm) return;
  void animate(
    element,
    { transform: [`scale(${QUIZ.chipPressScale})`, 'scale(1)'] },
    QUIZ.chipSpring,
  );
}
