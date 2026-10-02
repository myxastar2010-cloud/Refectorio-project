// Builds optimized images for the web app from assets-src/ (run: npm run assets).
// Output goes to apps/web/src/assets/generated/ together with manifest.json and is committed,
// so the Render/Pages builds never need sharp.
//
//   food   → square sprites, AVIF + WebP at 1× and 2×; pre-blurred copies for the "about" scene
//            (with transparent padding so the blur is not clipped); 32×32 alpha masks for hit tests
//   team   → card background without transparent corners (AVIF + WebP), logo (AVIF + WebP)
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets-src');
const OUT = path.join(ROOT, 'apps/web/src/assets/generated');

/** Sprite edge sizes in CSS px at 1× (the 2× file is twice as large). */
const FOOD_SIZE_1X = 200;
/**
 * Gaussian sigma of the pre-blurred sprites, in px of the 1× sprite.
 * Mockup №2 shows sigma ≈ 7 screen px at sprite size ≈ 185 px × camera scale 0.887 →
 * 7 / (185 / 200 × 0.887) ≈ 8.5 px (fit: refectorio-workspace/design/analysis/03_blur_fit.py).
 */
const FOOD_BLUR_SIGMA_1X = 8.5;
/** Padding around blurred sprites as a share of the sprite edge: ≥ 3σ so the blur is never clipped. */
const BLUR_PAD_RATIO = Math.ceil(((3 * FOOD_BLUR_SIGMA_1X) / FOOD_SIZE_1X) * 100) / 100;
const MASK_SIZE = 32;
const ALPHA_THRESHOLD = 128;

const AVIF_SPRITE = { quality: 62, effort: 6 };
const WEBP_SPRITE = { quality: 82, alphaQuality: 90, effort: 6 };
const AVIF_PHOTO = { quality: 60, effort: 6 };
const WEBP_PHOTO = { quality: 80, effort: 6 };

const toFile = (name) => path.join(OUT, name);

async function writeVariants(pipeline, baseName, { avif, webp }) {
  await pipeline
    .clone()
    .avif(avif)
    .toFile(toFile(`${baseName}.avif`));
  await pipeline
    .clone()
    .webp(webp)
    .toFile(toFile(`${baseName}.webp`));
  return { avif: `${baseName}.avif`, webp: `${baseName}.webp` };
}

