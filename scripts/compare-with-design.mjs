// Compares part 1 of the main page with the rebrand's mockup (stage 4, §1.4; the brief of stage 1, section 9.2).
//
// In ?pose=design&freeze=1&seed=1 mode it takes a 1920×1080 screenshot and compares it with the mockup scaled to that frame
// by pixelmatch (diff image + 50/50 overlay). Geometry of key elements is checked to ±4 px:
// - boxes (buttons, cards) — the element's box on the page against the measurements of the mockup
//   (refectorio-workspace/design/analysis/20_landing_stage4.mjs);
// - text and icons — by "ink": the same pixel measurement on the mockup and on a page screenshot without food
//   (left edge, cap top, baseline). Ink width is reported but not judged: Open Runde ≠ SF Pro Rounded.
//
// Needs the built site served locally: npm run build && npm run preview, then
//   npm run compare-design -- [--url http://localhost:4173/] [--mockups <dir>] [--out <dir>]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1920;
const HEIGHT = 1080;
const TOLERANCE_PX = 4;

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    mockups: {
      type: 'string',
      default: path.join(ROOT, '..', 'Ресурсы для создания', 'Задание 4', 'этап 2'),
    },
    out: {
      type: 'string',
      default: path.join(ROOT, '..', 'refectorio-workspace', 'reports', 'stage-4', 'design-diff'),
    },
  },
});

const STATES = [
  {
    id: 'hero',
    title: 'Часть 1',
    mockup: 'дизайн главной страницы.jpg',
    hash: '',
  },
];

// Boxes: [state, element, selector, index, frame x, y, w, h]
const BOXES = [
  ['hero', '«Цены»', '.pricing-pill', 0, 1531.8, 19, 135.1, 79],
  ['hero', '«О проекте»', '.about-pill', 0, 1683.1, 19, 179.8, 79],
  ['hero', '«Создать меню»', '.cta', 0, 57.1, 585.1, 456.7, 86.6],
  ['hero', 'Карточка «Исследования»', '.feature-card', 0, 46.6, 864.9, 447.2, 167.5],
  ['hero', 'Карточка «ИИ-консультант»', '.feature-card', 1, 507.1, 864.9, 447.2, 167.5],
  ['hero', 'Карточка «Комфорт в офисе»', '.feature-card', 2, 966.7, 864.9, 447.2, 167.5],
  ['hero', 'Карточка «Честность»', '.feature-card', 3, 1426.2, 864.9, 447.2, 167.5],
];

// Ink: [state, element, ink colour, region in frame coordinates x0, y0, x1, y1, lines, min gap between lines]
const INKS = [
  ['hero', 'Логотип', 'any', 40, 12, 168, 130, 1, 4],
  ['hero', '«ПроЛанч»', 'dark', 172, 40, 410, 112, 1, 4],
  ['hero', 'Текст «Цены»', 'dark', 1560, 40, 1640, 80, 1, 4],
  ['hero', 'Текст «О проекте»', 'dark', 1705, 40, 1840, 80, 1, 4],
  // The breve of «й» floats above x-height letters: merge bands closer than 12 px in the big heading.
  ['hero', 'Заголовок', 'dark', 50, 270, 850, 440, 2, 12],
  // Up to the apple of the mockup.
  ['hero', 'Подзаголовок', 'dark', 50, 442, 596, 542, 3, 3],
  ['hero', 'Текст «Создать меню»', 'white', 150, 600, 430, 660, 1, 4],
  ['hero', 'Карточка 1: заголовок', 'dark', 90, 885, 370, 930, 1, 4],
  ['hero', 'Карточка 1: текст', 'dark', 90, 932, 372, 1010, 3, 3],
  ['hero', 'Карточка 2: заголовок', 'dark', 550, 885, 835, 930, 1, 4],
  ['hero', 'Карточка 2: текст', 'dark', 550, 932, 835, 1010, 3, 3],
  ['hero', 'Карточка 3: заголовок', 'dark', 1010, 885, 1295, 930, 1, 4],
  ['hero', 'Карточка 3: текст', 'dark', 1010, 932, 1295, 1010, 3, 3],
  ['hero', 'Карточка 4: заголовок', 'dark', 1470, 885, 1750, 930, 1, 4],
  ['hero', 'Карточка 4: текст', 'dark', 1470, 932, 1750, 1010, 2, 3],
];

