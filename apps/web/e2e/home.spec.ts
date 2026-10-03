import { expect, test, type Page } from '@playwright/test';
import {
  collectErrors,
  countSceneChanges,
  fling,
  scene,
  seriousViolations,
  settled,
} from './helpers';

test.skip(({ isMobile }) => isMobile, 'desktop interactions; phones are covered in mobile.spec.ts');

test.describe('scenes', () => {
  test('one mouse-wheel notch goes to part 2 and back', async ({ page }) => {
    await page.goto('./?seed=1');
    await settled(page, 'hero');
    await page.mouse.move(960, 400);
    await page.mouse.wheel(0, 120);
    await settled(page, 'about');
    await expect(page).toHaveURL(/#about$/);
    await page.mouse.wheel(0, -120);
    await settled(page, 'hero');
  });

  test('a touchpad fling with a long inertia tail gives exactly one transition', async ({
    page,
  }) => {
    await page.goto('./?seed=1');
    await settled(page, 'hero');
    const changes = await countSceneChanges(page);
    // ≈2.4 s of deltas: the tail is still strong (≈10 px every 16 ms) when the 1.15 s input lock ends.
    await fling(page, 90);
    await settled(page, 'about');
    expect(await changes()).toBe(1);
    // A fling back right away is a new gesture (inertia never reverses), and its own tail is silenced again.
    await fling(page, -90);
    await settled(page, 'hero');
    expect(await changes()).toBe(2);
  });

  test('keys switch scenes, but not when focus is on a button', async ({ page }) => {
    await page.goto('./?seed=1');
    await settled(page, 'hero');
    await page.locator('body').click({ position: { x: 900, y: 300 } });
    for (const [key, target] of [
      ['ArrowDown', 'about'],
      ['ArrowUp', 'hero'],
      ['PageDown', 'about'],
      ['PageUp', 'hero'],
      ['End', 'about'],
      ['Home', 'hero'],
      ['Space', 'about'],
      ['Shift+Space', 'hero'],
    ] as const) {
      await page.keyboard.press(key);
      await settled(page, target);
    }
    // Space on «О проекте» presses the button (it also leads to part 2), Space on the title in part 2 goes back.
    await page.getByRole('button', { name: 'О проекте', exact: true }).focus();
    await page.keyboard.press('Space');
    await settled(page, 'about');
    await expect(page.getByRole('button', { name: /Вернуться к началу/ })).toBeFocused();
  });

  test('buttons, the address and the Back button', async ({ page }) => {
    await page.goto('./?seed=1');
    await page.getByRole('button', { name: 'О проекте', exact: true }).click();
    await settled(page, 'about');
    await page.goBack();
    await settled(page, 'hero');
    await page.goForward();
    await settled(page, 'about');
    await page.getByRole('button', { name: /Вернуться к началу/ }).click();
    await settled(page, 'hero');
  });

  test('a direct visit to #about opens part 2 at once', async ({ page }) => {
    await page.goto('./?seed=1#about');
    await expect(scene(page)).toHaveAttribute('data-scene', 'about');
    await expect(page.getByRole('heading', { name: /О проекте/ })).toBeVisible();
    await expect(page.locator('.scene--hero')).toHaveAttribute('aria-hidden', 'true');
  });

  test('reduced motion: scenes switch with a short cross-fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?seed=1');
    await settled(page, 'hero');
    await page.keyboard.press('ArrowDown');
    await settled(page, 'about');
    await page.keyboard.press('ArrowUp');
    await settled(page, 'hero');
  });

  test('«Создать меню» shows a friendly note instead of a dialog', async ({ page }) => {
    await page.goto('./?seed=1');
    await page.getByRole('link', { name: 'Создать меню' }).click();
    await expect(page.getByRole('status')).toHaveText('Скоро: интерактивный тест');
    await expect(page).toHaveURL(/#quiz$/);
    await expect(scene(page)).toHaveAttribute('data-scene', 'hero');
  });
});

