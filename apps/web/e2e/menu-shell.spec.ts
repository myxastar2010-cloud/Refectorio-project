import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './helpers';

// ТЗ этапа 4, фаза 4 §2 and §15: axe on every state of the menu, two tabs in sync, the wheel, the phone's shell.

const title = (page: Page) => page.getByRole('heading', { name: 'Моё меню на неделю:' });

async function open(page: Page, query = '?menu=demo') {
  await page.goto(`./${query}#menu`);
  await expect(title(page)).toBeVisible({ timeout: 30_000 });
}

test.describe('the menu shell', () => {
  test.use({ viewport: { width: 1536, height: 730 } });

  test('axe: no serious violations in any state of the page', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, '?menu=demo&demo=week');
    const states: [string, () => Promise<void>][] = [
      ['base', async () => {}],
      [
        'dish menu',
        async () => {
          await page
            .locator('.dish-card')
            .first()
            .getByRole('button', { name: /^Действия: / })
            .click();
          await expect(page.getByRole('menu')).toBeVisible();
        },
      ],
      [
        'details',
        async () => {
          await page.locator('.dish-row .dish-open').first().click();
          await expect(page.getByRole('dialog')).toBeVisible();
        },
      ],
      [
        'news',
        async () => {
          await page.getByRole('button', { name: /^Новости от Кики/ }).click();
          await expect(page.getByRole('dialog', { name: 'Новости от Кики' })).toBeVisible();
        },
      ],
      [
        'account',
        async () => {
          await page.getByRole('button', { name: 'Аккаунт' }).first().click();
          await expect(page.getByRole('menu')).toBeVisible();
        },
      ],
      [
        'goal',
        async () => {
          await page.getByRole('button', { name: /^Цель:/ }).click();
          await expect(page.getByRole('dialog', { name: 'Цель' })).toBeVisible();
        },
      ],
      [
        'search',
        async () => {
          await page.getByRole('button', { name: 'Поиск по меню' }).click();
          await page.getByRole('combobox').fill('суп');
          await expect(page.getByRole('listbox')).toBeVisible();
        },
      ],
      [
        'edit mode',
        async () => {
          await page.getByRole('button', { name: 'Изменить приёмы пищи' }).click();
          await expect(page.getByRole('button', { name: 'Готово' })).toBeVisible();
        },
      ],
    ];
    const found: string[] = [];
    for (const [name, enter] of states) {
      await enter();
      for (const violation of await seriousViolations(page, {
        allowContrast: '.widget--calories',
      }))
        found.push(`${name} → ${violation}`);
      // Back to the plain page: Esc closes every overlay; edit mode ends with «Готово».
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      const done = page.getByRole('button', { name: 'Готово' });
      if (await done.isVisible()) await done.click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    expect(found).toEqual([]);
  });

  test('two tabs: a mark in one shows in the other without a reload', async ({ page }) => {
    await open(page);
    const other = await page.context().newPage();
    await open(other);
    await page
      .getByRole('button', { name: /^Отметить «.+» съеденным$/ })
      .first()
      .click();
    await expect(other.getByRole('button', { name: /^Снять отметку/ })).toHaveCount(1);
    await other.getByRole('button', { name: /^Снять отметку/ }).click();
    await expect(page.getByRole('button', { name: /^Снять отметку/ })).toHaveCount(0);
  });

  test('edit mode: a pill dragged by the mouse lands after its neighbour; «Отменить» puts it back', async ({
    page,
  }) => {
    await open(page);
    // Tabs outside edit mode, a toolbar's buttons in it (MealTabs): one locator for both.
    const tabs = page.locator('.meal-tabs .meal-tab');
    const names = () => tabs.allTextContents();
    const before = await names();
    await page.getByRole('button', { name: 'Изменить приёмы пищи' }).click();
    const first = await tabs.nth(0).boundingBox();
    const second = await tabs.nth(1).boundingBox();
    if (!first || !second) throw new Error('no pills');
    const y = first.y + first.height / 2;
    await page.mouse.move(first.x + first.width / 2, y);
    await page.mouse.down();
    // Just past the neighbour's middle: the pill takes its place (further on it would pass the next one too).
    const from = first.x + first.width / 2;
    const to = second.x + second.width / 2 + 6;
    for (let step = 1; step <= 8; step += 1)
      await page.mouse.move(from + ((to - from) * step) / 8, y);
    await page.mouse.up();
    await expect.poll(names).toEqual([before[1], before[0], ...before.slice(2)]);
    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect.poll(names).toEqual(before);
  });

  test('the wheel pages one week per gesture; the cards slide in and settle', async ({ page }) => {
    await open(page);
    const days = page.getByRole('tablist', { name: 'Дни недели' });
    await expect(days.getByRole('tab', { selected: true })).toHaveAccessibleName(
      /^Среда, 22\sиюля/,
    );
    await days.hover();
    // One flick: many events, the inertia tail must not page twice.
    for (let i = 0; i < 6; i += 1) await page.mouse.wheel(0, 60);
    await expect(days.getByRole('tab', { name: /^Среда, 29\sиюля/ })).toBeVisible();
    await expect(days.getByRole('tab', { name: /^Среда, 5\sавгуста/ })).toHaveCount(0);
    // Another day: the row settles where it belongs (no card left mid-slide or transparent).
    await days.getByRole('tab', { name: /^Пятница/ }).click();
    const cell = page.locator('.dish-row .dish-cell').first();
    await expect
      .poll(() =>
        cell.evaluate((el) => getComputedStyle(el).transform + getComputedStyle(el).opacity),
      )
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))1$/);
  });
});

test.describe('the menu on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the bottom tab bar, the demo toasts, Kiki in a sheet, no sideways scroll', async ({
    page,
  }) => {
    await open(page);
    const nav = page.getByRole('navigation', { name: 'Разделы' });
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect(box?.y ?? 0).toBeGreaterThan(844 / 2);
    // The closed sheet is out of reach: nothing of it in the Tab order.
    await expect(page.locator('.menu-kiki-slot')).toHaveAttribute('inert', '');
    await nav.getByRole('button', { name: 'Статистика' }).click();
    await expect(page.getByText('Демо: мы ещё работаем над этим')).toBeVisible();
    await page.getByRole('button', { name: 'Открыть Кики' }).last().click();
    const kiki = page.getByRole('dialog', { name: 'Кики — ваш личный ИИ' });
    await expect(kiki).toBeVisible();
    // A dialog: focus inside, the page behind it out of reach.
    await expect(kiki.locator(':focus')).toHaveCount(1);
    await expect(page.locator('.menu-main')).toHaveAttribute('inert', '');
    await kiki.getByRole('textbox', { name: 'Спроси что угодно…' }).fill('Привет');
    await kiki.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByText('Кики подключится совсем скоро')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.menu-kiki-slot')).toHaveAttribute('inert', '');
    await expect(page.getByRole('button', { name: 'Открыть Кики' }).last()).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('after the reveal from the quiz the Kiki sheet stays closed and off the screen', async ({
    page,
  }) => {
    await page.goto('./?seed=11&step=finale&reveal=demo#quiz');
    await expect(title(page)).toBeVisible({ timeout: 60_000 });
    const slot = page.locator('.menu-kiki-slot');
    await expect(slot).toHaveAttribute('inert', '');
    // The intro's inline styles land on an inner box: the sheet keeps its CSS transform (below the screen).
    await expect.poll(async () => (await slot.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(844);
  });
});
