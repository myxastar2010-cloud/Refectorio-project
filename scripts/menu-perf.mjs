/* global requestAnimationFrame, window */
// Menu responsiveness for the phase-4 gate: interaction latency (Event Timing, the INP basis) and frames / long tasks
// during the menu's own animations (marks first: they work on today, not on a future day), on the team laptop's viewport at 1× and at 4× CPU slowdown. Writes compact JSON.
// Needs the test build served: npm run build:test && npm run preview:test (apps/web), then
//   node scripts/menu-perf.mjs [--url http://localhost:4173/] [--out <file>]
import { writeFile } from 'node:fs/promises';
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
      default: path.join(
        ROOT,
        '..',
        'refectorio-workspace',
        'reports',
        'stage-4',
        'gate',
        'menu-perf.json',
      ),
    },
  },
});

function observe() {
  window.__perf = { events: [], long: [], frames: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.interactionId) window.__perf.events.push({ name: e.name, d: Math.round(e.duration) });
    }
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__perf.long.push(Math.round(e.duration));
  }).observe({ type: 'longtask' });
  let last = performance.now();
  const tick = (t) => {
    window.__perf.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function run(browser, rate) {
  const page = await browser.newPage({
    viewport: { width: 1536, height: 730 },
    deviceScaleFactor: 1.25,
  });
  page.setDefaultTimeout(6000);
  const cdp = await page.context().newCDPSession(page);
  await page.goto(`${args.url}?menu=demo#menu`);
  await page.getByRole('heading', { name: 'Моё меню на неделю:' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(observe);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const steps = [];
  const step = async (label, fn) => {
    const before = await page.evaluate(() => window.__perf.events.length);
    let error;
    try {
      await fn();
    } catch (e) {
      error = String(e.message).split(/\r?\n/)[0];
    }
    await page.waitForTimeout(900);
    const ev = await page.evaluate((n) => window.__perf.events.slice(n), before);
    steps.push({ label, maxMs: ev.reduce((m, e) => Math.max(m, e.d), 0), ...(error && { error }) });
  };
  const days = page.getByRole('tablist', { name: 'Дни недели' });
  await step('eaten mark', () =>
    page
      .getByRole('button', { name: /^Отметить «.+» съеденным$/ })
      .first()
      .click(),
  );
  await step('water', () => page.getByRole('button', { name: /Выпит ещё стакан воды/ }).click());
  await step('day tab', () => days.getByRole('tab').nth(2).click());
  await step('day tab 2', () => days.getByRole('tab').nth(4).click());
  await step('meal tab', () => page.locator('.meal-tabs .meal-tab').nth(1).click());
  await step('dish details open', () => page.locator('.dish-row .dish-open').first().click());
  await step('details close', () => page.keyboard.press('Escape'));
  await step('dish ⋯ menu', () => page.locator('.dish-card').nth(1).locator('.dish-more').click());
  await step('menu close', () => page.keyboard.press('Escape'));
  await step('search key', async () => {
    await page.keyboard.press('/');
    await page.keyboard.type('суп', { delay: 80 });
  });
  await step('search close', () => page.keyboard.press('Escape'));
  await step('next week key', () => days.getByRole('tab').first().press('PageDown'));
  const p = await page.evaluate(() => window.__perf);
  const frames = p.frames.filter((f) => f > 0);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();
  const sorted = [...p.events.map((e) => e.d)].sort((a, b) => a - b);
  return {
    rate,
    inpProxyMs: sorted.at(-1) ?? 0,
    p98Ms: sorted[Math.floor(sorted.length * 0.98)] ?? 0,
    interactions: p.events.length,
    longTasks: { count: p.long.length, maxMs: Math.max(0, ...p.long) },
    framesOver33ms: frames.filter((f) => f > 33.4).length,
    frames: frames.length,
    steps,
  };
}

const browser = await chromium.launch();
const out = { url: args.url, at: new Date().toISOString(), runs: [] };
for (const rate of [1, 4]) out.runs.push(await run(browser, rate));
await browser.close();
await writeFile(args.out, JSON.stringify(out, null, 1));
console.log(
  out.runs
    .map(
      (r) =>
        `×${r.rate}: INP≈${r.inpProxyMs} ms, long tasks ${r.longTasks.count} (max ${r.longTasks.maxMs}), slow frames ${r.framesOver33ms}/${r.frames}`,
    )
    .join('\n'),
);
