import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Antivirus web protection on the dev machine injects scripts into every page (decision D-017). */
const FOREIGN = /kaspersky-labs\.com/i;

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !FOREIGN.test(message.text()) &&
      !FOREIGN.test(message.location().url)
    ) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

export const scene = (page: Page) => page.locator('.page');

/** Waits until a scene transition (input lock) is over — by state, not by timeouts. */
export async function settled(page: Page, expected: 'hero' | 'about') {
  await expect(scene(page)).toHaveAttribute('data-ready', '');
  await expect(scene(page)).toHaveAttribute('data-scene', expected);
  await expect(scene(page)).not.toHaveAttribute('data-busy', /.*/);
}

/** Counts scene changes from now on (to prove that one gesture gives exactly one transition). */
export async function countSceneChanges(page: Page) {
  await page.evaluate(() => {
    const target = document.querySelector('.page');
    const w = window as Window & { __sceneChanges?: number };
    w.__sceneChanges = 0;
    if (!target) return;
    new MutationObserver(() => {
      w.__sceneChanges = (w.__sceneChanges ?? 0) + 1;
    }).observe(target, { attributes: true, attributeFilter: ['data-scene'] });
  });
  return () =>
    page.evaluate(() => (window as Window & { __sceneChanges?: number }).__sceneChanges ?? 0);
}

/**
 * axe with the documented contrast exception (ТЗ, design-system.md): small white text on #E63946 is 4.17:1 by the
 * team's decision. Only those elements are excluded — every other rule and element is checked.
 */
export async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .exclude('.feature-text')
    .exclude('.info-lead')
    .exclude('.info-link')
    .analyze();
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    );
}

/** Synthetic touch swipe dispatched on window (the scene controller listens there); works in all engines. */
export async function swipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  target = 'body',
) {
  await page.evaluate(
    ({ from, to, target }) => {
      const element = document.querySelector(target) ?? document.body;
      const fire = (type: string, x: number, y: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const point = { clientX: x, clientY: y, identifier: 1, target: element };
        Object.assign(event, {
          touches: type === 'touchend' ? [] : [point],
          changedTouches: [point],
        });
        element.dispatchEvent(event);
      };
      fire('touchstart', from.x, from.y);
      fire('touchend', to.x, to.y);
    },
    { from, to, target },
  );
}

/**
 * A touchpad fling: wheel deltas decaying by `ratio` every 16 ms, timed inside the page (Playwright's own
 * mouse.wheel waits for every event and is far too slow in WebKit to keep a realistic rhythm).
 */
export async function fling(page: Page, firstDeltaPx: number, ratio = 0.97) {
  await page.evaluate(
    async ({ firstDeltaPx, ratio }) => {
      const x = window.innerWidth / 2;
      const y = window.innerHeight * 0.4;
      const target = document.elementFromPoint(x, y) ?? document.body;
      for (let delta = firstDeltaPx; Math.abs(delta) > 1; delta *= ratio) {
        target.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: delta,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
    },
    { firstDeltaPx, ratio },
  );
}
