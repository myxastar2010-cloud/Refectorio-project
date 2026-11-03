import { expect, test } from '@playwright/test';

// ТЗ этапа 4, фаза 3 §9: the finale starts the menu generation in the worker as soon as it mounts.
test('the finale generates the menu off the main thread', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?seed=11&step=finale&demo&debug=menu#quiz');
  const panel = page.locator('[data-menu-status]');
  await expect(panel).toHaveAttribute('data-menu-status', 'ready', { timeout: 30_000 });
  const summary = JSON.parse((await panel.locator('pre').textContent()) ?? '{}') as {
    days?: number;
    ms?: number;
    firstDay?: { meals?: Record<string, unknown[]> };
  };
  expect(summary.days ?? 0).toBeGreaterThanOrEqual(8);
  expect(summary.days ?? 0).toBeLessThanOrEqual(14);
  // ≤ 1.5 s on the team laptop (ТЗ §5.3); CI machines vary, so the e2e only guards against regressions.
  expect(summary.ms ?? Infinity).toBeLessThan(6000);
  for (const items of Object.values(summary.firstDay?.meals ?? {}))
    expect(items.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
