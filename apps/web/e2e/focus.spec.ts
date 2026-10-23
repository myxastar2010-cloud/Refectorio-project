import { expect, test, type Page } from '@playwright/test';
import { settled } from './helpers';

/**
 * 4.7: no focus outline or ring anywhere. After a click or a focus moved by the page, the focused element looks
 * exactly as unfocused; after Tab, it shows its own state instead (the wave from the centre, or the explicit states of
 * components.css «Keyboard focus»).
 */

test.skip(({ isMobile }) => isMobile, 'keyboard focus: desktop');

/** The focused element's outline and box-shadow, and the same with the focus taken away. */
async function focusedLook(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return null;
    const look = () => {
      const style = getComputedStyle(element);
      return { outline: `${style.outlineStyle} ${style.outlineWidth}`, shadow: style.boxShadow };
    };
    const focused = look();
    element.blur();
    const unfocused = look();
    element.focus({ preventScroll: true });
    return { name: element.className, focused, unfocused };
  });
}

/** A wave host's ink layer has grown (its clip circle is not empty). */
const waveShown = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    const layer = element?.querySelector<HTMLElement>(':scope > .wave-layer');
    if (!layer) return null;
    const clip = getComputedStyle(layer).clipPath;
    return !/circle\(0(px)?[ )]/.test(clip);
  });

test('a click or a focus moved by the page shows no ring and no change', async ({ page }) => {
  await page.goto('./?seed=1');
  await settled(page, 'hero');
  await page.getByRole('button', { name: 'О проекте', exact: true }).click();
  await settled(page, 'about');
  // Focus moved to the title of part 2 by the page.
  const title = await focusedLook(page);
  expect(title).not.toBeNull();
  expect(title?.focused).toEqual(title?.unfocused);
  expect(title?.focused.outline).toMatch(/^none|0px$/);
  // A click on a button.
  await page.getByRole('button', { name: /Подробнее о команде/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const close = await focusedLook(page);
  expect(close?.focused).toEqual(close?.unfocused);
});

test('Tab shows each control its own state, never an outline', async ({ page }) => {
  await page.goto('./?seed=1');
  await settled(page, 'hero');
  await page.locator('body').click({ position: { x: 900, y: 300 } });
  const seen: string[] = [];
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press('Tab');
    const look = await focusedLook(page);
    if (!look) continue;
    seen.push(look.name);
    expect(look.focused.outline, look.name).toMatch(/^none|0px$/);
    // Every control of the landing header and part 1 is a wave host: the wave grows from the centre.
    await expect.poll(() => waveShown(page), { message: look.name }).toBe(true);
  }
  expect(seen.length).toBeGreaterThanOrEqual(3);
});

test('«Цены»: the ✕ fills with ink and the plan gets its ring on Tab', async ({ page }) => {
  await page.goto('./?seed=1');
  await settled(page, 'hero');
  await page.getByRole('button', { name: 'Цены', exact: true }).click();
  await settled(page, 'pricing');
  const close = page.getByRole('button', { name: 'Закрыть цены' });
  // From the keyboard: Tab until the ✕ has the focus.
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('Tab');
    if (await close.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(close).toBeFocused();
  await expect(close).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(close).toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Выбрать тариф «Бесплатно»' })).toBeFocused();
  await expect(page.locator('.plan[data-plan="free"] .plan-ring')).toHaveCSS('opacity', '1');
});
