import { expect, test, type Page } from '@playwright/test';

// ТЗ этапа 4, фаза 4: the finale's reveal, the menu page and its local data.

const title = (page: Page) => page.getByRole('heading', { name: 'Моё меню на неделю:' });

test.describe('the menu', () => {
  test('the finale ends in the reveal: the menu replaces the quiz in the history', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // ?reveal=demo starts the story at the pot, so the pulse comes within seconds of the plan.
    await page.goto('./?seed=11&step=finale&reveal=demo#quiz');
    await expect(title(page)).toBeVisible({ timeout: 40_000 });
    await expect(page).toHaveURL(/#menu$/);
    await expect(page.locator('.quiz')).toHaveCount(0);
    await expect(page.getByRole('tab', { selected: true }).first()).toBeVisible();
    // A quiz opened directly: Back leaves the site's quiz entries behind, never re-entering the finale.
    expect(await page.evaluate(() => (history.state as { scene?: string } | null)?.scene)).toBe(
      'menu',
    );
    expect(errors).toEqual([]);
  });

  test('reduced motion: the still pot cross-fades to the menu', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?seed=11&step=finale#quiz');
    await expect(title(page)).toBeVisible({ timeout: 40_000 });
    await expect(page.locator('.reveal-canvas, .reveal-ring')).toHaveCount(0);
  });

  test('marks, water and a reload: everything stays in this browser', async ({ page }) => {
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    const calories = page.locator('.widget--calories .widget-number');
    await expect(calories).toHaveText('0');
    await page
      .getByRole('button', { name: /^Отметить «.+» съеденным$/ })
      .first()
      .click();
    await expect(calories).not.toHaveText('0');
    await page.getByRole('button', { name: /Выпит ещё стакан воды/ }).click();
    await expect(page.locator('.widget--water .widget-number')).toHaveText('1');
    const eaten = await calories.textContent();
    await page.reload();
    await expect(calories).toHaveText(eaten ?? '');
    await expect(page.locator('.widget--water .widget-number')).toHaveText('1');
    await expect(page.getByRole('button', { name: /^Снять отметку/ })).toHaveCount(1);
  });

  test('days: keys page the weeks, the day card opens by right click and closes with Esc', async ({
    page,
  }) => {
    await page.goto('./?menu=demo&demo=week#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    const days = page.getByRole('tablist', { name: 'Дни недели' });
    const selected = days.getByRole('tab', { selected: true });
    await expect(selected).toHaveAccessibleName(/^Среда, 22\sиюля/);
    // ?demo=week: the past days carry their status.
    await expect(days.getByRole('tab', { name: /понедельник|Понедельник/ })).toHaveAccessibleName(
      /норма закрыта частично/,
    );
    await selected.focus();
    await page.keyboard.press('PageDown');
    await expect(days.getByRole('tab', { selected: true })).toHaveAccessibleName(
      /^Среда, 29\sиюля/,
    );
    await expect(page.getByRole('button', { name: 'Сегодня', exact: true })).toBeVisible();
    await page.keyboard.press('Home');
    await expect(days.getByRole('tab', { selected: true })).toHaveAccessibleName(
      /^Среда, 22\sиюля/,
    );
    await days.getByRole('tab', { name: /^Понедельник/ }).click({ button: 'right' });
    const card = page.getByRole('dialog', { name: /20\sиюля/ });
    await expect(card).toContainText('Норма закрыта частично');
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
  });

  test('the landing opens the stored menu', async ({ page }) => {
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    // The demo keeps its own data: the landing still offers the quiz.
    await page.getByRole('link', { name: 'ПроЛанч — на главную' }).click();
    await expect(page.getByRole('link', { name: 'Создать меню' })).toBeVisible();
  });
  test('edit mode: remove a meal with a confirm and undo it; reorder by keys', async ({ page }) => {
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    const tabs = page.getByRole('tablist', { name: 'Приёмы пищи' }).getByRole('tab');
    const names = () => tabs.allTextContents();
    const before = await names();
    await page.getByRole('button', { name: 'Изменить приёмы пищи' }).click();
    const last = before.at(-1) ?? '';
    await page.getByRole('button', { name: `Удалить «${last}»` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
    await expect.poll(names).toEqual(before.slice(0, -1));
    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect.poll(names).toEqual(before);
    // Keys: Space lifts the focused pill, ← moves it, Space drops it; the engine re-plans and offers «Отменить».
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(' ');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press(' ');
    await expect.poll(names).toEqual([before[1], before[0], ...before.slice(2)]);
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeVisible();
    await page.getByRole('button', { name: 'Готово' }).click();
    await expect(page.getByRole('button', { name: /^Удалить «/ })).toHaveCount(0);
  });

  test('the dish menu: a submenu by keys and by hover; a replacement and its undo', async ({
    page,
  }) => {
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    const names = () => page.locator('.dish-row .dish-open').allTextContents();
    const before = await names();
    const first = before[0] ?? '';
    // Keys: Enter on ⋯ opens the menu; ↓ to «Заменить блюдо», → into its submenu, ← back, Esc closes the menu.
    await page.getByRole('button', { name: `Действия: ${first}` }).focus();
    await page.keyboard.press('Enter');
    const dishMenu = page.getByRole('menu', { name: `Действия с блюдом «${first}»` });
    await expect(dishMenu).toBeVisible();
    await expect(dishMenu.getByRole('menuitem', { name: 'Подробнее' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    const sub = page.getByRole('menu', { name: 'Заменить блюдо' });
    await expect(sub.getByRole('menuitem', { name: 'Заменить с ИИ' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(sub).toHaveCount(0);
    await expect(dishMenu.getByRole('menuitem', { name: 'Заменить блюдо' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dishMenu).toHaveCount(0);
    // Right click on the card opens the same menu; hover opens the submenu; the picker lists the engine's choices.
    await page.locator('.dish-card').first().click({ button: 'right' });
    await dishMenu.getByRole('menuitem', { name: 'Заменить блюдо' }).hover();
    await sub.getByRole('menuitem', { name: 'Заменить с ИИ' }).click();
    const picker = page.getByRole('dialog', { name: `Чем заменить «${first}»` });
    const option = picker.locator('.replace-option:not(.replace-option--ghost)').first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    const chosen = (await option.locator('.replace-name').textContent()) ?? '';
    await option.click();
    await expect.poll(async () => (await names())[0]).toBe(chosen);
    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect.poll(names).toEqual(before);
  });
});
