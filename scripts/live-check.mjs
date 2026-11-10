/* global document, window */
// Live check after a merge gate: the published site on the team laptop and a phone — the landing and the demo menu
// load, console clean (errors and failed requests), one JPEG per size for a reviewer. Writes compact JSON.
//   node scripts/live-check.mjs [--url https://refectorio.onrender.com/] [--out <dir>]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'https://refectorio.onrender.com/' },
    out: {
      type: 'string',
      default: path.join(ROOT, '..', 'refectorio-workspace', 'reports', 'stage-4', 'live'),
    },
  },
});

const SIZES = [
  { name: 'laptop', viewport: { width: 1536, height: 730 }, deviceScaleFactor: 1.25 },
  {
    name: 'phone',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
];

await mkdir(args.out, { recursive: true });
const browser = await chromium.launch();
const result = { url: args.url, at: new Date().toISOString(), sizes: [] };
for (const { name, ...options } of SIZES) {
  const page = await browser.newPage(options);
  const problems = [];
  page.on(
    'console',
    (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 160)}`),
  );
  page.on('pageerror', (e) => problems.push(`page: ${String(e.message).slice(0, 160)}`));
  page.on('requestfailed', (r) =>
    problems.push(`request: ${r.url().slice(0, 120)} ${r.failure()?.errorText ?? ''}`),
  );
  const started = Date.now();
  await page.goto(args.url, { waitUntil: 'load', timeout: 90_000 });
  const title = await page.title();
  const landingMs = Date.now() - started;
  await page.goto(new URL('?menu=demo#menu', args.url).href, { waitUntil: 'load' });
  let menu = true;
  try {
    await page.getByRole('heading', { name: 'Моё меню на неделю:' }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
  } catch {
    menu = false;
  }
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  await page.screenshot({
    path: path.join(args.out, `live-${name}.jpg`),
    type: 'jpeg',
    quality: 80,
    scale: 'css',
  });
  result.sizes.push({ name, title, landingMs, menu, sideways, problems });
  await page.close();
}
await browser.close();
await writeFile(path.join(args.out, 'live-check.json'), JSON.stringify(result, null, 1));
for (const s of result.sizes) {
  console.log(
    `${s.name}: «${s.title}», menu ${s.menu ? 'ok' : 'MISSING'}, sideways ${s.sideways}, problems ${s.problems.length}`,
  );
  for (const p of s.problems.slice(0, 5)) console.log(`  ${p}`);
}
