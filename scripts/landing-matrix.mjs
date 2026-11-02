/* global document, getComputedStyle, window */
// The landing on every window of the matrix (00 §4): does part 1 fit, where does the girl stand, what overlaps. Writes a
// JSON report and contact sheets for a reviewer. Needs the built site served: npm run preview.
//   node scripts/landing-matrix.mjs [--url http://localhost:4180/] [--out <dir>]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

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
        'landing-matrix',
      ),
    },
    query: { type: 'string', default: '?freeze=1&seed=3' },
  },
});

/** name, width, height, touch device */
const WINDOWS = [
  ['laptop-1536', 1536, 730, false],
  ['desktop-1920', 1920, 1080, false],
  ['1440', 1440, 900, false],
  ['1366', 1366, 768, false],
  ['1280', 1280, 720, false],
  ['tablet-1024', 1024, 768, true],
  ['tablet-768', 768, 1024, true],
  ['tablet-820', 820, 1180, true],
  ['tablet-1180', 1180, 820, true],
  ['tablet-962', 962, 601, true],
  ['phone-390', 390, 844, true],
  ['phone-360', 360, 800, true],
  ['phone-320', 320, 568, true],
  ['landscape-844', 844, 390, true],
];

const SHEET_HEIGHT = 300;
const SHEET_WIDTH = 1280;

/** Runs in the page: boxes of the landing and the overlaps that must not happen. */
function measure() {
  const rect = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  };
  const round = (box) =>
    box && Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)]));
  const hits = (a, b) =>
    Boolean(a && b) && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const hero = document.querySelector('.scene--hero');
  const girl = rect('.hero-girl');
  const texts = {
    title: document.querySelector('.hero-title'),
    lead: document.querySelector('.hero-lead'),
  };
  // The ink of a text, not its block: a block can be wider than its lines.
  const inkOf = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const boxes = [...range.getClientRects()];
    return {
      left: Math.min(...boxes.map((b) => b.left)),
      top: Math.min(...boxes.map((b) => b.top)),
      right: Math.max(...boxes.map((b) => b.right)),
      bottom: Math.max(...boxes.map((b) => b.bottom)),
    };
  };
  const title = texts.title ? inkOf(texts.title) : null;
  const lead = texts.lead ? inkOf(texts.lead) : null;
  const cta = rect('.cta-slot');
  const cards = [...document.querySelectorAll('.feature-card')]
    .map((card) => card.getBoundingClientRect())
    .filter((box) => box.width > 0);
  const header = rect('.brand');
  return {
    scrolls: hero ? hero.scrollHeight - hero.clientHeight : null,
    pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    girl: round(girl),
    title: round(title),
    lead: round(lead),
    cta: round(cta),
    titleFontPx: texts.title ? Number.parseFloat(getComputedStyle(texts.title).fontSize) : null,
    cards: cards.length,
    overlaps: {
      girlTitle: hits(girl, title),
      girlLead: hits(girl, lead),
      girlCta: hits(girl, cta),
      girlHeader: hits(girl, header),
      girlCards: cards.some((card) => hits(girl, card)),
      ctaCards: cards.some((card) => hits(cta, card)),
    },
    ctaInFirstScreen: cta ? cta.bottom <= window.innerHeight : null,
    videoState: document.querySelector('.hero-girl-art')?.dataset.girl ?? null,
    videoSrc: document.querySelector('video')?.currentSrc.split('/').pop() ?? null,
  };
}

await mkdir(args.out, { recursive: true });
const browser = await chromium.launch();
const report = {};
const tiles = [];
for (const [name, width, height, touch] of WINDOWS) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    hasTouch: touch,
    isMobile: touch,
  });
  const page = await context.newPage();
  await page.goto(new URL(args.query, args.url).href);
  await page.waitForSelector('.page[data-ready]');
  await page.evaluate('document.fonts.ready.then(() => true)');
  await page.waitForTimeout(500);
  report[name] = { size: `${width}×${height}`, ...(await page.evaluate(measure)) };
  const png = await page.screenshot({ type: 'png' });
  await writeFile(path.join(args.out, `${name}.png`), png);
  tiles.push({ name, png, width, height });
  await context.close();
}
await browser.close();
await writeFile(path.join(args.out, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);

// Contact sheets: rows of tiles of one height, as many as fit the sheet's width.
const rows = [];
let row = [];
let used = 0;
for (const tile of tiles) {
  const width = Math.round((tile.width * SHEET_HEIGHT) / tile.height);
  if (used + width > SHEET_WIDTH && row.length > 0) {
    rows.push(row);
    row = [];
    used = 0;
  }
  row.push({ ...tile, drawnWidth: width });
  used += width + 8;
}
if (row.length > 0) rows.push(row);
for (const [index, tilesInRow] of rows.entries()) {
  const composite = [];
  let left = 0;
  for (const tile of tilesInRow) {
    composite.push({
      input: await sharp(tile.png).resize(tile.drawnWidth, SHEET_HEIGHT).png().toBuffer(),
      left,
      top: 0,
    });
    left += tile.drawnWidth + 8;
  }
  const sheet = await sharp({
    create: { width: left, height: SHEET_HEIGHT, channels: 3, background: '#7f7f7f' },
  })
    .composite(composite)
    .jpeg({ quality: 80 })
    .toBuffer();
  await writeFile(path.join(args.out, `sheet-${index + 1}.jpg`), sheet);
}
for (const [name, entry] of Object.entries(report)) {
  const bad = Object.entries(entry.overlaps)
    .filter(([, value]) => value)
    .map(([key]) => key);
  console.log(
    name.padEnd(14),
    `scroll ${entry.scrolls}`.padEnd(11),
    `girl ${entry.girl ? `${entry.girl.right - entry.girl.left}×${entry.girl.bottom - entry.girl.top}` : 'нет'}`.padEnd(
      14,
    ),
    `title ${entry.titleFontPx}`.padEnd(14),
    `cards ${entry.cards}`.padEnd(8),
    `cta ${entry.ctaInFirstScreen}`.padEnd(9),
    bad.length > 0 ? `OVERLAP ${bad.join(',')}` : '',
  );
}
