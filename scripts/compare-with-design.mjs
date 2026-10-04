// Compares the main page with the mockups (stage 1 brief, section 9.2).
//
// In ?pose=design&freeze=1&seed=1 mode it takes 1920×1080 screenshots of part 1, part 2 and the expanded team card and
// compares them with the mockups by pixelmatch (diff image + 50/50 overlay; the 17 px white band on top of mockup №1
// is cropped). Geometry of key elements is checked to ±4 px:
// - boxes (buttons, cards, tiles, the dialog) — the element's box on the page against the Figma frame;
// - text and icons — by "ink": the same pixel measurement on the mockup and on a page screenshot without food
//   (left edge, cap top, baseline). Ink width is reported but not judged: Open Runde ≠ SF Pro Rounded (allowed by the brief).
//
// Needs the built site served locally: npm run build && npm run preview, then
//   npm run compare-design -- [--url http://localhost:4173/] [--mockups <dir>] [--out <dir>]
// Defaults: mockups — ../Ресурсы для создания/Задача 1, report — ../refectorio-workspace/reports/stage-1/design-diff.
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
/** The mockup's expanded card sits 13.5 px left of centre; the site centres it (decision of stage 0). */
const DIALOG_SHIFT_PX = (WIDTH - 1401) / 2 - 246;

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    mockups: { type: 'string', default: path.join(ROOT, '..', 'Ресурсы для создания', 'Задача 1') },
    out: {
      type: 'string',
      default: path.join(ROOT, '..', 'refectorio-workspace', 'reports', 'stage-1', 'design-diff'),
    },
  },
});

const STATES = [
  {
    id: 'hero',
    title: 'Часть 1',
    mockup: 'дизайн главной страницы №1.jpg',
    offsetY: 17,
    hash: '',
    shiftX: 0,
  },
  {
    id: 'about',
    title: 'Часть 2',
    mockup: 'дизайн главной страницы №2.jpg',
    offsetY: 0,
    hash: '#about',
    shiftX: 0,
  },
  {
    id: 'team',
    title: 'Раскрытая карточка',
    mockup: 'дизайн раскрытой команды.jpg',
    offsetY: 0,
    hash: '#about',
    shiftX: DIALOG_SHIFT_PX,
    openTeam: true,
  },
];

// Boxes: [state, element, selector, index, Figma frame x, y, w, h, note]
const BOXES = [
  ['hero', '«О проекте»', '.about-pill', 0, 1675, 19, 189, 83],
  ['hero', '«Создать меню»', '.cta', 0, 48, 595, 440, 83],
  ['hero', 'Карточка «Наука»', '.feature-card', 0, 48, 833, 440, 161],
  ['hero', 'Карточка «ИИ помощник»', '.feature-card', 1, 509, 833, 440, 161],
  ['hero', 'Карточка «Персонализация»', '.feature-card', 2, 970, 833, 440, 161],
  ['hero', 'Карточка «Гарантия»', '.feature-card', 3, 1431, 833, 440, 161],
  ['about', 'Карточка «Команда»', '.info-card', 0, 104, 419, 754, 487],
  ['about', 'Карточка «Проект»', '.info-card', 1, 1062, 419, 754, 487],
  ['about', 'Плитка команды', '.info-tile', 0, 247, 557, 187, 187],
  ['about', 'Плитка проекта', '.info-tile', 1, 1205, 557, 187, 187],
  ['about', '«Ещё»', '.info-more', 0, 433, 795, 113, 62],
  [
    'team',
    'Раскрытая карточка',
    '.team-surface--dialog',
    0,
    246 + DIALOG_SHIFT_PX,
    118,
    1401,
    844,
    'по центру экрана; в макете сдвинута на 13,5 px влево',
  ],
];

