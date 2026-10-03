// Raster icons from the temporary logo (apps/web/public/favicon.svg): favicon 32 px, Apple touch icon 180 px,
// manifest icons 192 and 512 px (logo on the page background with padding). Run: npm run icons
// Node fs does the disk I/O, sharp only sees buffers (non-ASCII project path on Windows).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'apps/web/public');
const BACKGROUND = '#FEF9F7';

const svg = await readFile(path.join(PUBLIC, 'favicon.svg'));

async function icon(size, padding, background) {
  const inner = Math.round(size * (1 - 2 * padding));
  const logo = await sharp(svg, { density: 1200 }).resize(inner, inner).png().toBuffer();
  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  return canvas
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const outputs = [
  ['favicon-32.png', await icon(32, 0.04)],
  ['apple-touch-icon.png', await icon(180, 0.16, BACKGROUND)],
  ['icon-192.png', await icon(192, 0.16, BACKGROUND)],
  ['icon-512.png', await icon(512, 0.16, BACKGROUND)],
];
for (const [name, buffer] of outputs) await writeFile(path.join(PUBLIC, name), buffer);
console.log(`icons: ${outputs.map(([name]) => name).join(', ')}`);