const INK = {
  // Black or grey text on #FEF9F7.
  dark: (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b < 170,
  // White text on the accent.
  white: (r, g, b) => r > 200 && g > 185 && b > 185,
  // Anything that is not the page.
  any: (r, g, b) => Math.abs(r - 254) + Math.abs(g - 249) + Math.abs(b - 247) > 40,
};

/** Lines of ink in a region: left/right, cap top, baseline (last row denser than 30% of the densest), bottom. */
function measureInk(rgba, kind, x0, y0, x1, y1, minGap) {
  const test = INK[kind];
  const w = x1 - x0;
  const h = y1 - y0;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((y0 + y) * WIDTH + x0 + x) * 4;
      mask[y * w + x] = test(rgba[i], rgba[i + 1], rgba[i + 2]) ? 1 : 0;
    }
  }
  const rowSum = (y) => {
    let sum = 0;
    for (let x = 0; x < w; x += 1) sum += mask[y * w + x];
    return sum;
  };
  const bands = [];
  let start = -1;
  let end = -1;
  let gap = 0;
  for (let y = 0; y < h; y += 1) {
    if (rowSum(y) > 0) {
      if (start < 0) start = y;
      end = y;
      gap = 0;
    } else if (start >= 0 && ++gap >= minGap) {
      bands.push([start, end]);
      start = -1;
      gap = 0;
    }
  }
  if (start >= 0) bands.push([start, end]);

  return bands
    .filter(([top, bottom]) => bottom - top + 1 >= 6)
    .map(([top, bottom]) => {
      let left = w;
      let right = -1;
      let densest = 0;
      const rows = [];
      for (let y = top; y <= bottom; y += 1) {
        const sum = rowSum(y);
        rows.push(sum);
        densest = Math.max(densest, sum);
        for (let x = 0; x < w; x += 1) {
          if (mask[y * w + x]) {
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
      }
      let baseRow = 0;
      rows.forEach((sum, index) => {
        if (sum > 0.3 * densest) baseRow = index;
      });
      return {
        left: x0 + left,
        width: right - left + 1,
        top: y0 + top,
        baseline: y0 + top + baseRow + 1,
      };
    });
}

async function readMockup(state) {
  const file = await readFile(path.join(args.mockups, state.mockup));
  const frame = sharp(file).resize(WIDTH, HEIGHT, { kernel: 'lanczos3' });
  const png = await frame.clone().png().toBuffer();
  const raw = await frame.clone().ensureAlpha().raw().toBuffer();
  return { png, rgba: raw };
}

async function openState(page, state) {
  await page.goto(new URL(`?pose=design&freeze=1&seed=1${state.hash}`, args.url).href);
  await page.waitForSelector('.page[data-ready]');
  await page.evaluate('document.fonts.ready.then(() => true)');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

async function boxOf(page, selector, index) {
  return page.evaluate(
    `(() => {
      const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })()`,
  );
}

const round1 = (value) => Math.round(value * 10) / 10;
const sign = (value) => (value > 0 ? `+${round1(value)}` : `${round1(value)}`);
const fits = (...deltas) => deltas.every((delta) => Math.abs(delta) <= TOLERANCE_PX);

await mkdir(args.out, { recursive: true });
const browser = await chromium.launch();
const report = { url: args.url, tolerancePx: TOLERANCE_PX, states: [] };

for (const state of STATES) {
  // A fresh page per state: going from ?… to ?…#about in the same page is a hash change, i.e. an animated transition.
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await openState(page, state);
  const sitePng = await page.screenshot({ type: 'png' });
  const boxes = [];
  for (const [boxState, name, selector, index, x, y, w, h, note] of BOXES) {
    if (boxState !== state.id) continue;
    const box = await boxOf(page, selector, index);
    if (!box) {
      boxes.push({ name, expected: { x, y, w, h }, missing: true, ok: false });
      continue;
    }
    const delta = { x: box.x - x, y: box.y - y, w: box.w - w, h: box.h - h };
    boxes.push({
      name,
      expected: { x, y, w, h },
      actual: box,
      delta,
      ok: fits(...Object.values(delta)),
      note,
    });
  }

  // Ink is measured without the food (it may pass behind the text on the page).
  await page.addStyleTag({ content: '.food-layer { visibility: hidden !important; }' });
  await page.waitForTimeout(100);
  const cleanPng = await page.screenshot({ type: 'png' });
  const clean = PNG.sync.read(cleanPng).data;
  await page.close();

  const mockup = await readMockup(state);
  const inks = [];
  for (const [inkState, name, kind, x0, y0, x1, y1, lines, minGap] of INKS) {
    if (inkState !== state.id) continue;
    const expected = measureInk(mockup.rgba, kind, x0, y0, x1, y1, minGap);
    const actual = measureInk(clean, kind, x0, y0, x1, y1, minGap);
    const rows = expected.map((line, i) => {
      const site = actual[i];
      if (!site) return { expected: line, missing: true, ok: false };
      const delta = {
        left: site.left - line.left,
        top: site.top - line.top,
        baseline: site.baseline - line.baseline,
        width: site.width - line.width,
      };
      return { expected: line, actual: site, delta, ok: fits(delta.left, delta.baseline) };
    });
    const linesOk = expected.length === lines && actual.length === lines;
    inks.push({
      name,
      kind,
      lines: rows,
      linesFound: { mockup: expected.length, site: actual.length },
      ok: linesOk && rows.every((row) => row.ok),
    });
  }

  const site = PNG.sync.read(sitePng);
  const diff = new PNG({ width: WIDTH, height: HEIGHT });
  const mismatched = pixelmatch(site.data, mockup.rgba, diff.data, WIDTH, HEIGHT, {
    threshold: 0.1,
  });
  const overlay = new PNG({ width: WIDTH, height: HEIGHT });
  for (let i = 0; i < overlay.data.length; i += 4) {
    overlay.data[i] = (site.data[i] + mockup.rgba[i]) >> 1;
    overlay.data[i + 1] = (site.data[i + 1] + mockup.rgba[i + 1]) >> 1;
    overlay.data[i + 2] = (site.data[i + 2] + mockup.rgba[i + 2]) >> 1;
    overlay.data[i + 3] = 255;
  }
  await writeFile(path.join(args.out, `${state.id}-site.png`), sitePng);
  await writeFile(path.join(args.out, `${state.id}-site-clean.png`), cleanPng);
  await writeFile(path.join(args.out, `${state.id}-mockup.png`), mockup.png);
  await writeFile(path.join(args.out, `${state.id}-diff.png`), PNG.sync.write(diff));
  await writeFile(path.join(args.out, `${state.id}-overlay.png`), PNG.sync.write(overlay));

  report.states.push({
    id: state.id,
    title: state.title,
    mismatchPercent: round1((mismatched / (WIDTH * HEIGHT)) * 100),
    boxes,
    inks,
  });
}
await browser.close();

// Markdown report.
const md = [
  '# Сравнение с макетами (1920×1080, `?pose=design&freeze=1&seed=1`)',
  '',
  `Допуск геометрии — ±${TOLERANCE_PX} px. Рамки — по замерам макета; текст и иконки — по «чернилам» одинаковым замером на макете`,
  'и на скриншоте без еды: левый край, верх прописных, базовая линия. Ширина строк — для сведения (Open Runde ≠ SF Pro Rounded).',
  '',
];
let failures = 0;
for (const state of report.states) {
  md.push(
    `## ${state.title}`,
    '',
    `Пиксели, отличающиеся от макета (pixelmatch, порог 0,1): **${state.mismatchPercent}%**.`,
  );
  md.push(
    `Файлы: \`${state.id}-site.png\`, \`${state.id}-mockup.png\`, \`${state.id}-diff.png\`, \`${state.id}-overlay.png\`.`,
    '',
  );
  md.push(
    '| Элемент | Эталон x, y, w×h | На сайте | Δx, Δy, Δw, Δh | Итог |',
    '|---|---|---|---|---|',
  );
  for (const box of state.boxes) {
    if (!box.ok) failures += 1;
    const e = box.expected;
    if (box.missing) {
      md.push(`| ${box.name} | ${e.x}, ${e.y}, ${e.w}×${e.h} | не найден | — | ✗ |`);
      continue;
    }
    const a = box.actual;
    const d = box.delta;
    md.push(
      `| ${box.name}${box.note ? ` (${box.note})` : ''} | ${round1(e.x)}, ${e.y}, ${e.w}×${e.h} | ${round1(a.x)}, ${round1(a.y)}, ${round1(a.w)}×${round1(a.h)} | ${sign(d.x)}, ${sign(d.y)}, ${sign(d.w)}, ${sign(d.h)} | ${box.ok ? '✓' : '✗'} |`,
    );
  }
  md.push(
    '',
    '| Текст / иконка | Строка | Эталон: лево, верх, база, ширина | Δ лево, Δ верх, Δ база | Δ ширины | Итог |',
    '|---|---|---|---|---|---|',
  );
  for (const ink of state.inks) {
    if (!ink.ok) failures += 1;
    if (ink.linesFound.mockup !== ink.linesFound.site) {
      md.push(
        `| ${ink.name} | — | строк на макете ${ink.linesFound.mockup}, на сайте ${ink.linesFound.site} | — | — | ✗ |`,
      );
      continue;
    }
    ink.lines.forEach((line, index) => {
      const e = line.expected;
      if (line.missing) {
        md.push(
          `| ${ink.name} | ${index + 1} | ${e.left}, ${e.top}, ${e.baseline}, ${e.width} | не найдена | — | ✗ |`,
        );
        return;
      }
      const d = line.delta;
      md.push(
        `| ${ink.name} | ${index + 1} | ${e.left}, ${e.top}, ${e.baseline}, ${e.width} | ${sign(d.left)}, ${sign(d.top)}, ${sign(d.baseline)} | ${sign(d.width)} | ${line.ok ? '✓' : '✗'} |`,
      );
    });
  }
  md.push('');
}
md.push(`**Итого вне допуска: ${failures}.**`, '');
await writeFile(path.join(args.out, 'report.md'), md.join('\n'));
await writeFile(path.join(args.out, 'report.json'), JSON.stringify(report, null, 2));
console.log(report.states.map((s) => `${s.id}: ${s.mismatchPercent}% pixels differ`).join('\n'));
console.log(`Out of tolerance: ${failures}. Report: ${path.join(args.out, 'report.md')}`);
