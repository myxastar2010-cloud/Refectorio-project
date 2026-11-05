import { expect, test } from '@playwright/test';
import { scene, settled } from './helpers';

// The screens under the landing (#discover), top to bottom: key functions, Kiki, who ПроЛанч is for with the 30-second test.

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

  test('a direct visit opens it at once, with the key functions on top and Kiki after them', async ({
    page,
  }) => {
    await page.goto('./?seed=1#discover');
    await expect(scene(page)).toHaveAttribute('data-scene', 'discover');
    await expect(page.getByRole('heading', { name: /Всё, чтобы вкусно питаться/ })).toBeVisible();
    await expect(page.locator('.scene--hero')).toHaveAttribute('aria-hidden', 'true');
    const order = await page
      .locator('.dsc-main > section')
      .evaluateAll((sections) => sections.map((section) => section.id));
    expect(order).toEqual(['dsc-features', 'dsc-kiki', 'dsc-segments', '']);
    // The «progress and goals» block is gone: Kiki is the centre of the product.
    await expect(page.getByRole('heading', { name: /Видно, как вы идёте к цели/ })).toHaveCount(0);
  });

  test('the 30-second test names the type and can be restarted', async ({ page }) => {
    await page.goto('./?seed=1#discover');
    const plaque = page.locator('.dsc-plaque');
    await plaque.scrollIntoViewIfNeeded();
    await expect(plaque.getByText('30', { exact: true })).toBeVisible();
    await plaque.getByRole('button', { name: 'Начать тест' }).click();
    for (let step = 0; step < 5; step += 1) {
      await plaque.locator('.dsc-answer[data-kind="timesaver"]').click();
    }
    await expect(plaque.getByRole('heading', { name: 'Вы — ценитель времени' })).toBeVisible();
    await plaque.getByRole('button', { name: 'Пройти заново' }).click();
    await expect(plaque.locator('.dsc-answer')).toHaveCount(2);
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

  test('her mood in the introduction follows the action the person picks', async ({ page }) => {
    await page.goto('./?seed=1#discover');
    const intro = page.locator('.dsc-head--kiki');
    await intro.scrollIntoViewIfNeeded();
    await intro.getByRole('button', { name: /Устала/ }).click();
    await expect(intro).toHaveAttribute('data-mood', 'tired');
    await expect(intro.getByRole('button', { name: /Устала/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the food is blurred and moves on these screens, as in «О проекте»', async ({ page }) => {
    await page.goto('./#discover');
    await expect(scene(page)).toHaveAttribute('data-scene', 'discover');
    const sharp = page.locator('.food-plane:first-child .food-item').first();
    const blurred = page.locator('.food-plane:nth-child(2) .food-item').first();
    await expect(sharp).toHaveCSS('opacity', '0');
    await expect(blurred).not.toHaveCSS('opacity', '0');
    const before = await blurred.evaluate((node) => (node as HTMLElement).style.transform);
    await expect
      .poll(() => blurred.evaluate((node) => (node as HTMLElement).style.transform), {
        timeout: 8000,
      })
      .not.toBe(before);
  });
});
