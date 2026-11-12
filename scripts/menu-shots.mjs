/* global document, window */
// Screenshots of the menu page's states for reviewers (ТЗ этапа 4, фаза 4): each state is a short scripted action on
// `?menu=demo`; each window of the matrix gets a JPEG (≤ 1280 px wide) and a line in report.json (clipped boxes, console
// errors). Needs a served build: preview_start web-test (4173) or npm run preview.
//   node scripts/menu-shots.mjs [--url http://localhost:4173/] [--states base,dish-menu] [--windows laptop-1536,phone-390]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { WINDOWS, menuStates } from './lib/menu-states.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    out: {
      type: 'string',
      default: path.join(ROOT, '..', 'refectorio-workspace', 'reports', 'stage-4', 'menu-shots'),
    },
    states: { type: 'string', default: 'base' },
    windows: { type: 'string', default: 'laptop-1536' },
    query: { type: 'string', default: '?menu=demo' },
  },
});

const STATES = menuStates(args.out);

/** Runs in the page: elements cut by the window or by an ancestor that clips. */
function clipped() {
  const out = [];
  const { innerWidth: w, innerHeight: h } = window;
  for (const el of document.querySelectorAll(
    '.popover, .menu-item, .dish-card, .menu-pill, .widget, .dish-details, [role="dialog"]',
  )) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    // Cards in a row that scrolls sideways are meant to run past the edge.
    const row = el.closest('.dish-row');
    if (row && row.scrollWidth > row.clientWidth) continue;
    if (box.left < -0.5 || box.top < -0.5 || box.right > w + 0.5 || box.bottom > h + 0.5)
      out.push({
        el: el.className.toString().slice(0, 40),
        box: [box.left, box.top, box.right, box.bottom].map(Math.round),
      });
  }
  return out.slice(0, 12);
}

await mkdir(args.out, { recursive: true });
const browser = await chromium.launch();
const report = [];
const wanted = new Set(args.windows.split(','));
for (const [name, width, height, touch] of WINDOWS.filter(([n]) => wanted.has(n))) {
  for (const state of args.states.split(',')) {
    const run = STATES[state];
    if (!run) throw new Error(`unknown state ${state}`);
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      hasTouch: touch,
      isMobile: touch && width < 768,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text().slice(0, 160));
    });
    await page.goto(new URL(`${args.query}#menu`, args.url).href);
    await page.getByRole('heading', { name: 'Моё меню на неделю:' }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(400);
    let failed = null;
    try {
      await run(page, touch);
    } catch (error) {
      failed = String(error).slice(0, 200);
    }
    await page.waitForTimeout(350);
    const shot = await page.screenshot();
    const file = `${state}--${name}.jpg`;
    await sharp(shot)
      .resize({ width: Math.min(1280, width), withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(path.join(args.out, file));
    report.push({
      state,
      window: name,
      file,
      failed,
      errors,
      clipped: await page.evaluate(clipped),
    });
    await context.close();
  }
}
await browser.close();
await writeFile(path.join(args.out, 'report.json'), JSON.stringify(report, null, 1));
console.log(
  report
    .map(
      (r) =>
        `${r.state} ${r.window}: ${r.failed ? 'FAILED ' + r.failed : 'ok'} · errors ${String(r.errors.length)} · clipped ${String(r.clipped.length)}`,
    )
    .join('\n'),
);
