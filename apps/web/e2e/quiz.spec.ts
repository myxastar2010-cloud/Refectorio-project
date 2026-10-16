import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, settled } from './helpers';
import {
  choose,
  currentDish,
  draft,
  inQuiz,
  onScreen,
  playDishes,
  quiz,
  setRow,
  TEN_DECISIVE,
} from './quiz-helpers';

test.skip(({ isMobile }) => isMobile, 'desktop paths; phones are covered in quiz-mobile.spec.ts');

/** The landing → «Создать меню» → the quiz, with a reproducible dish game. */
async function openQuiz(page: Page, query = 'seed=11') {
  await page.goto(`./?${query}`);
  await settled(page, 'hero');
  await page.getByRole('link', { name: 'Создать меню' }).click();
  await inQuiz(page);
  await onScreen(page, 'taste', 'Выберите блюдо');
}

/** The game, «О вас» (a 35-year-old woman, 165 cm) and the goal; ends on the food preferences. */
async function throughGoal(
  page: Page,
  goal: 'Поддержка веса' | 'Сжигание жира' = 'Поддержка веса',
) {
  await playDishes(page, TEN_DECISIVE);
  await onScreen(page, 'body', 'О вас');
  await page.getByRole('button', { name: /^Пол/ }).click();
  await page.getByRole('radio', { name: 'Женский' }).click();
  await setRow(page, 'Возраст', 5);
  await setRow(page, 'Рост', 5);
  await page.getByRole('button', { name: 'Далее' }).click();
  await onScreen(page, 'goal');
  await choose(page, goal, 'goalSetup');
  await setRow(page, 'Текущий вес', 10);
  if (goal === 'Сжигание жира') await setRow(page, 'Целевой вес', -3);
  await page.getByRole('button', { name: 'Далее' }).click();
  await onScreen(page, 'foodStyle');
}

/** Waits for the finite animations only (the finale's shimmer and core pulse never end). */
async function axeSerious(page: Page) {
  // Panels morph on motion values (not in document.getAnimations()): their content is fully shown first.
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLElement>('.quiz-add-content, .quiz-picker-content')].every(
      (element) => getComputedStyle(element).opacity === '1',
    ),
  );
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
  const { violations } = await new AxeBuilder({ page }).include('section.quiz').analyze();
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    );
}

