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

test.describe('small window: part 2 scrolls inside', () => {
  test.use({ viewport: { width: 600, height: 500 } });

  test('the wheel scrolls part 2; back to part 1 only with a new gesture from the very top', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'native wheel scrolling of an inner container; one engine is enough',
    );
    await page.goto('./?seed=1#about');
    await settled(page, 'about');
    const scroller = page.locator('.about-scroller');
    const scrollable = await scroller.evaluate(
      (element) => element.scrollHeight > element.clientHeight + 1,
    );
    expect(scrollable).toBe(true);
    const changes = await countSceneChanges(page);
    await page.mouse.move(300, 250);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    // Scrolling back up to the top and on (the same gesture, as with touchpad inertia) stays in part 2…
    await page.mouse.wheel(0, -1000);
    await page.mouse.wheel(0, -100);
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
    await page.waitForTimeout(300);
    expect(await changes()).toBe(0);
    // …and a new gesture after a pause goes back.
    await page.mouse.wheel(0, -120);
    await settled(page, 'hero');
  });

  test('keys scroll part 2 first and switch scenes only from its edge', async ({ page }) => {
    await page.goto('./?seed=1#about');
    await settled(page, 'about');
    const scroller = page.locator('.about-scroller');
    const top = () => scroller.evaluate((element) => element.scrollTop);
    await page.keyboard.press('ArrowDown');
    await expect.poll(top).toBeGreaterThan(0);
    await expect(scene(page)).toHaveAttribute('data-scene', 'about');
    // Back up to the top step by step, then one more press goes to part 1.
    for (let i = 0; i < 10 && (await top()) > 0; i += 1) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(150);
    }
    expect(await top()).toBe(0);
    await expect(scene(page)).toHaveAttribute('data-scene', 'about');
    await page.keyboard.press('ArrowUp');
    await settled(page, 'hero');
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

  test('the team name «translates» itself under the mouse and back', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'hover is the same everywhere; WebKit on Windows is slow for it',
    );
    await more(page).click();
    const name = page.locator('.name-flip');
    // Mean opacity of the letters of each name: [original, translation].
    const shown = () =>
      name.evaluate((root) =>
        [...root.querySelectorAll('.name-flip-text')].map((layer) => {
          const letters = [...layer.querySelectorAll('.flip-char')];
          const sum = letters.reduce(
            (total, letter) => total + Number(getComputedStyle(letter).opacity),
            0,
          );
          return Math.round((sum / letters.length) * 100) / 100;
        }),
      );
    await expect.poll(shown).toEqual([1, 0]);
    await name.hover();
    await expect.poll(shown).toEqual([0, 1]);
    await page.mouse.move(5, 5);
    await expect.poll(shown).toEqual([1, 0]);
    // The dialog keeps its accessible name in English.
    await expect(page.getByRole('dialog', { name: 'Modern Manifesto' })).toBeVisible();
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
    // The food drifts: the spot is found and pressed in one go, at the element really under it (as a real click).
    const press = (wanted: 'open' | 'covered') =>
      page.evaluate((wanted) => {
        type Food = { snapshot: () => Item[]; hitTest: (x: number, y: number) => number };
        const food = (window as Window & { __refectorioFood?: Food }).__refectorioFood;
        if (!food) return null;
        const items = food.snapshot();
        for (const [index, item] of items.entries()) {
          for (let dy = -0.4; dy <= 0.4; dy += 0.1) {
            for (let dx = -0.4; dx <= 0.4; dx += 0.1) {
              const x = item.x + dx * item.size;
              const y = item.y + dy * item.size;
              if (food.hitTest(x, y) !== index) continue;
              const target = document.elementFromPoint(x, y);
              const blocked = target?.closest('[data-opaque], button, a');
              const kind = !blocked ? 'open' : blocked.matches('[data-opaque]') ? 'covered' : null;
              if (kind !== wanted || !target) continue;
              target.dispatchEvent(
                new PointerEvent('pointerdown', {
                  clientX: x,
                  clientY: y,
                  button: 0,
                  bubbles: true,
                }),
              );
              return index;
            }
          }
        }
        return null;
      }, wanted);

    const open = await press('open');
    expect(open).not.toBeNull();
    if (open === null) return;
    await expect.poll(async () => (await snapshot(page))[open]?.scale ?? 1).toBeGreaterThan(1.03);
    const covered = await press('covered');
    if (covered !== null && covered !== open) {
      await page.waitForTimeout(120);
      expect((await snapshot(page))[covered]?.scale ?? 1).toBeLessThan(1.01);
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
