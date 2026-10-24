import { expect, test, type Page } from '@playwright/test';

/**
 * 4.11: no step of the quiz ever scrolls. Every step in every known sub-state (the test build's ?step=&state= hook,
 * features/quiz/flow/testStates.ts) on every window of the matrix: the step fits its screen, the page does not scroll,
 * and nothing but a text field scrolls. The one recorded last resort (D-050): the health step with every follow-up
 * question, two notes and four custom items at once (pregnant and breastfeeding, with diabetes, hypertension and
 * warfarin) on a phone — it scrolls inside, without a scrollbar.
 */

const STATES: Readonly<Record<string, readonly string[]>> = {
  taste: [''],
  body: ['empty', 'filled', 'child'],
  goal: [''],
  goalSetup: ['lose', 'maintain'],
  foodStyle: [''],
  macroProfile: [''],
  health: [''],
  healthConditions: ['empty', 'followups', 'max'],
  allergy: [''],
  allergens: ['empty', 'severe'],
  dislikes: [''],
  dislikesText: ['empty', 'long'],
  activity: [''],
  strength: [''],
  lifestyle: [''],
  extraGoals: ['empty', 'chosen', 'teen'],
  notes: ['empty', 'long'],
  adjustments: [''],
  finale: [''],
};

/** The team's laptop first, then the rest of the stage-3 matrix (ТЗ §2). */
const WINDOWS = [
  [1536, 730],
  [1920, 1080],
  [1366, 768],
  [1280, 720],
  [390, 844],
  [360, 800],
  [844, 390],
  [844, 340],
  [768, 1024],
  [1024, 768],
] as const;

/** The only state that may use the last resort. */
const LAST_RESORT = new Set(['healthConditions:max']);

async function measure(page: Page, step: string, state: string) {
  await page.goto(`./?seed=1&step=${step}${state ? `&state=${state}` : ''}#quiz`);
  const screen = page.locator(`.quiz-screen[data-screen="${step}"]`);
  await expect(screen).toHaveCount(1);
  // The fit is set before the step is painted; wrapping depends on the fonts only.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return screen.evaluate((element) => {
    const frame = element.firstElementChild as HTMLElement;
    const previous = frame.style.minHeight;
    frame.style.minHeight = '0';
    const needed = frame.offsetHeight;
    frame.style.minHeight = previous;
    const scrollers = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((node) => !node.matches('textarea, input, .quiz-screen[data-overflow]'))
      .filter((node) => !node.closest('[inert]'))
      .filter((node) => {
        const style = getComputedStyle(node);
        return (
          /auto|scroll/.test(style.overflowY + style.overflowX) &&
          (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)
        );
      })
      .map((node) => node.className);
    const page = document.scrollingElement;
    return {
      needed,
      available: element.clientHeight,
      lastResort: element.hasAttribute('data-overflow'),
      pageScrolls: page ? page.scrollHeight > window.innerHeight : false,
      scrollers,
    };
  });
}

async function checkAll(page: Page, steps: readonly string[]) {
  const problems: string[] = [];
  for (const step of steps) {
    for (const state of STATES[step] ?? ['']) {
      const name = `${step}:${state || '-'}`;
      const result = await measure(page, step, state);
      if (result.lastResort && !LAST_RESORT.has(name) && result.needed > result.available + 1) {
        problems.push(`${name}: needs ${String(result.needed)} of ${String(result.available)} px`);
      }
      if (!result.lastResort && result.needed > result.available + 1) {
        problems.push(
          `${name}: clipped, ${String(result.needed)} of ${String(result.available)} px`,
        );
      }
      if (result.pageScrolls) problems.push(`${name}: the page scrolls`);
      if (result.scrollers.length > 0)
        problems.push(`${name}: scrolls ${result.scrollers.join(', ')}`);
    }
  }
  return problems;
}

test.describe('no step scrolls (4.11)', () => {
  test.describe.configure({ mode: 'parallel' });

  for (const [width, height] of WINDOWS) {
    test(`every step and state fits ${String(width)}×${String(height)}`, async ({
      page,
      browserName,
      isMobile,
    }) => {
      test.skip(browserName !== 'chromium' || isMobile, 'the full matrix runs on desktop Chromium');
      test.slow();
      await page.setViewportSize({ width, height });
      expect(await checkAll(page, Object.keys(STATES))).toEqual([]);
    });
  }

  // The other engines and phones: the densest steps at their own window.
  test('the densest steps fit in every engine', async ({ page, browserName, isMobile }) => {
    test.skip(browserName === 'chromium' && !isMobile, 'covered by the matrix above');
    expect(
      await checkAll(page, [
        'body',
        'goalSetup',
        'healthConditions',
        'allergens',
        'dislikesText',
        'finale',
      ]),
    ).toEqual([]);
  });
});
