import { expect, test } from '@playwright/test';
import { scene, settled } from './helpers';

// The screens under the landing (#discover): segments + mini test, progress and goals, key functions, Kiki.

test.describe('discover', () => {
  test('the wheel leads from the landing down to it, then to «О проекте»; Back returns', async ({
    page,
  }) => {
    await page.goto('./?seed=1');
    await settled(page, 'hero');
    await page.keyboard.press('ArrowDown');
    await settled(page, 'discover');
    await expect(page).toHaveURL(/#discover$/);
    await page.keyboard.press('End');
    await settled(page, 'about');
    await page.goBack();
    await settled(page, 'discover');
    await page.getByRole('button', { name: 'На главную', exact: true }).click();
    await settled(page, 'hero');
  });

  test('a direct visit opens it at once and shows its blocks', async ({ page }) => {
    await page.goto('./?seed=1#discover');
    await expect(scene(page)).toHaveAttribute('data-scene', 'discover');
    await expect(page.getByRole('heading', { name: /Два способа вкусно питаться/ })).toBeVisible();
    await expect(page.locator('.scene--hero')).toHaveAttribute('aria-hidden', 'true');
  });

  test('the mini test names the type and can be restarted', async ({ page }) => {
    await page.goto('./?seed=1#discover');
    const quiz = page.locator('.dsc-quiz');
    await quiz.scrollIntoViewIfNeeded();
    for (let step = 0; step < 5; step += 1) {
      await quiz.locator('.dsc-answer[data-kind="rush"]').click();
    }
    await expect(quiz.getByRole('heading', { name: 'Вы — Торопыжка' })).toBeVisible();
    await quiz.getByRole('button', { name: 'Пройти заново' }).click();
    await expect(quiz.locator('.dsc-answer')).toHaveCount(2);
  });

  test('goals switch the example chart', async ({ page }) => {
    await page.goto('./?seed=1#discover');
    const tab = page.getByRole('tab', { name: 'Набрать массу' });
    await tab.scrollIntoViewIfNeeded();
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.dsc-stats')).toContainText('70');
  });

  test('Kiki changes with what she eats and starts over', async ({ page }) => {
    await page.goto('./?seed=1#discover');
    const stage = page.locator('.dsc-stage');
    await stage.scrollIntoViewIfNeeded();
    await expect(stage).toHaveAttribute('data-mood', 'good');
    for (const food of ['Бургер', 'Сладкая газировка', 'Чипсы']) {
      await stage.getByRole('button', { name: new RegExp(food) }).click();
    }
    await expect(stage).toHaveAttribute('data-mood', 'sad');
    await stage.getByRole('button', { name: 'Начать сначала' }).click();
    await expect(stage).toHaveAttribute('data-mood', 'good');
  });
});
