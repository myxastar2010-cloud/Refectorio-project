// Question and option icons of the quiz (ТЗ §5): the team's AI-made 1024 px PNGs → trimmed, haze cleaned,
// AVIF + WebP at 2× their display size in apps/web/src/assets/generated/quiz/ + quiz-icons.json (committed).
//   npm run quiz-icons
// Haze: the sources carry a faint alpha fog around the object (alpha < 24/255 over 1–4 % of the canvas); it is cut,
// a real soft shadow (stronger alpha) stays. The «Образ жизни» header icon has no file: it is cropped from the design
// screenshot as a temporary asset (the team is asked for a ≥ 512 px source).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets-src', 'quiz');
const OUT = path.join(ROOT, 'apps', 'web', 'src', 'assets', 'generated', 'quiz');

const HAZE_ALPHA = 24;
const PAD = 0.03;
/** Display boxes in mockup px; files are 2× (1× sources stay at their own size). */
const HEADER_BOX = 140;
const OPTION_BOX = 64;

const ICONS = [
  ['q-body', HEADER_BOX],
  ['q-goal', HEADER_BOX],
  ['q-food-style', HEADER_BOX],
  ['q-macro', HEADER_BOX],
  ['q-health', HEADER_BOX],
  ['q-allergy', HEADER_BOX],
  ['q-activity', HEADER_BOX],
  ['q-strength', HEADER_BOX],
  ['q-notes', HEADER_BOX],
  ['o-goal-lose', OPTION_BOX],
  ['o-goal-gain', OPTION_BOX],
  ['o-goal-maintain', OPTION_BOX],
  ['o-diet-omnivore', OPTION_BOX],
  ['o-diet-pescatarian', OPTION_BOX],
  ['o-diet-vegetarian', OPTION_BOX],
  ['o-diet-vegan', OPTION_BOX],
  ['o-macro-recommended', OPTION_BOX],
  ['o-macro-high-protein', OPTION_BOX],
  ['o-macro-low-carb', OPTION_BOX],
  ['o-macro-keto', OPTION_BOX],
  ['o-macro-low-fat', OPTION_BOX],
  ['o-life-sitting', OPTION_BOX],
  ['o-life-sometimes', OPTION_BOX],
  ['o-life-standing', OPTION_BOX],
  ['o-life-moving', OPTION_BOX],
  ['o-life-labour', OPTION_BOX],
];

const AVIF = { quality: 60, effort: 6 };
const WEBP = { quality: 78, alphaQuality: 85, effort: 6 };

/** RGBA buffer with the haze cut and the object trimmed (plus a small transparent pad). */
async function clean(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 4 + 3;
      if (data[i] < HAZE_ALPHA) data[i] = 0;
      else {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const side = Math.max(maxX - minX + 1, maxY - minY + 1);
  const pad = Math.round(side * PAD);
  return sharp(data, { raw: info })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

/** The standing mannequin from the lifestyle design (no file from the team): background keyed out. */
async function lifestyleHeader() {
  const design = await readFile(path.join(SRC, 'designs', 'lifestyle.png'));
  const crop = { left: 905, top: 118, width: 110, height: 155 };
  const { data, info } = await sharp(design)
    .extract(crop)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bg = [0xfe, 0xf9, 0xf7];
  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
    // Soft key: fully transparent near the page colour, opaque beyond 40 units.
    data[i + 3] = Math.max(0, Math.min(255, Math.round(((distance - 10) / 30) * 255)));
  }
  return clean(await sharp(data, { raw: info }).png().toBuffer());
}

async function writeVariants(name, buffer, box) {
  const meta = await sharp(buffer).metadata();
  const target = box * 2;
  // Never upscale a small source (the 67 px lifestyle options): they stay 1×.
  const scale = Math.min(1, target / Math.max(meta.width, meta.height));
  const width = Math.max(1, Math.round(meta.width * scale));
  const height = Math.max(1, Math.round(meta.height * scale));
  const pipeline = sharp(buffer).resize(width, height, { kernel: 'lanczos3' });
  await writeFile(path.join(OUT, `${name}.avif`), await pipeline.clone().avif(AVIF).toBuffer());
  await writeFile(path.join(OUT, `${name}.webp`), await pipeline.clone().webp(WEBP).toBuffer());
  return { width, height, box, density: Math.max(meta.width, meta.height) >= target ? 2 : 1 };
}

await mkdir(OUT, { recursive: true });
const manifest = {};
for (const [name, box] of ICONS) {
  // Node reads, sharp gets buffers (libvips and Cyrillic paths on Windows, commit 3afe286).
  const cleaned = await clean(await readFile(path.join(SRC, `${name}.png`)));
  manifest[name] = await writeVariants(name, cleaned, box);
}
manifest['q-lifestyle'] = {
  ...(await writeVariants('q-lifestyle', await lifestyleHeader(), HEADER_BOX)),
  temporary: true,
};
await writeFile(path.join(OUT, '..', 'quiz-icons.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Иконки теста: ${Object.keys(manifest).length} → apps/web/src/assets/generated/quiz/`);
