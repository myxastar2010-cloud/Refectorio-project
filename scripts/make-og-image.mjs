// Open Graph / Twitter image 1200×630 rendered from the main page with the food exactly as on the mockup
// (?pose=design&freeze=1). Needs the built site served locally: npm run build && npm run preview, then
// npm run og-image (SITE=http://localhost:4173 by default).
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE ?? 'http://localhost:4173';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await page.goto(`${SITE}/?pose=design&freeze=1&seed=1`);
// Runs in the page (browser globals), hence the string form.
await page.evaluate('document.fonts.ready.then(() => true)');
await page.waitForTimeout(600);
const png = await page.screenshot({ type: 'png' });
await browser.close();

const jpeg = await sharp(png).resize(1200, 630).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
await writeFile(path.join(ROOT, 'apps/web/public/og-image.jpg'), jpeg);
console.log(`og-image.jpg: ${Math.round(jpeg.length / 1024)} KB`);
