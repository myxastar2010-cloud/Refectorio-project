import { expect, type Page } from '@playwright/test';
import { scene } from './helpers';

/** The quiz scene is open and its entry (input lock) is over. */
export async function inQuiz(page: Page) {
  await expect(scene(page)).toHaveAttribute('data-ready', '');
  await expect(scene(page)).toHaveAttribute('data-scene', 'quiz');
  await expect(scene(page)).not.toHaveAttribute('data-busy', /.*/);
}

export const quiz = (page: Page) => page.locator('section.quiz');

/** Waits for a screen of the quiz (the section mirrors the state) and its title. */
export async function onScreen(page: Page, screen: string, title?: string | RegExp) {
  await expect(quiz(page)).toHaveAttribute('data-screen', screen);
  if (title !== undefined) {
    await expect(page.locator('#quiz-step-title')).toHaveText(title);
  }
}

/** The dish on the card that takes answers now. */
export const currentDish = (page: Page) =>
  page.locator('.quiz-card:not([aria-hidden]) .quiz-card-name');

/** The saved draft (localStorage) — the state the quiz resumes from. */
export function draft(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('refectorio.quiz.v1');
    return raw
      ? (
          JSON.parse(raw) as {
            state: {
              screen: string;
              history: string[];
              answers: Record<string, unknown> & {
                tasteDecisions: { dishId: string; answer: string }[];
              };
            };
          }
        ).state
      : null;
  });
}

/** Answers dish cards with the keyboard (D like, A dislike, S skip), one card at a time, as a person would. */
export async function playDishes(page: Page, keys: readonly ('a' | 's' | 'd')[]) {
  for (const key of keys) {
    const before = await currentDish(page).textContent();
    await page.keyboard.press(`Key${key.toUpperCase()}`);
    // The answered card has flown away (one card left, or none after the tenth answer) and a new dish is shown.
    await expect
      .poll(() =>
        page.evaluate((previous) => {
          const cards = document.querySelectorAll('.quiz-card').length;
          const shown = document.querySelector('.quiz-card:not([aria-hidden]) .quiz-card-name');
          return cards === 0 || (cards === 1 && shown !== null && shown.textContent !== previous);
        }, before),
      )
      .toBe(true);
  }
}

/** Ten decisive answers in a row: likes and dislikes alternate. */
export const TEN_DECISIVE = ['d', 'a', 'd', 'a', 'd', 'd', 'a', 'd', 'a', 'd'] as const;

/** A row of «О вас» / «Цель»: opens its picker with the keyboard and turns the wheel by `steps`. */
export async function setRow(page: Page, label: string, steps: number) {
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
  const wheel = page.getByRole('spinbutton');
  await expect(wheel).toBeFocused();
  for (let i = 0; i < Math.abs(steps); i += 1) {
    await page.keyboard.press(steps > 0 ? 'ArrowUp' : 'ArrowDown');
  }
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Chooses an option of a single-choice step by its label and waits for the next screen. */
export async function choose(page: Page, label: string | RegExp, nextScreen: string) {
  await page.getByRole('radio', { name: label }).click();
  await onScreen(page, nextScreen);
}
