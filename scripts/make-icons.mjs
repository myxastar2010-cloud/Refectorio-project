// Raster icons from the logo — Kiki (assets-src/brand/logo-kiki.svg, the same drawing as components/Kiki.tsx): favicons
// 16 and 32 px, Apple touch icon 180 px, manifest icons 192 and 512 px (logo on the page background with padding).
// The same SVG is the vector favicon (public/favicon.svg). Run: npm run icons
// Node fs does the disk I/O, sharp only sees buffers (non-ASCII project path on Windows).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'apps/web/public');
const BACKGROUND = '#FEF9F7';

const svg = await readFile(path.join(ROOT, 'assets-src/brand/logo-kiki.svg'));
const logo = await sharp(svg, { density: 1200 }).png().toBuffer();
await writeFile(path.join(PUBLIC, 'favicon.svg'), svg);

async function icon(size, padding, background) {
  const inner = Math.round(size * (1 - 2 * padding));
  const art = await sharp(logo)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    // Small sizes lose their fine lines without a little sharpening.
    .sharpen(size <= 32 ? { sigma: 0.6 } : undefined)
    .png()
    .toBuffer();
  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  return canvas
    .composite([{ input: art, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const outputs = [
  ['favicon-16.png', await icon(16, 0.02)],
  ['favicon-32.png', await icon(32, 0.04)],
  ['apple-touch-icon.png', await icon(180, 0.14, BACKGROUND)],
  ['icon-192.png', await icon(192, 0.14, BACKGROUND)],
  ['icon-512.png', await icon(512, 0.14, BACKGROUND)],
];
for (const [name, buffer] of outputs) await writeFile(path.join(PUBLIC, name), buffer);
console.log(`icons: ${outputs.map(([name]) => name).join(', ')}`);
