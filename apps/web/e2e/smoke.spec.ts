import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('page renders in Nunito without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./');
  await expect(page).toHaveTitle(/Refectorio/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // `document.fonts.ready` can be an already-resolved promise from before layout requested the font,
  // so ask for the exact faces the page needs (Cyrillic + Latin, Black) and check they really load.
  const loadedFaces = await page.evaluate(async () => {
    const faces = await document.fonts.load('900 16px "Nunito Variable"', 'Питаться Refectorio');
    return faces.filter((face) => face.status === 'loaded').length;
  });
  expect(loadedFaces).toBeGreaterThan(0);
  const headingFont = await page
    .getByRole('heading', { level: 1 })
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(headingFont).toContain('Nunito Variable');
  expect(errors).toEqual([]);
});

test('has no serious accessibility violations', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Contrast is only meaningful once entrance animations (WAAPI) have settled.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(serious.map((violation) => violation.id)).toEqual([]);
});
