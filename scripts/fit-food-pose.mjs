// Fits the food sprites to the rebrand's landing mockup for ?pose=design: centre, edge and rotation of each of its six
// foods by silhouette overlap (IoU). Prints the lines of designPose.ts.
//   node scripts/fit-food-pose.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCKUP = path.join(
  ROOT,
  '..',
  'Ресурсы для создания',
  'Задание 4',
  'этап 2',
  'дизайн главной страницы.jpg',
);
const FOOD_DIR = path.join(ROOT, 'assets-src', 'food');
const FRAME_W = 1920;
const FRAME_H = 1080;

/** Each food's area in frame px (nothing else of the mockup falls into it) and its sprite. */
const FOODS = [
  { slug: 'avocado', file: 'food-3-avocado.png', area: [441, 35, 591, 164] },
  { slug: 'croissant', file: 'food-13-croissant.png', area: [1190, 61, 1338, 181] },
  { slug: 'salad', file: 'food-2-salad.png', area: [931, 292, 1074, 427] },
  { slug: 'apple', file: 'food-15-apple.png', area: [591, 498, 730, 640] },
  { slug: 'cheese', file: 'food-10-cheese.png', area: [942, 669, 1069, 843] },
  { slug: 'corn', file: 'food-11-corn.png', area: [114, 731, 273, 830] },
];
const WINDOW = 150; // half-size of the search window, frame px
const SPRITE = 96; // the sprite's mask, px

const frame = await sharp(await readFile(MOCKUP))
  .resize(FRAME_W, FRAME_H)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const page = [254, 249, 246];
const isFood = (x, y) => {
  const at = (y * FRAME_W + x) * 3;
  const d =
    Math.abs(frame.data[at] - page[0]) +
    Math.abs(frame.data[at + 1] - page[1]) +
    Math.abs(frame.data[at + 2] - page[2]);
  return d > 40;
};

async function spriteMask(file) {
  const data = await sharp(await readFile(path.join(FOOD_DIR, file)))
    .ensureAlpha()
    .extractChannel('alpha')
    .resize(SPRITE, SPRITE, { fit: 'fill' })
    .raw()
    .toBuffer();
  return data;
}

function mockupMask(cx, cy, area) {
  const size = 2 * WINDOW;
  const mask = new Uint8Array(size * size);
  let left = size;
  let top = size;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fx = cx - WINDOW + x;
      const fy = cy - WINDOW + y;
      const inside = fx >= area[0] && fx < area[2] && fy >= area[1] && fy < area[3];
      if (inside && isFood(fx, fy)) {
        mask[y * size + x] = 1;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return { mask, size, left, top, right, bottom };
}

/** IoU of the sprite at (centre, edge, angle) against the mockup's mask, on a coarse lattice. */
function score(sprite, target, cx, cy, edge, angleDeg, step) {
  const angle = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let both = 0;
  let either = 0;
  for (let y = 0; y < target.size; y += step) {
    for (let x = 0; x < target.size; x += step) {
      const dx = x - cx;
      const dy = y - cy;
      const u = (dx * cos - dy * sin) / edge + 0.5;
      const v = (dx * sin + dy * cos) / edge + 0.5;
      let inSprite = false;
      if (u >= 0 && u < 1 && v >= 0 && v < 1) {
        inSprite = sprite[Math.floor(v * SPRITE) * SPRITE + Math.floor(u * SPRITE)] > 128;
      }
      const inTarget = target.mask[y * target.size + x] === 1;
      if (inSprite && inTarget) both += 1;
      if (inSprite || inTarget) either += 1;
    }
  }
  return either === 0 ? 0 : both / either;
}

for (const food of FOODS) {
  const sprite = await spriteMask(food.file);
  const originX = Math.round((food.area[0] + food.area[2]) / 2);
  const originY = Math.round((food.area[1] + food.area[3]) / 2);
  const target = mockupMask(originX, originY, food.area);
  const bboxCx = (target.left + target.right) / 2;
  const bboxCy = (target.top + target.bottom) / 2;
  let best = { iou: 0 };
  for (let angle = -180; angle < 180; angle += 6) {
    for (let edge = 110; edge <= 270; edge += 6) {
      for (let dx = -24; dx <= 24; dx += 6) {
        for (let dy = -24; dy <= 24; dy += 6) {
          const iou = score(sprite, target, bboxCx + dx, bboxCy + dy, edge, angle, 4);
          if (iou > best.iou) best = { iou, angle, edge, cx: bboxCx + dx, cy: bboxCy + dy };
        }
      }
    }
  }
  // Refine around the best.
  const coarse = best;
  for (let angle = coarse.angle - 6; angle <= coarse.angle + 6; angle += 1) {
    for (let edge = coarse.edge - 6; edge <= coarse.edge + 6; edge += 1.5) {
      for (let dx = -6; dx <= 6; dx += 1.5) {
        for (let dy = -6; dy <= 6; dy += 1.5) {
          const iou = score(sprite, target, coarse.cx + dx, coarse.cy + dy, edge, angle, 2);
          if (iou > best.iou) best = { iou, angle, edge, cx: coarse.cx + dx, cy: coarse.cy + dy };
        }
      }
    }
  }
  const centerX = Math.round((originX - WINDOW + best.cx) * 10) / 10;
  const centerY = Math.round((originY - WINDOW + best.cy) * 10) / 10;
  console.log(
    `  { slug: '${food.slug}', centerX: ${centerX}, centerY: ${centerY}, sizePx: ${best.edge}, rotateDeg: ${best.angle} }, // IoU ${best.iou.toFixed(3)}`,
  );
}
