/* global document, window */
// Frame strips of the food going around the girl for the motion review (memory: pause the clock and step it, screenshots in
// real time miss the frames that matter). Finds a stretch where an item comes close to her and draws it as a strip.
//   node scripts/girl-strip.mjs [--url http://localhost:4180/] [--out <dir>]
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
      default: path.join(ROOT, '..', 'refectorio-workspace', 'reports', 'stage-4', 'motion'),
    },
  },
});

const FRAME_MS = 16;
const STEP_FRAMES = 30; // half a second between the strip's tiles
const TILES = 12;
const TILE_WIDTH = 318;

await mkdir(args.out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1536, height: 730 } });
const page = await context.newPage();
await page.clock.install();
await page.goto(new URL('./?seed=11', args.url).href);
await page.clock.runFor(500);
await page.evaluate('document.fonts.ready.then(() => true)');
await page.clock.runFor(1000);

const nearest = () =>
  page.evaluate(() => {
    const box = document.querySelector('.hero-girl')?.getBoundingClientRect();
    const items = window.__refectorioFood?.snapshot() ?? [];
    if (!box) return null;
    let best = { distance: Infinity, x: 0, y: 0 };
    for (const item of items) {
      const dx = Math.max(box.left - item.x, 0, item.x - box.right);
      const dy = Math.max(box.top - item.y, 0, item.y - box.bottom);
      const distance = Math.hypot(dx, dy) - item.size / 2;
      if (distance < best.distance) best = { distance, x: item.x, y: item.y };
    }
    return { ...best, box: { x: box.x, y: box.y, width: box.width, height: box.height } };
  });

// Run until an item is about to touch her box.
let probe = await nearest();
let advanced = 0;
while (probe && probe.distance > 40 && advanced < 60_000) {
  await page.clock.runFor(STEP_FRAMES * FRAME_MS);
  advanced += STEP_FRAMES * FRAME_MS;
  probe = await nearest();
}
console.log(`an item near her after ${advanced} ms`, JSON.stringify(probe));

const crop = {
  x: Math.max(0, Math.round(probe.box.x - 170)),
  y: 0,
  width: Math.round(1536 - Math.max(0, probe.box.x - 170)),
  height: 730,
};
const tiles = [];
for (let index = 0; index < TILES; index += 1) {
  tiles.push(await page.screenshot({ type: 'png', clip: crop }));
  await page.clock.runFor(STEP_FRAMES * FRAME_MS);
}
await browser.close();

const tileHeight = Math.round((crop.height * TILE_WIDTH) / crop.width);
const columns = 4;
const rows = Math.ceil(TILES / columns);
const sheet = sharp({
  create: {
    width: columns * TILE_WIDTH + (columns - 1) * 4,
    height: rows * tileHeight + (rows - 1) * 4,
    channels: 3,
    background: '#808080',
  },
}).composite(
  await Promise.all(
    tiles.map(async (png, index) => ({
      input: await sharp(png).resize(TILE_WIDTH, tileHeight).png().toBuffer(),
      left: (index % columns) * (TILE_WIDTH + 4),
      top: Math.floor(index / columns) * (tileHeight + 4),
    })),
  ),
);
await writeFile(
  path.join(args.out, 'food-around-girl.jpg'),
  await sheet.jpeg({ quality: 82 }).toBuffer(),
);
console.log('strip written');
