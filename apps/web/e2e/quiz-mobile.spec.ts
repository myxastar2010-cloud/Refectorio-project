import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './helpers';
import { currentDish, draft, inQuiz, onScreen, playDishes, TEN_DECISIVE } from './quiz-helpers';

test.skip(({ isMobile }) => !isMobile, 'phones only; desktop paths are in quiz.spec.ts');

async function openQuiz(page: Page) {
  await page.goto('./?seed=11#quiz');
  await inQuiz(page);
  await onScreen(page, 'taste', 'Выберите блюдо');
}

async function seriousOnQuiz(page: Page) {
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

test('the dish game fits the phone screen, and a swipe answers', async ({ page }) => {
  const errors = collectErrors(page);
  await openQuiz(page);
  const viewport = page.viewportSize();
  const controls = await page.locator('.quiz-game-controls').boundingBox();
  expect(viewport).not.toBeNull();
  expect(controls).not.toBeNull();
  if (!viewport || !controls) return;
  expect(controls.y + controls.height).toBeLessThanOrEqual(viewport.height);
  for (const target of ['Не нравится', 'Пропустить', 'Нравится']) {
    const box = await page.getByRole('button', { name: target, exact: true }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  // A swipe to the right: the card follows the finger and flies off — «Нравится».
  const card = await page.locator('.quiz-card').boundingBox();
  if (!card) throw new Error('no card');
  const dish = await currentDish(page).textContent();
  const y = card.y + card.height / 2;
  await page.mouse.move(card.x + card.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width * 1.25, y, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await draft(page))?.answers.tasteDecisions[0]?.answer)
    .toBe('like');
  await expect(currentDish(page)).not.toHaveText(dish ?? '');
  // A short drag springs back: no answer.
  const again = await page.locator('.quiz-card:not([aria-hidden])').boundingBox();
  if (!again) throw new Error('no next card');
  await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
  await page.mouse.down();
  await page.mouse.move(again.x + again.width / 2 + 30, again.y + again.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.quiz-card')).toHaveCount(1);
  expect((await draft(page))?.answers.tasteDecisions).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('a swipe down opens the dish info, which fits the card; a swipe up closes it (§5)', async ({
  page,
}) => {
  await openQuiz(page);
  const card = page.locator('.quiz-card:not([aria-hidden])');
  const toggle = card.getByRole('button', { name: 'Подробнее о блюде' });
  const swipe = async (dy: number) => {
    const box = await card.boundingBox();
    if (!box) throw new Error('no card');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy * box.height, {
      steps: 6,
    });
    await page.mouse.up();
  };
  await swipe(0.3);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const fits = await card
    .locator('.quiz-card-info')
    .evaluate((info) => info.scrollHeight <= info.clientHeight + 1);
  expect(fits).toBe(true);
  await swipe(-0.3);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await draft(page))?.answers.tasteDecisions ?? []).toHaveLength(0);
});

test('a row opens a bottom sheet with the wheel', async ({ page }) => {
  await openQuiz(page);
  await playDishes(page, TEN_DECISIVE);
  await onScreen(page, 'body', 'О вас');
  await page.getByRole('button', { name: /^Возраст/ }).click();
  const sheet = page.locator('.quiz-picker--sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('spinbutton')).toBeFocused();
  const viewport = page.viewportSize();
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox();
      return box && viewport ? Math.round(box.y + box.height) : null;
    })
    .toBe(viewport?.height);
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await draft(page))?.answers.ageYears).toBe(30);
});

test('no serious accessibility violations on a phone: the game and «О вас»', async ({ page }) => {
  await openQuiz(page);
  expect(await seriousOnQuiz(page)).toEqual([]);
  await playDishes(page, TEN_DECISIVE);
  await onScreen(page, 'body');
  expect(await seriousOnQuiz(page)).toEqual([]);
});

test('a landscape phone keeps the card and the buttons on one screen; the wheel sheet fits', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 734, height: 343 });
  await openQuiz(page);
  const card = await page.locator('.quiz-card-stage').boundingBox();
  const like = await page.getByRole('button', { name: 'Нравится', exact: true }).boundingBox();
  if (!card || !like) throw new Error('no card or buttons');
  expect(card.y + card.height).toBeLessThanOrEqual(343);
  expect(like.y + like.height).toBeLessThanOrEqual(343);
  // The buttons stand beside the card, not under it.
  expect(like.x).toBeGreaterThan(card.x + card.width);
  await playDishes(page, TEN_DECISIVE);
  await onScreen(page, 'body', 'О вас');
  await page.getByRole('button', { name: /^Возраст/ }).click();
  const sheet = page.locator('.quiz-picker');
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('button', { name: 'Закрыть' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Готово' })).toBeInViewport({ ratio: 1 });
  expect(errors).toEqual([]);
});
