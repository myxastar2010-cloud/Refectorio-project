// Open Runde (SIL OFL 1.1 — a rounded Inter, the closest open font to SF Pro Rounded of the mockups) cut down to the
// characters the site uses: Latin, Cyrillic and punctuation. The Fontsource files carry the whole glyph set
// (Greek, Vietnamese, symbols…) — about 160 KB per weight; the subsets are several times smaller.
// Run after updating @fontsource/open-runde: npm run fonts. The result is committed (the build needs no tools).
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'node_modules/@fontsource/open-runde');
const OUT = path.join(ROOT, 'apps/web/src/assets/fonts');
const WEIGHTS = [400, 500, 600, 700];

// Basic Latin, Latin-1, Russian Cyrillic (with Ё), dashes and quotes, ‰ ‹ ›, №, ₽, minus.
const RANGES = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x400, 0x45f],
  [0x2010, 0x2027],
  [0x2030, 0x203a],
  [0x2116, 0x2116],
  [0x20bd, 0x20bd],
  [0x2212, 0x2212],
];
const characters = RANGES.flatMap(([from, to]) =>
  Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)),
).join('');

await mkdir(OUT, { recursive: true });
for (const weight of WEIGHTS) {
  const input = await readFile(path.join(SOURCE, `files/open-runde-latin-${weight}-normal.woff2`));
  const output = await subsetFont(input, characters, { targetFormat: 'woff2' });
  await writeFile(path.join(OUT, `open-runde-${weight}.woff2`), output);
  console.log(
    `open-runde-${weight}.woff2: ${Math.round(input.length / 1024)} KB → ${Math.round(output.length / 1024)} KB`,
  );
}
// The OFL travels with the font files.
await copyFile(path.join(SOURCE, 'LICENSE'), path.join(OUT, 'OFL.txt'));