/** Bounding box of pixels with alpha above `threshold`, in source pixels. */
async function alphaBounds(file, threshold = 8) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .extractChannel('alpha')
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[y * info.width + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** 32×32 opacity mask, one 32-bit row per string of 8 hex digits (bit 31 = leftmost pixel). */
async function alphaMask(file) {
  const data = await sharp(file)
    .ensureAlpha()
    .extractChannel('alpha')
    .resize(MASK_SIZE, MASK_SIZE, { fit: 'fill', kernel: 'cubic' })
    .raw()
    .toBuffer();
  const rows = [];
  for (let y = 0; y < MASK_SIZE; y += 1) {
    let row = 0;
    for (let x = 0; x < MASK_SIZE; x += 1) {
      if (data[y * MASK_SIZE + x] >= ALPHA_THRESHOLD) row |= 1 << (MASK_SIZE - 1 - x);
    }
    rows.push((row >>> 0).toString(16).padStart(8, '0'));
  }
  return rows;
}

async function buildFood() {
  const dir = path.join(SRC, 'food');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.png')).sort();
  const items = [];
  for (const name of files) {
    const match = /^food-(\d+)-([a-z-]+)\.png$/.exec(name);
    if (!match) throw new Error(`Unexpected food file name: ${name}`);
    const [, index, slug] = match;
    const file = path.join(dir, name);
    const meta = await sharp(file).metadata();
    if (meta.width !== meta.height) throw new Error(`${name} must be square`);

    const sharpVariants = {};
    const blurredVariants = {};
    for (const density of [1, 2]) {
      const edge = FOOD_SIZE_1X * density;
      const base = `food-${index}-${slug}-${edge}`;
      sharpVariants[`${density}x`] = await writeVariants(
        sharp(file).resize(edge, edge, { kernel: 'lanczos3' }),
        base,
        { avif: AVIF_SPRITE, webp: WEBP_SPRITE },
      );
      const pad = Math.round(edge * BLUR_PAD_RATIO);
      const resized = await sharp(file).resize(edge, edge, { kernel: 'lanczos3' }).png().toBuffer();
      blurredVariants[`${density}x`] = await writeVariants(
        sharp(resized)
          .extend({
            top: pad,
            bottom: pad,
            left: pad,
            right: pad,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .blur(FOOD_BLUR_SIGMA_1X * density),
        `${base}-blur`,
        { avif: AVIF_SPRITE, webp: WEBP_SPRITE },
      );
    }

    const bounds = await alphaBounds(file);
    items.push({
      id: Number(index),
      slug,
      // Visible (opaque) part of the square sprite, as fractions of its edge.
      bounds: {
        x: round(bounds.x / meta.width),
        y: round(bounds.y / meta.height),
        width: round(bounds.width / meta.width),
        height: round(bounds.height / meta.height),
      },
      mask: await alphaMask(file),
      sharp: sharpVariants,
      blurred: { padRatio: BLUR_PAD_RATIO, ...blurredVariants },
    });
  }
  return items;
}

/** Mean colour of the opaque pixels in the four corner squares (the baked rounded corners are dark). */
async function cornerFill(file, square = 240) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  let count = 0;
  const corners = [
    [0, 0],
    [info.width - square, 0],
    [0, info.height - square],
    [info.width - square, info.height - square],
  ];
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + square; y += 1) {
      for (let x = cx; x < cx + square; x += 1) {
        const i = (y * info.width + x) * 4;
        if (data[i + 3] === 255) {
          sum[0] += data[i];
          sum[1] += data[i + 1];
          sum[2] += data[i + 2];
          count += 1;
        }
      }
    }
  }
  const [r, g, b] = sum.map((value) => Math.round(value / count));
  return { r, g, b };
}

async function buildTeam() {
  const bgFile = path.join(SRC, 'team/team-card-bg.png');
  const logoFile = path.join(SRC, 'team/team-logo.png');
  const bgMeta = await sharp(bgFile).metadata();
  const logoMeta = await sharp(logoFile).metadata();
  const fill = await cornerFill(bgFile);

  const background = {};
  for (const width of [bgMeta.width, Math.round(bgMeta.width / 2)]) {
    background[width] = await writeVariants(
      // The source has rounded corners baked in; the app clips with its own animated radius,
      // so transparent corners must not show up mid-animation.
      sharp(bgFile).flatten({ background: fill }).resize({ width, kernel: 'lanczos3' }),
      `team-card-bg-${width}`,
      { avif: AVIF_PHOTO, webp: WEBP_PHOTO },
    );
  }
  const logo = await writeVariants(sharp(logoFile), `team-logo-${logoMeta.width}`, {
    avif: AVIF_PHOTO,
    webp: { ...WEBP_PHOTO, alphaQuality: 100 },
  });

  return {
    background: {
      width: bgMeta.width,
      height: bgMeta.height,
      fill: `#${[fill.r, fill.g, fill.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
      variants: background,
    },
    logo: { width: logoMeta.width, height: logoMeta.height, ...logo },
  };
}

function round(value) {
  return Math.round(value * 10_000) / 10_000;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const manifest = {
    note: 'Generated by scripts/optimize-assets.mjs from assets-src/. Do not edit by hand.',
    food: {
      size1x: FOOD_SIZE_1X,
      blurSigma1x: FOOD_BLUR_SIGMA_1X,
      maskSize: MASK_SIZE,
      items: await buildFood(),
    },
    team: await buildTeam(),
  };
  await writeFile(toFile('manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const files = await readdir(OUT);
  console.log(`assets: ${files.length} files written to ${path.relative(ROOT, OUT)}`);
}

await main();
