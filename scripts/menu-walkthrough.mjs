// A recorded walkthrough of the menu for the team (ТЗ фаза 4 §16): desktop and phone videos of the demo plan — a
// dish's details and tabs, a replacement, search, the ⋯ menus, the goal, news from Kiki, the account and a widget.
// Needs a served build: preview_start web-test (4173) or npm run preview.
//   node scripts/menu-walkthrough.mjs [--url http://localhost:4173/] [--out <dir>]
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    out: {
      type: 'string',
      default: path.join(ROOT, '..', 'refectorio-workspace', 'reports', 'stage-4', 'videos'),
    },
  },
});

const pause = (page, ms = 900) => page.waitForTimeout(ms);

async function walk(page, phone) {
  await page.goto(new URL('?menu=demo#menu', args.url).href);
  await page.getByRole('heading', { name: 'Моё меню на неделю:' }).waitFor({ timeout: 30_000 });
  await pause(page, 1500);
  // Mark a dish eaten, add a glass of water.
  await page
    .getByRole('button', { name: /^Отметить «.+» съеденным$/ })
    .first()
    .click();
  await pause(page);
  await page.getByRole('button', { name: /Выпит ещё стакан воды/ }).click();
  await pause(page);
  // Another meal and another day.
  await page.getByRole('tab').nth(1).click();
  await pause(page);
  await page.getByRole('tab').first().click();
  await pause(page);
  // A dish in detail: its tabs.
  await page.locator('.dish-row .dish-open').first().click();
  await pause(page, 1200);
  for (const tab of ['КБЖУ', 'Состав', 'Витамины и минералы', 'Аллергены']) {
    await page.getByRole('tab', { name: tab }).click();
    await pause(page, 1100);
  }
  await page.keyboard.press('Escape');
  await pause(page);
  // The dish's ⋯ → «Заменить с ИИ» → the engine's choices.
  await page.locator('.dish-card').first().locator('.dish-more').click();
  await page.getByRole('menuitem', { name: 'Заменить блюдо' }).click();
  await pause(page, 600);
  await page.getByRole('menuitem', { name: 'Заменить с ИИ' }).click();
  await page.locator('.replace-option:not(.replace-option--ghost)').first().waitFor();
  await pause(page, 1500);
  await page.keyboard.press('Escape');
  await pause(page);
  // Search.
  const name = (await page.locator('.dish-row .dish-open').first().textContent()) ?? '';
  await page.getByRole('button', { name: 'Поиск по меню' }).click();
  await page.getByRole('combobox').pressSequentially(name.split(' ')[0] ?? '', { delay: 90 });
  await pause(page, 1500);
  await page.getByRole('combobox').press('Escape');
  await pause(page);
  // News from Kiki.
  await page.getByRole('button', { name: /^Новости от Кики/ }).click();
  await pause(page, 1200);
  await page.locator('.news-item').first().click();
  await pause(page, 1800);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await pause(page);
  // The top ⋯ → downloads; the goal sheet.
  await page.locator('.menu-top').getByRole('button', { name: 'Ещё' }).click();
  const download = page.getByRole('menuitem', { name: 'Скачать меню' });
  if (phone) await download.click();
  else await download.hover();
  await pause(page, 1500);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await pause(page);
  await page.getByRole('button', { name: /^Цель:/ }).click();
  await pause(page, 2000);
  await page.keyboard.press('Escape');
  await pause(page);
  // The account menu.
  await page.getByRole('button', { name: 'Аккаунт' }).first().click();
  await pause(page, 1500);
  await page.keyboard.press('Escape');
  await pause(page, 1200);
}

await mkdir(args.out, { recursive: true });
const browser = await chromium.launch();
for (const [name, viewport, phone] of [
  ['menu-desktop', { width: 1536, height: 730 }, false],
  ['menu-phone', { width: 390, height: 844 }, true],
]) {
  const context = await browser.newContext({
    viewport,
    hasTouch: phone,
    isMobile: phone,
    recordVideo: { dir: args.out, size: viewport },
  });
  const page = await context.newPage();
  try {
    await walk(page, phone);
  } catch (error) {
    console.log(`${name}: stopped — ${String(error).slice(0, 160)}`);
  }
  const video = page.video();
  await context.close();
  if (video) {
    const file = path.join(args.out, `${name}.webm`);
    await rename(await video.path(), file);
    console.log(`${name}: ${file}`);
  }
}
await browser.close();
