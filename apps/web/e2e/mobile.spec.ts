import { expect, test } from '@playwright/test';
import { seriousViolations, settled, swipe } from './helpers';

test.skip(({ isMobile }) => !isMobile, 'phone gestures');

test('swipe up opens part 2, swipe down returns (only from the top of its scroll)', async ({
  page,
}) => {
  await page.goto('./?seed=1');
  await settled(page, 'hero');
  const { width, height } = page.viewportSize() ?? { width: 390, height: 844 };
  await swipe(
    page,
    { x: width / 2, y: height * 0.45 },
    { x: width / 2, y: height * 0.2 },
    '.hero-title',
  );
  await settled(page, 'about');
  await swipe(
    page,
    { x: width / 2, y: height * 0.3 },
    { x: width / 2, y: height * 0.6 },
    '.about-title',
  );
  await settled(page, 'hero');
});

test('horizontal swipes inside the carousel do not switch scenes', async ({ page }) => {
  await page.goto('./?seed=1');
  await settled(page, 'hero');
  const box = await page.locator('.features').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await swipe(
    page,
    { x: box.x + box.width * 0.8, y: box.y + 40 },
    { x: box.x + 20, y: box.y - 60 },
    '.feature-card',
  );
  await page.waitForTimeout(300);
  await expect(page.locator('.page')).toHaveAttribute('data-scene', 'hero');
});

test('everything of part 1 fits on one screen, the dialog is a full-screen sheet', async ({
  page,
}) => {
  await page.goto('./?seed=1');
  const scroll = await page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0);
  expect(scroll).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
  const lastCard = await page.locator('.feature-card').first().boundingBox();
  expect((lastCard?.y ?? 0) + (lastCard?.height ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0,
  );
  await page.getByRole('button', { name: 'О проекте', exact: true }).click();
  await settled(page, 'about');
  await page.getByRole('button', { name: /Ещё о команде/ }).click();
  const dialog = page.locator('.team-dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.width).toBe(page.viewportSize()?.width);
  expect(await seriousViolations(page)).toEqual([]);
});
