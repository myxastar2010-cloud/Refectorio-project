/* global document */
// A recording of Kiki's behaviour anchors 1–6 and 9 with the live model (ТЗ 07 §14, Merge C): the demo menu, a real
// conversation through the local API (npm run dev:api, port 8787) and a served build whose /api is proxied there
// (npm run preview:test, or any preview with the /api proxy). Each anchor starts from an empty chat; proposals are
// opened and applied, so the video shows the previews too. Writes a .webm per window and anchors.json (answers, times).
//   node scripts/kiki-anchors.mjs [--url http://localhost:4174/] [--windows laptop,phone] [--only 1,2]
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4174/' },
    out: {
      type: 'string',
      default: path.join(ROOT, '..', 'refectorio-workspace', 'reports', 'stage-4', 'videos'),
    },
    windows: { type: 'string', default: 'laptop' },
    only: { type: 'string', default: '' },
  },
});

/** The user's anchors (07 §1): each is a short conversation. */
const ANCHORS = [
  { n: 1, turns: ['Сколько будет 3+64?'] },
  { n: 2, turns: ['Хочу, чтобы все ужины каждый день были минимум с 20 г белка'] },
  { n: 3, turns: ['Забыл указать: у меня аллергия на чеснок', 'ещё я не люблю пшёнку'] },
  { n: 4, turns: ['Каждый завтрак — яйца', 'тогда только в понедельник и среду'] },
  { n: 5, turns: ['Как скачать меню?', 'Спасибо!'] },
  { n: 6, turns: ['Сколько калорий в блинах?'] },
  {
    n: 9,
    turns: [
      'Решила не худеть, а поддерживать вес',
      'меньше зелени, кофе замени на чай, и как посмотреть рецепты?',
    ],
  },
];
const WINDOWS = { laptop: [1536, 730, false], phone: [390, 844, true] };
const ANSWER_TIMEOUT_MS = 150_000;

const wanted = new Set(args.only ? args.only.split(',').map(Number) : ANCHORS.map((a) => a.n));
await mkdir(args.out, { recursive: true });
const browser = await chromium.launch();
const log = [];

for (const name of args.windows.split(',')) {
  const [width, height, touch] = WINDOWS[name];
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    hasTouch: touch,
    isMobile: touch,
    recordVideo: { dir: args.out, size: { width, height } },
  });
  const page = await context.newPage();
  await page.goto(new URL('?menu=demo#menu', args.url).href);
  await page.getByRole('heading', { name: 'Моё меню на неделю:' }).waitFor({ timeout: 30_000 });
  const panel = page.locator('.kiki-panel');
  if (touch) await page.getByRole('button', { name: 'Открыть Кики' }).last().click();
  const box = panel.getByRole('textbox', { name: 'Спроси что угодно…' });

  for (const anchor of ANCHORS.filter((a) => wanted.has(a.n))) {
    // A fresh conversation per anchor: ⋯ → «Очистить переписку».
    if ((await panel.locator('.kiki-msg').count()) > 0) {
      await panel.getByRole('button', { name: 'Ещё о переписке' }).click();
      await panel.getByRole('menuitem', { name: 'Очистить переписку' }).click();
      await panel.getByRole('menuitem', { name: 'Очистить', exact: true }).click();
    }
    for (const text of anchor.turns) {
      const before = await panel.locator('.kiki-msg--kiki, .kiki-msg--error').count();
      await box.click();
      await box.pressSequentially(text, { delay: 25 });
      const started = Date.now();
      await box.press('Enter');
      await panel
        .locator('.kiki-msg--kiki, .kiki-msg--error')
        .nth(before)
        .waitFor({ timeout: ANSWER_TIMEOUT_MS });
      await page.waitForFunction(() => !document.querySelector('.kiki-msg--live'), null, {
        timeout: ANSWER_TIMEOUT_MS,
      });
      const answer =
        (await panel.locator('.kiki-msg--kiki, .kiki-msg--error').last().innerText()) ?? '';
      const cards = await panel.locator('.kiki-msg').last().locator('.kiki-card').count();
      log.push({
        window: name,
        anchor: anchor.n,
        user: text,
        answer,
        cards,
        ms: Date.now() - started,
      });
      await page.waitForTimeout(1800);
      // Show the newest proposal and apply it (the menu changes behind).
      const card = panel.locator('.kiki-msg').last().locator('.kiki-card').last();
      if (cards > 0) {
        await card.click();
        const preview = page.getByRole('dialog', { name: 'Предпросмотр изменений' });
        await preview.waitFor();
        await page.waitForTimeout(2500);
        await preview.locator('.kiki-preview-body').evaluate((el) => {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
        await page.waitForTimeout(1500);
        await preview.getByRole('button', { name: 'Применить' }).click();
        await page.waitForTimeout(1800);
      }
    }
  }
  await page.waitForTimeout(1000);
  const video = page.video();
  await context.close();
  if (video) await rename(await video.path(), path.join(args.out, `kiki-anchors-${name}.webm`));
}
await browser.close();
await writeFile(path.join(args.out, 'kiki-anchors.json'), `${JSON.stringify(log, null, 2)}\n`);
for (const r of log)
  console.log(
    `${r.window} #${String(r.anchor)} ${(r.ms / 1000).toFixed(1)} s ${r.cards ? '[карточка] ' : ''}${r.answer.replace(/\s+/g, ' ').slice(0, 110)}`,
  );