test.describe('team dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./?seed=1#about');
    await settled(page, 'about');
  });

  const more = (page: Page) => page.getByRole('button', { name: /Ещё о команде/ });

  test('opens, traps focus, closes with Esc and returns focus to «Ещё»', async ({ page }) => {
    await more(page).click();
    const dialog = page.getByRole('dialog', { name: /Modern Manifesto/ });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Закрыть' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Закрыть' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Закрыть' })).toBeFocused();
    await expect(dialog.getByRole('listitem')).toHaveCount(5);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(more(page)).toBeFocused();
  });

  test('closes with ✕ and with a click outside the card; scenes do not switch while open', async ({
    page,
  }) => {
    await more(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(scene(page)).toHaveAttribute('data-scene', 'about');
    await page.getByRole('button', { name: 'Закрыть' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await more(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.mouse.click(20, 20);
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});

test.describe('food', () => {
  type Item = { slug: string; x: number; y: number; size: number; scale: number; hidden: boolean };
  const snapshot = (page: Page) =>
    page.evaluate(
      () =>
        (
          window as Window & { __refectorioFood?: { snapshot: () => Item[] } }
        ).__refectorioFood?.snapshot() ?? [],
    );

  test('a click on visible food makes it bounce; a click on a card does not', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'pointer math is engine-independent; one engine is enough',
    );
    await page.goto('./?pose=design');
    await settled(page, 'hero');
    const target = await page.evaluate(() => {
      const food = (
        window as Window & {
          __refectorioFood?: { snapshot: () => Item[]; hitTest: (x: number, y: number) => number };
        }
      ).__refectorioFood;
      if (!food) return null;
      const items = food.snapshot();
      // An item whose centre is open (no card/button above it) and a point of an item hidden under a card.
      type Spot = { x: number; y: number; index: number };
      const found: { open: Spot | null; covered: Spot | null } = { open: null, covered: null };
      items.forEach((item, index) => {
        for (let dy = -0.4; dy <= 0.4; dy += 0.1) {
          for (let dx = -0.4; dx <= 0.4; dx += 0.1) {
            const x = item.x + dx * item.size;
            const y = item.y + dy * item.size;
            if (food.hitTest(x, y) !== index) continue;
            const blocked = document.elementFromPoint(x, y)?.closest('[data-opaque], button, a');
            if (!blocked && !found.open) found.open = { x, y, index };
            if (blocked?.matches('[data-opaque]') && !found.covered)
              found.covered = { x, y, index };
          }
        }
      });
      return found;
    });
    expect(target?.open).toBeTruthy();
    if (!target?.open) return;
    await page.mouse.click(target.open.x, target.open.y);
    const openIndex = target.open.index;
    await expect
      .poll(async () => (await snapshot(page))[openIndex]?.scale ?? 1)
      .toBeGreaterThan(1.03);
    if (target.covered) {
      const coveredIndex = target.covered.index;
      await page.mouse.click(target.covered.x, target.covered.y);
      await page.waitForTimeout(120);
      expect((await snapshot(page))[coveredIndex]?.scale ?? 1).toBeLessThan(1.01);
    }
  });
});

test.describe('quality', () => {
  test('no console errors, Nunito is used', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?seed=1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Питаться полезно и вкусно сейчас',
    );
    const faces = await page.evaluate(async () => {
      const loaded = await document.fonts.load('900 16px "Nunito Variable"', 'Питаться Refectorio');
      return loaded.filter((face) => face.status === 'loaded').length;
    });
    expect(faces).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('accessibility: both scenes and the dialog have no serious violations', async ({ page }) => {
    await page.goto('./?seed=1&freeze=1');
    await settled(page, 'hero');
    expect(await seriousViolations(page)).toEqual([]);
    await page.keyboard.press('ArrowDown');
    await settled(page, 'about');
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('button', { name: /Ещё о команде/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running'),
    );
    expect(await seriousViolations(page)).toEqual([]);
  });
});
