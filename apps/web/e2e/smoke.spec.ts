import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers';

test('the page loads in every browser without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await expect(page).toHaveTitle(/ПроЛанч/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.food-item').first()).toBeAttached();
  expect(errors).toEqual([]);
});
