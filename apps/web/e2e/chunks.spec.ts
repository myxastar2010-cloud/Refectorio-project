import { expect, test } from '@playwright/test';
import { scene, settled } from './helpers';

// A lazy chunk that does not arrive (offline, or a deploy replaced the hashed files while the tab was open) never
// leaves an empty scene or an endless story (stage-5 code audit, P1 raised to P0; D-129).

test.describe('chunk failures', () => {
  test('the screens under the landing: back to the landing with a note, no reload', async ({
    page,
  }) => {
    await page.route('**/assets/discover-*.js', (route) => route.abort());
    await page.goto('./?seed=1');
    await settled(page, 'hero');
    // The same build is still served: the failure is the network's, so the page must not reload (D-129).
    await page.evaluate(() => {
      (window as unknown as { stayed?: boolean }).stayed = true;
    });
    await page.keyboard.press('ArrowDown');
    await expect(page.getByText('Не получилось открыть. Проверьте интернет')).toBeVisible({
      timeout: 15_000,
    });
    await expect(scene(page)).toHaveAttribute('data-scene', 'hero');
    expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(
      true,
    );
  });

  test('the finale without its story chunk still uncovers the menu', async ({ page }) => {
    await page.route(/\/assets\/story(-data)?-[\w-]+\.js$/, (route) => route.abort());
    await page.goto('./?seed=11&step=finale#quiz');
    await expect(page.getByRole('heading', { name: 'Моё меню на неделю:' })).toBeVisible({
      timeout: 30_000,
    });
  });
});
