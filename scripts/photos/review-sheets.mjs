// Contact sheets for the visual choice (ТЗ §9.8 step 3): 6 dishes × 6 candidates per sheet, every cell labelled
// «<row letter><column>», e.g. C4. Output: .cache/photos/sheets/sheet-NN.jpg + sheet-NN.json (label → candidate).
//   node scripts/photos/review-sheets.mjs [--only-missing]
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  CACHE_DIR,
  CANDIDATES_FILE,
  loadCatalog,
  PICKS_FILE,
  readJson,
  writeJson,
} from './lib.mjs';

const CELL_W = 240;
const CELL_H = 320;
const LABEL_H = 34;
const ROW_HEADER_W = 230;
const ROWS = 6;
const COLS = 6;

const onlyMissing = process.argv.includes('--only-missing');
const { catalog } = await loadCatalog();
const state = await readJson(CANDIDATES_FILE, { dishes: {} });
const picks = await readJson(PICKS_FILE, {});
const dishes = catalog.dishes.filter(
  (d) => (state.dishes[d.id]?.candidates?.length ?? 0) > 0 && (!onlyMissing || !picks[d.id]),
);

const escape = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const svgText = (width, height, lines, size = 18) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ffffff"/>${lines
      .map(
        (line, i) =>
          `<text x="10" y="${24 + i * (size + 6)}" font-family="Arial, sans-serif" font-size="${size}" fill="#111">${escape(line)}</text>`,
      )
      .join('')}</svg>`,
  );

await mkdir(path.join(CACHE_DIR, 'sheets'), { recursive: true });
let sheetIndex = 0;
for (let start = 0; start < dishes.length; start += ROWS) {
  sheetIndex += 1;
  const rows = dishes.slice(start, start + ROWS);
  const width = ROW_HEADER_W + COLS * CELL_W;
  const height = rows.length * (CELL_H + LABEL_H);
  const composites = [];
  const legend = {};
  for (const [r, dish] of rows.entries()) {
    const top = r * (CELL_H + LABEL_H);
    const letter = String.fromCharCode(65 + r);
    composites.push({
      input: svgText(ROW_HEADER_W, CELL_H + LABEL_H, [`${letter}: ${dish.id}`, dish.nameRu], 17),
      left: 0,
      top,
    });
    const candidates = state.dishes[dish.id].candidates.slice(0, COLS);
    for (const [c, candidate] of candidates.entries()) {
      const file = path.join(
        CACHE_DIR,
        'thumbs',
        dish.id,
        `${candidate.provider}-${candidate.id}.jpg`,
      );
      if (!existsSync(file)) continue;
      // Node reads the file; sharp only sees the buffer (libvips and Cyrillic paths on Windows, commit 3afe286).
      const thumb = await sharp(await readFile(file))
        .resize(CELL_W, CELL_H, { fit: 'cover', position: sharp.strategy.attention })
        .jpeg({ quality: 80 })
        .toBuffer();
      const left = ROW_HEADER_W + c * CELL_W;
      const cellLabel = `${letter}${c + 1}`;
      composites.push({ input: thumb, left, top });
      composites.push({
        input: svgText(
          CELL_W,
          LABEL_H,
          [`${cellLabel} · ${candidate.provider} · ${candidate.score}`],
          15,
        ),
        left,
        top: top + CELL_H,
      });
      legend[cellLabel] = { dishId: dish.id, provider: candidate.provider, id: candidate.id };
    }
  }
  const name = `sheet-${String(sheetIndex).padStart(2, '0')}`;
  const image = await sharp({
    create: { width, height, channels: 3, background: '#ffffff' },
  })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toBuffer();
  await writeFile(path.join(CACHE_DIR, 'sheets', `${name}.jpg`), image);
  await writeJson(path.join(CACHE_DIR, 'sheets', `${name}.json`), legend);
}
console.log(`Листов: ${sheetIndex} (${dishes.length} блюд) → .cache/photos/sheets/`);
