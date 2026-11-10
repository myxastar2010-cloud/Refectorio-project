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
    // The number counts up to its new value: read where it ends.
    const eaten = await calories.getAttribute('data-value');
    await expect(calories).toHaveText(eaten ?? '');
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
    // Tabs outside edit mode, a toolbar's buttons in it (MealTabs): one locator for both.
    const tabs = page.locator('.meal-tabs .meal-tab');
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
    // Right click on the card opens the same menu; hover opens the submenu. Kiki's server is down here: «Заменить с ИИ»
    // falls back to the picker with the engine's choices (D-111) — the action never depends on the network.
    await page.route('**/api/kiki/chat', (route) =>
      route.fulfill({ status: 503, json: { code: 'provider_unavailable' } }),
    );
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

  test('dish details: tabs by keys, an eaten mark from inside, Esc and Back close it', async ({
    page,
  }) => {
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    const first = (await page.locator('.dish-row .dish-open').first().textContent()) ?? '';
    await page.locator('.dish-row .dish-open').first().click();
    const details = page.getByRole('dialog', { name: first });
    await expect(details).toBeVisible();
    await expect(details.getByRole('tab', { name: 'Обзор' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await details.getByRole('tab', { name: 'Обзор' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(details.getByRole('tab', { name: 'КБЖУ' })).toBeFocused();
    await expect(details.getByRole('tabpanel').getByRole('table')).toBeVisible();
    await page.keyboard.press('End');
    await expect(details.getByRole('tabpanel')).toContainText('Ваши ограничения');
    await details.getByRole('button', { name: 'Отметить съеденным' }).click();
    await expect(details.getByRole('button', { name: 'Съедено' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(details).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Снять отметку/ })).toHaveCount(1);
    // Back closes it too and leaves the menu where it was.
    await page.locator('.dish-row .dish-open').first().click();
    await expect(details).toBeVisible();
    await page.goBack();
    await expect(details).toHaveCount(0);
    await expect(title(page)).toBeVisible();
  });

  test('⋯: every download format, then the backup restores the plan after a regenerate', async ({
    page,
  }) => {
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    const more = page.locator('.menu-top').getByRole('button', { name: 'Ещё' });
    const formats = [
      ['Картинка (PNG)', '.png'],
      ['Картинка (JPEG)', '.jpg'],
      ['PDF', '.pdf'],
      ['Excel (XLSX)', '.xlsx'],
      ['Таблица (CSV)', '.csv'],
      ['Календарь (ICS)', '.ics'],
      ['Текст (TXT)', '.txt'],
      ['Резервная копия (JSON)', '.json'],
    ] as const;
    let backup = '';
    for (const [label, extension] of formats) {
      await more.click();
      await page.getByRole('menuitem', { name: 'Скачать меню' }).click();
      const waiting = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: label }).click();
      const file = await waiting;
      expect(file.suggestedFilename()).toMatch(new RegExp(`^ПроЛанч — меню .+\\${extension}$`));
      const path = await file.path();
      const { size } = await import('node:fs').then((fs) => fs.promises.stat(path));
      expect(size).toBeGreaterThan(200);
      if (extension === '.json') backup = path;
      if (extension === '.pdf') {
        const head = await import('node:fs').then((fs) => fs.promises.readFile(path));
        expect(head.subarray(0, 8).toString('latin1')).toBe('%PDF-1.7');
      }
    }
    const names = () => page.locator('.dish-row .dish-open').allTextContents();
    const before = await names();
    // Regenerate with a confirm; «Отменить» brings the plan back.
    await more.click();
    await page.getByRole('menuitem', { name: 'Перегенерировать меню' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Пересобрать' }).click();
    await expect(page.getByText('Меню пересобрано')).toBeVisible();
    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect.poll(names).toEqual(before);
    // The backup file: checked, previewed, applied.
    await more.click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Загрузить меню из файла' }).click();
    await (await chooser).setFiles(backup);
    const sheet = page.getByRole('dialog', { name: 'Загрузить меню из файла' });
    await expect(sheet).toContainText('Резервная копия от');
    await sheet.getByRole('button', { name: 'Загрузить' }).click();
    await expect(page.getByText('Меню загружено из файла')).toBeVisible();
    await expect.poll(names).toEqual(before);
  });

  test('the goal sheet: a forbidden goal is greyed, the preview shows the day before → after', async ({
    page,
  }) => {
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Цель:/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Цель' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('radio', { checked: true })).toHaveCount(1);
    await sheet.getByRole('radio', { name: 'Поддерживать вес' }).click();
    await expect(sheet.getByText(/ккал$/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Применить' }).click();
    await expect(page.getByText('Цель изменена — меню пересобрано')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Цель: поддержание веса' })).toBeVisible();
    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect(page.getByRole('button', { name: /^Цель: [−+]/ })).toBeVisible();
  });

  test('news from Kiki: hover opens, a click pins, a letter opens and is read, «Прочитать все»', async ({
    page,
  }) => {
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    const bell = page.getByRole('button', { name: 'Новости от Кики — есть непрочитанные' });
    await bell.hover();
    const panel = page.getByRole('dialog', { name: 'Новости от Кики' });
    await expect(panel).toBeVisible();
    await expect(panel.locator('.news-item')).toHaveCount(2);
    await page.mouse.move(5, 5);
    await expect(panel).toHaveCount(0);
    // Keyboard: Enter pins it with the focus on the first letter.
    await bell.focus();
    await page.keyboard.press('Enter');
    await expect(panel.locator('.news-item').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(panel.getByRole('heading', { level: 3 })).toBeVisible();
    await panel.getByRole('button', { name: 'Назад' }).click();
    await panel.getByRole('button', { name: 'Прочитать все' }).click();
    await expect(panel.locator('.news-item[data-unread]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Новости от Кики', exact: true })).toBeFocused();
  });

  test('the storage notice stays closed; the account: avatar, digest, delete my data', async ({
    page,
  }) => {
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    const notes = page.getByRole('region', { name: 'Важно о меню' });
    await expect(notes).toContainText('хранятся только в этом браузере');
    await notes.getByRole('button', { name: 'Понятно' }).click();
    await expect(notes).not.toContainText('хранятся только');
    await page.reload();
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    await expect(notes).not.toContainText('хранятся только');
    // The account menu: a new avatar from the grid, the daily digest off.
    await page.getByRole('button', { name: 'Аккаунт' }).first().click();
    const account = page.getByRole('menu', { name: 'Аккаунт' });
    await expect(account).toContainText('Гость');
    await account.getByRole('menuitem', { name: 'Сменить аватар' }).click();
    await page.getByRole('menuitemradio', { name: 'Аватар 3' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Аватар 3' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const digest = account.getByRole('menuitemcheckbox', { name: 'Ежедневная сводка' });
    await expect(digest).toHaveAttribute('aria-checked', 'true');
    await digest.click();
    await expect(digest).toHaveAttribute('aria-checked', 'false');
    await account.getByRole('menuitem', { name: 'Удалить мои данные' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByText('Данные удалены из этого браузера')).toBeVisible();
    await page.goto('./#menu');
    await expect(page.getByRole('heading', { name: 'Меню ещё нет' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('custom widgets: add from edit mode, options, collagen card, move and remove with undo', async ({
    page,
  }) => {
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    const add = async (name: string) => {
      await page.getByRole('button', { name: 'Изменить приёмы пищи' }).click();
      await page.getByRole('button', { name: 'Добавить', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Добавить виджет' }).click();
      const picker = page.getByRole('dialog', { name: 'Новый виджет' });
      await picker.getByRole('searchbox').fill(name.slice(0, 4).toLowerCase());
      await picker.getByRole('button', { name, exact: true }).first().click();
      await picker.getByText('За неделю').click();
      await picker.getByRole('button', { name: 'Добавить' }).click();
      await page.getByRole('button', { name: 'Готово' }).click();
    };
    await add('Железо');
    const widgets = page.getByRole('list', { name: 'Мои виджеты' });
    await expect(widgets.getByRole('listitem')).toHaveCount(1);
    await expect(widgets).toContainText('Железо');
    await add('Белки');
    await expect(widgets.getByRole('listitem')).toHaveCount(2);
    // The honest card for collagen.
    await page.getByRole('button', { name: 'Изменить приёмы пищи' }).click();
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Добавить виджет' }).click();
    const picker = page.getByRole('dialog', { name: 'Новый виджет' });
    await picker.getByRole('searchbox').fill('коллаген');
    await expect(picker).toContainText('нет надёжных данных о коллагене');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Готово' }).click();
    // Move «Белки» left, then remove it and undo.
    await widgets.getByRole('button', { name: /^Белки/ }).click();
    await page.getByRole('menuitem', { name: 'Левее' }).click();
    await expect(widgets.getByRole('listitem').first()).toContainText('Белки');
    await widgets.getByRole('button', { name: /^Белки/ }).click();
    await page.getByRole('menuitem', { name: 'Убрать виджет' }).click();
    await expect(widgets.getByRole('listitem')).toHaveCount(1);
    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect(widgets.getByRole('listitem')).toHaveCount(2);
    await page.reload();
    await expect(widgets.getByRole('listitem')).toHaveCount(2, { timeout: 30_000 });
  });

  test('search: «/» opens it, results by day and meal, arrows and Enter, Esc restores the dishes', async ({
    page,
  }) => {
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    const names = () => page.locator('.dish-row .dish-open').allTextContents();
    const before = await names();
    const word = (before[0] ?? '').split(' ')[0]?.toLowerCase() ?? '';
    await page.locator('body').press('/');
    const field = page.getByRole('combobox', { name: 'Поиск по меню' });
    await expect(field).toBeFocused();
    await field.fill('абракадабра');
    await expect(page.getByRole('status').filter({ hasText: 'Ничего не нашли' })).toBeVisible();
    await field.fill(word);
    const list = page.getByRole('listbox', { name: 'Найдено в меню' });
    const options = list.getByRole('option');
    await expect(options.first()).toBeVisible();
    await expect(options.first().locator('mark')).toHaveCount(1);
    await expect(list.getByRole('group').first()).toHaveAttribute('aria-label', /^Сегодня · /);
    await field.press('ArrowDown');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await field.press('Enter');
    const details = page.getByRole('dialog');
    await expect(details).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(details).toHaveCount(0);
    await expect(field).toBeFocused();
    await field.press('Escape');
    await expect(field).toHaveCount(0);
    await expect.poll(names).toEqual(before);
  });
});