test.describe('entering and leaving', () => {
  test('«Создать меню» opens the quiz; «Выйти» returns, and Back does not re-enter it', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openQuiz(page);
    await expect(page).toHaveURL(/#quiz$/);
    await expect(page.locator('#quiz-step-title')).toBeFocused();
    await expect(page.locator('main.scenes')).toHaveAttribute('inert', '');
    await playDishes(page, ['d', 's', 'a']);
    await page.getByRole('button', { name: 'Выйти из теста' }).click();
    await settled(page, 'hero');
    await expect(page).not.toHaveURL(/#quiz/);
    // The quiz's entries were rewound: Back leaves the landing (here — to the blank page the test started from).
    await page.goBack();
    await expect(page).not.toHaveURL(/#quiz/);
    expect(errors).toEqual([]);
  });

  test('a direct visit to #quiz opens the quiz at once and resumes the draft', async ({ page }) => {
    await page.goto('./#quiz');
    await inQuiz(page);
    await playDishes(page, ['d', 'a', 's']);
    const answered = (await draft(page))?.answers.tasteDecisions.length;
    expect(answered).toBe(3);
    await page.reload();
    await inQuiz(page);
    await expect(
      page.getByRole('status').filter({ hasText: 'Продолжаем с вопроса 1' }),
    ).toBeVisible();
    expect((await draft(page))?.answers.tasteDecisions.length).toBe(3);
    await page.getByRole('button', { name: 'Начать заново' }).click();
    await expect.poll(async () => (await draft(page))?.answers.tasteDecisions.length).toBe(0);
    await onScreen(page, 'taste');
  });

  test('«Выйти» from a quiz opened directly keeps the answers; keys answer only inside the step', async ({
    page,
  }) => {
    await page.goto('./?seed=11#quiz');
    await inQuiz(page);
    await playDishes(page, ['d', 'a', 's']);
    // With «Выйти» in focus a letter is not an answer (WCAG 2.1.4).
    const exit = page.getByRole('button', { name: 'Выйти из теста' });
    await exit.focus();
    await page.keyboard.press('KeyD');
    await page.waitForTimeout(400);
    expect((await draft(page))?.answers.tasteDecisions.length).toBe(3);
    await exit.click();
    await settled(page, 'hero');
    // Leaving rewinds the browser history, never the answers.
    expect((await draft(page))?.answers.tasteDecisions.length).toBe(3);
  });

  test('opening #quiz again from inside the quiz keeps it open', async ({ page }) => {
    await openQuiz(page);
    await page.evaluate(() => {
      window.location.hash = '#quiz';
    });
    await page.goto('./?seed=11#quiz');
    await inQuiz(page);
    await onScreen(page, 'taste');
  });
});

test.describe('the dish game', () => {
  test('keys answer, skips do not count, ten decisive answers move on', async ({ page }) => {
    await openQuiz(page);
    const first = await currentDish(page).textContent();
    await playDishes(page, ['s', 's']);
    expect((await draft(page))?.answers.tasteDecisions.map((d) => d.answer)).toEqual([
      'skip',
      'skip',
    ]);
    expect(await currentDish(page).textContent()).not.toBe(first);
    await playDishes(page, TEN_DECISIVE.slice(0, 9));
    await onScreen(page, 'taste');
    await playDishes(page, TEN_DECISIVE.slice(9));
    await onScreen(page, 'body', 'О вас');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Вопрос 2 из 11');
  });

  test('Back undoes the last answer — also from «О вас», where the last card comes back', async ({
    page,
  }) => {
    await openQuiz(page);
    await playDishes(page, TEN_DECISIVE);
    await onScreen(page, 'body');
    const decisions = (await draft(page))?.answers.tasteDecisions ?? [];
    await page.goBack();
    await onScreen(page, 'taste');
    await expect.poll(async () => (await draft(page))?.answers.tasteDecisions.length).toBe(9);
    const last = decisions.at(-1);
    expect(last).toBeDefined();
    await page.getByRole('button', { name: 'Вернуться', exact: true }).click();
    await expect.poll(async () => (await draft(page))?.answers.tasteDecisions.length).toBe(8);
  });

  test('the buttons answer too, with the dish announced for screen readers', async ({ page }) => {
    await openQuiz(page);
    const dish = (await currentDish(page).textContent()) ?? '';
    await page.getByRole('button', { name: 'Нравится', exact: true }).click();
    await expect(page.locator('section.quiz > p[role="status"]')).toContainText(
      `Нравится: ${dish}`,
    );
    // The next card first (a second answer within a blink is taken for a double tap).
    await expect(currentDish(page)).not.toHaveText(dish);
    await page.getByRole('button', { name: 'Пропустить' }).click();
    await expect.poll(async () => (await draft(page))?.answers.tasteDecisions.length).toBe(2);
    expect((await draft(page))?.answers.tasteDecisions.map((d) => d.answer)).toEqual([
      'like',
      'skip',
    ]);
  });
});

test.describe('the whole path', () => {
  test('to the finale: rows, options, chips with «+», text; the answers are saved', async ({
    page,
  }) => {
    // The longest paths through the quiz: ~13 screens with their transitions (slow in WebKit).
    test.slow();
    const errors = collectErrors(page);
    await openQuiz(page);
    await throughGoal(page);
    await choose(page, /Сбалансированное питание/, 'macroProfile');
    await choose(page, /Рекомендуется/, 'health');
    await choose(page, 'Нет', 'allergy');
    await choose(page, 'Да', 'allergens');
    // A typed allergy: kept verbatim and it ticks the chip its words name.
    await page.getByRole('button', { name: 'Добавить другое' }).click();
    await page.getByRole('textbox', { name: 'Добавить аллергию' }).fill('креветки');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Ракообразные', pressed: true })).toBeVisible();
    await expect(page.locator('.quiz-note', { hasText: 'Отметили: Ракообразные' })).toBeVisible();
    await expect(page.locator('.quiz-add')).toHaveCount(0);
    await page.getByRole('button', { name: 'Готово' }).click();
    await onScreen(page, 'dislikes');
    await choose(page, 'Да', 'dislikesText');
    await page.getByRole('textbox').fill('Оливки и печень');
    await page.getByRole('button', { name: 'Готово' }).click();
    await onScreen(page, 'activity');
    await choose(page, 'Я не занимаюсь спортом', 'lifestyle');
    await choose(page, 'В основном сидя', 'notes');
    await page.getByRole('button', { name: 'Готово' }).click();
    await onScreen(page, 'finale');
    await expect(page.locator('.quiz-caption-item')).toContainText('Анализируем ответы', {
      timeout: 15_000,
    });
    const result = await page.evaluate(() => localStorage.getItem('refectorio.quiz.result.v1'));
    expect(result).not.toBeNull();
    const saved = JSON.parse(result ?? '{}') as Record<string, unknown> & {
      allergies: { items: { code: string }[]; custom: string[] };
      dislikesText: string;
      taste: { decisions: unknown[] };
    };
    expect(saved.version).toBe(1);
    expect(saved.allergies.items.map((item) => item.code)).toEqual(['CRUSTACEAN']);
    expect(saved.allergies.custom).toEqual(['креветки']);
    expect(saved.dislikesText).toBe('Оливки и печень');
    expect(saved.taste.decisions).toHaveLength(10);
    // «Вернуться» is hidden in the finale; «Выйти» works.
    await expect(page.getByRole('button', { name: 'Вернуться', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Выйти из теста' }).click();
    await settled(page, 'hero');
    expect(errors).toEqual([]);
  });

  test('?debug=answers shows the validated JSON on the final screen', async ({ page }) => {
    // The longest paths through the quiz: ~13 screens with their transitions (slow in WebKit).
    test.slow();
    await openQuiz(page, 'seed=11&debug=answers');
    await throughGoal(page);
    await choose(page, /Сбалансированное питание/, 'macroProfile');
    await choose(page, /Рекомендуется/, 'health');
    await choose(page, 'Нет', 'allergy');
    await choose(page, 'Нет', 'dislikes');
    await choose(page, 'Нет', 'activity');
    await choose(page, 'Я не занимаюсь спортом', 'lifestyle');
    await choose(page, 'В основном сидя', 'notes');
    await page.getByRole('button', { name: 'Готово' }).click();
    await onScreen(page, 'finale');
    await expect(page.getByText('Ответы (проверенный JSON)')).toBeVisible();
    await expect(page.locator('.quiz-finale-debug pre')).toContainText('"version": 1');
  });

  test('the endless finale offers a fresh start and the privacy sheet after the honest line', async ({
    page,
  }) => {
    test.slow();
    await openQuiz(page);
    await throughGoal(page);
    await choose(page, /Сбалансированное питание/, 'macroProfile');
    await choose(page, /Рекомендуется/, 'health');
    await choose(page, 'Нет', 'allergy');
    await choose(page, 'Нет', 'dislikes');
    await choose(page, 'Нет', 'activity');
    await choose(page, 'Я не занимаюсь спортом', 'lifestyle');
    await choose(page, 'В основном сидя', 'notes');
    // The honest line comes after 40 s: the page clock runs them in a moment.
    await page.clock.install();
    await page.getByRole('button', { name: 'Готово' }).click();
    await onScreen(page, 'finale');
    await page.clock.runFor(45_000);
    // Once on screen and once in the status region (it is announced): the visible line.
    await expect(
      page.locator('.quiz-finale-after').getByText(/мы дорабатываем генерацию/),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Как мы используем ваши данные?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Пройти тест заново' }).click();
    await page.clock.runFor(5_000);
    await onScreen(page, 'taste', 'Выберите блюдо');
    await expect.poll(async () => (await draft(page))?.answers.tasteDecisions.length ?? 0).toBe(0);
  });
});

test.describe('the wheel', () => {
  test('typed digits add up, and «Готово» keeps the typed value without Enter', async ({
    page,
  }) => {
    await openQuiz(page);
    await playDishes(page, TEN_DECISIVE);
    await onScreen(page, 'body', 'О вас');
    await page.getByRole('button', { name: /^Возраст/ }).click();
    await expect(page.getByRole('spinbutton')).toBeFocused();
    await page.keyboard.type('35');
    await expect(page.locator('.quiz-wheel-input')).toHaveValue('35');
    await page.getByRole('button', { name: 'Готово' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Возраст/ })).toContainText('35');
  });
});

test.describe('safety', () => {
  test('a teenager: no weight goals, a kind line instead', async ({ page }) => {
    await openQuiz(page);
    await playDishes(page, TEN_DECISIVE);
    await page.getByRole('button', { name: /^Пол/ }).click();
    await page.getByRole('radio', { name: 'Мужской' }).click();
    await setRow(page, 'Возраст', -15);
    await setRow(page, 'Рост', 5);
    await page.getByRole('button', { name: 'Далее' }).click();
    await onScreen(page, 'goal');
    await expect(page.getByRole('radio', { name: 'Сжигание жира' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByRole('radio', { name: 'Набор мышечной массы' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByText('До 18 лет мы не ставим цели по весу')).toBeVisible();
  });

  test('a child: the adult confirms before «Далее»', async ({ page }) => {
    await openQuiz(page);
    await playDishes(page, TEN_DECISIVE);
    await page.getByRole('button', { name: /^Пол/ }).click();
    await page.getByRole('radio', { name: 'Женский' }).click();
    await setRow(page, 'Возраст', -20);
    await setRow(page, 'Рост', -20);
    await expect(page.getByRole('button', { name: 'Далее' })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Я взрослый и заполняю тест за ребёнка' }).check();
    await page.getByRole('button', { name: 'Далее' }).click();
    await onScreen(page, 'goal');
  });

  test('insulin-treated diabetes: a calm notice, then the doctor screen instead of the generation', async ({
    page,
  }) => {
    // The longest paths through the quiz: ~13 screens with their transitions (slow in WebKit).
    test.slow();
    await openQuiz(page);
    await throughGoal(page);
    await choose(page, /Сбалансированное питание/, 'macroProfile');
    await choose(page, /Рекомендуется/, 'health');
    await choose(page, 'Да', 'healthConditions');
    await page.getByRole('button', { name: 'Диабет', exact: true }).click();
    await page.getByRole('radio', { name: 'Да' }).click();
    await page.getByRole('button', { name: 'Готово' }).click();
    const notice = page.getByRole('alertdialog');
    await expect(notice).toContainText('вместе с врачом');
    await notice.getByRole('button', { name: 'Понятно' }).click();
    await onScreen(page, 'allergy');
    await choose(page, 'Нет', 'dislikes');
    await choose(page, 'Нет', 'activity');
    await choose(page, 'Я не занимаюсь спортом', 'lifestyle');
    await choose(page, 'В основном сидя', 'notes');
    await page.getByRole('button', { name: 'Готово' }).click();
    await onScreen(page, 'finale', 'Персональное меню — вместе с врачом');
    await page.getByRole('button', { name: 'Изменить ответы' }).click();
    await onScreen(page, 'healthConditions');
  });

  test('a weight-loss goal turns into maintenance at diabetes type 2, keto into «Рекомендуется»', async ({
    page,
  }) => {
    // The longest paths through the quiz: ~13 screens with their transitions (slow in WebKit).
    test.slow();
    await openQuiz(page);
    await throughGoal(page, 'Сжигание жира');
    await choose(page, /Сбалансированное питание/, 'macroProfile');
    // Keto asks for a confirmation first; «Выбрать другое» takes it back, «Понимаю, продолжить» goes on.
    await page.getByRole('radio', { name: 'Кето' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('водно-солевой баланс');
    await confirm.getByRole('button', { name: 'Выбрать другое' }).click();
    await expect(page.getByRole('radio', { name: 'Кето' })).not.toBeChecked();
    await page.getByRole('radio', { name: 'Кето' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Понимаю, продолжить' })
      .click();
    await onScreen(page, 'health');
    await choose(page, 'Да', 'healthConditions');
    await page.getByRole('button', { name: 'Диабет', exact: true }).click();
    await page.getByRole('radio', { name: 'Нет' }).click();
    await page.getByRole('button', { name: 'Готово' }).click();
    for (const text of [
      'цель по весу лучше ставить вместе с врачом',
      'кето без врача не подходит',
    ]) {
      const notice = page.getByRole('alertdialog');
      await expect(notice).toContainText(text);
      await notice.getByRole('button', { name: 'Понятно' }).click();
    }
    await onScreen(page, 'allergy');
    await expect(page.locator('#quiz-step-title')).toBeFocused();
    const answers = (await draft(page))?.answers;
    expect(answers?.goal).toBe('maintain');
    expect(answers?.macroProfile).toBe('recommended');
  });
});

test.describe('quality', () => {
  test('nothing leaves the site but the photos; no CSP violations', async ({ page }) => {
    const hosts = new Set<string>();
    page.on('request', (request) => hosts.add(new URL(request.url()).host));
    await page.addInitScript(() => {
      const w = window as Window & { __csp?: string[] };
      w.__csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        w.__csp?.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    await openQuiz(page);
    await playDishes(page, ['d', 'a', 'd', 's']);
    const own = new URL(page.url()).host;
    const foreign = [...hosts].filter((host) => host !== own && host !== 'images.unsplash.com');
    expect(foreign.filter((host) => !/kaspersky-labs\.com$/i.test(host))).toEqual([]);
    expect([...hosts]).not.toContain('api.unsplash.com');
    expect([...hosts]).not.toContain('api.pexels.com');
    expect(await page.evaluate(() => (window as Window & { __csp?: string[] }).__csp)).toEqual([]);
  });

  test('accessibility: the game, a picker, the chips with «+», a notice and the finale', async ({
    page,
  }) => {
    // The longest paths through the quiz: ~13 screens with their transitions (slow in WebKit).
    test.slow();
    await openQuiz(page, 'seed=11&demo');
    expect(await axeSerious(page)).toEqual([]);
    await playDishes(page, TEN_DECISIVE);
    await page.getByRole('button', { name: /^Возраст/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await axeSerious(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Пол/ }).click();
    await page.getByRole('radio', { name: 'Женский' }).click();
    await setRow(page, 'Возраст', 5);
    await setRow(page, 'Рост', 5);
    await page.getByRole('button', { name: 'Далее' }).click();
    await choose(page, 'Поддержка веса', 'goalSetup');
    await setRow(page, 'Текущий вес', 10);
    await page.getByRole('button', { name: 'Далее' }).click();
    await choose(page, /Сбалансированное питание/, 'macroProfile');
    await choose(page, /Рекомендуется/, 'health');
    await choose(page, 'Да', 'healthConditions');
    await page.getByRole('button', { name: 'Добавить другое' }).click();
    expect(await axeSerious(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: 'Расстройство пищевого поведения (сейчас или в прошлом)' })
      .click();
    await page.getByRole('button', { name: 'Готово' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    expect(await axeSerious(page)).toEqual([]);
  });

  test('reduced motion: the whole quiz works with short cross-fades', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openQuiz(page);
    await playDishes(page, TEN_DECISIVE);
    await onScreen(page, 'body');
    await expect(quiz(page)).toBeVisible();
  });
});
