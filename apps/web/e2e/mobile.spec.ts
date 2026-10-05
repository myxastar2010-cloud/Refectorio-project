import { expect, test } from '@playwright/test';
import { seriousViolations, settled, swipe } from './helpers';

test.skip(({ isMobile }) => !isMobile, 'phone gestures');

test('a short swipe opens part 2, another one returns', async ({ page }) => {
  await page.goto('./?seed=1');
  await settled(page, 'hero');
  const { width, height } = page.viewportSize() ?? { width: 390, height: 844 };
  // 30 px is enough (it switches while the finger is still moving).
  await swipe(
    page,
    { x: width / 2, y: height * 0.5 },
    { x: width / 2, y: height * 0.5 - 30 },
    '.hero-title',
  );
  await settled(page, 'about');
  await swipe(
    page,
    { x: width / 2, y: height * 0.4 },
    { x: width / 2, y: height * 0.4 + 30 },
    '.about-title',
  );
  await settled(page, 'hero');
});

test('phones: no feature cards, and both parts fit one screen', async ({ page }) => {
  await page.goto('./?seed=1');
  await settled(page, 'hero');
  await expect(page.locator('.features')).toBeHidden();
  const fits = (selector: string) =>
    page.locator(selector).evaluate((element) => element.scrollHeight <= element.clientHeight + 1);
  expect(await fits('.scene--hero')).toBe(true);
  await page.getByRole('button', { name: 'О проекте', exact: true }).click();
  await settled(page, 'about');
  expect(await fits('.about-scroller')).toBe(true);
});

test('the team card is the tall phone card, centred on the screen', async ({ page }) => {
  await page.goto('./?seed=1#about');
  await settled(page, 'about');
  await page.getByRole('button', { name: /Ещё о команде/ }).click();
  const dialog = page.locator('.team-dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.width).toBeCloseTo(viewport.width - 32, 0);
  expect(box.height / box.width).toBeCloseTo(1521 / 958, 2);
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThan(viewport.height);
  // Every member is inside the card.
  const members = await page
    .locator('.dialog-member')
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON() as DOMRect));
  for (const member of members) {
    expect(member.left).toBeGreaterThanOrEqual(box.x);
    expect(member.right).toBeLessThanOrEqual(box.x + box.width);
    expect(member.bottom).toBeLessThanOrEqual(box.y + box.height);
  }
  expect(await seriousViolations(page)).toEqual([]);
});

for (const hash of ['', '#about']) {
  test(`no serious accessibility violations on a phone${hash ? ' in part 2' : ' in part 1'}`, async ({
    page,
  }) => {
    await page.goto(`./?seed=1&freeze=1${hash}`);
    await settled(page, hash ? 'about' : 'hero');
    expect(await seriousViolations(page)).toEqual([]);
  });
}