// Ink: [state, element, ink colour, region in mockup coordinates x0, y0, x1, y1, lines, min gap between lines]
const INKS = [
  ['hero', 'Лого (яблоко)', 'accent', 10, 10, 122, 122, 1, 4],
  ['hero', '«Refectorio»', 'dark', 120, 40, 430, 125, 1, 4],
  ['hero', 'Текст «О проекте»', 'dark', 1700, 40, 1845, 82, 1, 4],
  // The breve of «й» floats above x-height letters: merge bands closer than 12 px in the big heading.
  ['hero', 'Заголовок', 'dark', 40, 215, 700, 480, 3, 12],
  ['hero', 'Подзаголовок', 'dark', 40, 497, 520, 562, 2, 4],
  ['hero', 'Текст «Создать меню»', 'white', 150, 612, 345, 660, 1, 4],
  ['hero', 'Карточка 1: заголовок', 'white', 95, 855, 340, 898, 1, 4],
  ['hero', 'Карточка 1: текст', 'white', 95, 901, 360, 968, 2, 4],
  ['hero', 'Карточка 2: заголовок', 'white', 556, 855, 820, 898, 1, 4],
  ['hero', 'Карточка 2: текст', 'white', 556, 901, 830, 968, 2, 4],
  ['hero', 'Карточка 3: заголовок', 'white', 1017, 855, 1290, 898, 1, 4],
  ['hero', 'Карточка 3: текст', 'white', 1017, 901, 1290, 968, 2, 4],
  ['hero', 'Карточка 4: заголовок', 'white', 1478, 855, 1740, 898, 1, 4],
  ['hero', 'Карточка 4: текст', 'white', 1478, 901, 1750, 968, 2, 4],
  ['about', 'Заголовок «О проекте»', 'accent', 770, 95, 1086, 172, 1, 4],
  ['about', 'Шеврон', 'accent', 1086, 95, 1160, 172, 1, 4],
  ['about', '«Команда:»', 'white', 400, 468, 590, 515, 1, 4],
  ['about', '«Проект:»', 'white', 1360, 468, 1520, 515, 1, 4],
  ['about', 'Название команды', 'white', 470, 555, 720, 670, 2, 4],
  ['about', 'Подпись команды', 'white', 470, 680, 670, 740, 2, 4],
  // The site has the real name «Refectorio» (one line) instead of the mockup's «Название Проекта»: first line only.
  ['about', 'Название проекта, 1-я строка', 'white', 1428, 555, 1700, 615, 1, 4],
  ['about', 'Текст «Ещё»', 'white', 455, 805, 525, 845, 1, 4],
  ['about', '«Исходный код»', 'white', 1215, 795, 1375, 826, 1, 4],
  ['about', '«Документация»', 'white', 1455, 795, 1618, 826, 1, 4],
  ['team', '«Modern Manifesto»', 'white', 340, 420, 700, 560, 2, 4],
  ['team', '«Учащиеся школы #2107»', 'white', 345, 578, 640, 655, 2, 4],
  ['team', 'Участник 1', 'white', 600, 670, 900, 710, 1, 4],
  ['team', 'Участник 2', 'white', 600, 755, 900, 795, 1, 4],
  ['team', 'Участник 3', 'white', 600, 838, 900, 880, 1, 4],
  ['team', 'Участник 4', 'white', 1055, 670, 1360, 710, 1, 4],
  ['team', 'Участник 5', 'white', 1055, 755, 1360, 795, 1, 4],
];

const INK = {
  // Black or grey text on #FEF9F7.
  dark: (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b < 170,
  // White text on red or on the dark team card.
  white: (r, g, b) => r > 200 && g > 185 && b > 185,
  // #E63946 on #FEF9F7.
  accent: (r, g, b) => r > 170 && g < 120 && b < 130,
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
  const crop = sharp(file).extract({ left: 0, top: state.offsetY, width: WIDTH, height: HEIGHT });
  const png = await crop.clone().png().toBuffer();
  const raw = await crop.clone().ensureAlpha().raw().toBuffer();
  return { png, rgba: raw };
}

async function openState(page, state) {
  await page.goto(new URL(`?pose=design&freeze=1&seed=1${state.hash}`, args.url).href);
  await page.waitForSelector('.page[data-ready]');
  await page.evaluate('document.fonts.ready.then(() => true)');
  if (state.openTeam) {
    await page.getByRole('button', { name: /Ещё о команде/ }).click();
    await page.getByRole('dialog').waitFor();
    // Spring of the shared element plus the cascade of the content.
    await page.waitForTimeout(2500);
    await page.waitForFunction(
      "[...document.querySelectorAll('.team-surface--dialog img')].every((img) => img.complete && img.naturalWidth > 0)",
    );
  }
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
    const dx = Math.round(state.shiftX);
    const expected = measureInk(mockup.rgba, kind, x0, y0, x1, y1, minGap);
    const actual = measureInk(clean, kind, x0 + dx, y0, x1 + dx, y1, minGap);
    const rows = expected.map((line, i) => {
      const site = actual[i];
      if (!site) return { expected: line, missing: true, ok: false };
      const delta = {
        left: site.left - state.shiftX - line.left,
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
  `Допуск геометрии — ±${TOLERANCE_PX} px. Рамки — по Figma; текст и иконки — по «чернилам» одинаковым замером на макете`,
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
