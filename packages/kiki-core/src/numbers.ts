/**
 * Numbers in Russian text (ТЗ 00 §5.6): «1 500» = 1500, «1,5» = 1.5, ranges «10–20 %». The grounding validator extracts
 * every number that carries a unit or a percent from Kiki's answer and looks for it among the numbers of this turn's
 * tool results, the context digest and the user's own words.
 */

/** `any` — a number whose unit sits elsewhere (a table header, «ккал/белок» pairs, «тыс.»). */
export const UNIT_KINDS = [
  'kcal',
  'g',
  'kg',
  'mg',
  'mcg',
  'ml',
  'l',
  'percent',
  'count',
  'any',
] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

export type QuantifiedNumber = {
  readonly value: number;
  readonly unit: UnitKind;
  /** The text as written («1 500 ккал»). */
  readonly raw: string;
  /** Decimal places as written (rounding tolerance). */
  readonly decimals: number;
};

// Thousands separated by a space / no-break / narrow no-break space, a comma or a dot for decimals.
const NUMBER = String.raw`\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;
// Units after the number. A letter right after «г» or «л» means another word («20 году», «3 лучших»).
const UNIT = String.raw`(ккал|килокалори[а-яё]*|калори[а-яё]*|кал(?![а-яё])|мкг|микрограмм[а-яё]*|мг|миллиграмм[а-яё]*|мл|миллилитр[а-яё]*|литр[а-яё]*|л(?![а-яё])|кг|килограмм[а-яё]*|грамм[а-яё]*|гр(?![а-яё])|г(?![а-яё])|%|процент[а-яё]*|порци[а-яё]*|порц\.?|шт\.?|штук[а-яё]*|стакан[а-яё]*|kcal(?![a-z])|kg(?![a-z])|mcg(?![a-z])|mg(?![a-z])|ml(?![a-z])|g(?![a-z]))`;
// «2 тыс. ккал», «1,5 тысячи калорий».
const THOUSANDS = String.raw`(тыс(?:\.|яч[а-яё]*)?[ \u00a0\u202f]*)?`;
const QUANTITY = new RegExp(
  String.raw`(?<![\d.,])(${NUMBER})(?:\s*(?:[–—-]|до)\s*(${NUMBER}))?[ \u00a0\u202f]*${THOUSANDS}${UNIT}`,
  'giu',
);
// The unit or the nutrient before the number: «ккал — 2 450», «белок: 30», «калорий = 1800».
const UNIT_FIRST = new RegExp(
  String.raw`(ккал|kcal|калори[а-яё]*|белк[а-яё]*|бел[оа]к|жир[а-яё]*|углевод[а-яё]*|клетчатк[а-яё]*|сахар[а-яё]*)\s*(?:[—–=:]|-\s)\s*(${NUMBER})`,
  'giu',
);
const THOUSANDS_ALONE = new RegExp(
  String.raw`(?<![\d.,])(${NUMBER})[ \u00a0\u202f]*тыс(?:\.|яч[а-яё]*)(?![ \u00a0\u202f]*${UNIT})`,
  'giu',
);
// «650/40»: two numbers that share a «ккал/белок» header.
const RATIO = new RegExp(String.raw`(?<![\d.,/])(${NUMBER})\s*/\s*(${NUMBER})(?![\d.,/])`, 'gu');
/** In tables and «N/M» pairs, numbers from this up are checked (smaller ones are counts and positions). */
export const TABLE_MIN = 10;
const TABLE_ROW = /^\s*\|.*\|/u;
const TABLE_RULE = /^\s*\|[\s:|-]+\|?\s*$/u;
const MONTH = String.raw`(?:январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)`;
// A number in a table cell — not a part of an id, a date («16.11», «16 ноября») or a time («12:30»).
const ROW_NUMBER = new RegExp(
  String.raw`(?<![\p{L}_\d.,:])(${NUMBER})(?![\d.,:]*\d)(?![ \u00a0]*${MONTH})`,
  'giu',
);
const ANY_NUMBER = new RegExp(String.raw`-?(?:${NUMBER})`, 'g');

export function parseRuNumber(text: string): number {
  return Number(text.replace(/[ \u00a0\u202f]/g, '').replace(',', '.'));
}

const decimalsOf = (text: string): number => {
  const m = /[.,](\d+)$/.exec(text.replace(/[ \u00a0\u202f]/g, ''));
  return m?.[1]?.length ?? 0;
};

/** The unit of a number written after a word: kcal for «ккал»/«калорий», otherwise a nutrient in grams or unknown. */
function unitKindOfWord(word: string): UnitKind {
  const w = word.toLowerCase();
  return w.startsWith('ккал') || w.startsWith('kcal') || w.startsWith('калори') ? 'kcal' : 'any';
}

function unitKind(unit: string): UnitKind {
  const u = unit.toLowerCase();
  if (u === 'кг' || u === 'kg' || u.startsWith('килограмм')) return 'kg';
  if (u === 'kcal') return 'kcal';
  if (u === 'mcg') return 'mcg';
  if (u === 'mg') return 'mg';
  if (u === 'ml') return 'ml';
  if (u === 'g') return 'g';
  if (u.startsWith('ккал') || u.startsWith('кило') || u.startsWith('кал')) return 'kcal';
  if (u === 'мкг' || u.startsWith('микро')) return 'mcg';
  if (u === 'мг' || u.startsWith('милиг') || u.startsWith('миллиг')) return 'mg';
  if (u === 'мл' || u.startsWith('миллил')) return 'ml';
  if (u === 'л' || u.startsWith('литр')) return 'l';
  if (u === '%' || u.startsWith('процент')) return 'percent';
  if (u.startsWith('порц') || u.startsWith('шт') || u.startsWith('стакан')) return 'count';
  return 'g';
}

/** Every number with a unit or percent in a text (both ends of a range). */
export function extractQuantities(text: string): QuantifiedNumber[] {
  const out: QuantifiedNumber[] = [];
  const seen = new Set<string>();
  const push = (raw: string, number: string, unit: UnitKind, times = 1) => {
    const value = parseRuNumber(number) * times;
    const key = `${String(value)}|${unit}|${raw}`;
    if (!Number.isFinite(value) || seen.has(key)) return;
    seen.add(key);
    out.push({ value, unit, raw, decimals: times > 1 ? 0 : decimalsOf(number) });
  };
  for (const m of text.matchAll(QUANTITY)) {
    const [raw, first, second, thousands, unit] = m;
    if (!first || !unit) continue;
    const kind = unitKind(unit);
    const times = thousands ? 1000 : 1;
    push(raw, first, kind, times);
    if (second) push(raw, second, kind, times);
  }
  // «ккал — 2 450», «белок: 30»: the unit or the nutrient before the number.
  for (const m of text.matchAll(UNIT_FIRST)) {
    const [raw, word, number] = m;
    if (word && number) push(raw, number, unitKindOfWord(word));
  }
  // «2 тыс.» without a unit, «650/40» (the digest's own kcal/protein pairs).
  for (const m of text.matchAll(THOUSANDS_ALONE)) if (m[1]) push(m[0], m[1], 'any', 1000);
  for (const m of text.matchAll(RATIO))
    for (const n of [m[1], m[2]]) if (n && parseRuNumber(n) >= TABLE_MIN) push(m[0], n, 'any');
  // A table carries its unit in the header: every larger number in a row is checked.
  for (const line of text.split('\n')) {
    if (!TABLE_ROW.test(line) || TABLE_RULE.test(line)) continue;
    for (const m of line.matchAll(ROW_NUMBER)) {
      const n = m[1];
      if (!n || parseRuNumber(n) < TABLE_MIN) continue;
      push(m[0].trim(), n, 'any');
    }
  }
  return out;
}

/** Every number in a source text (JSON or prose) — the pool an answer's numbers are grounded in. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(ANY_NUMBER)) {
    // JSON writes 1500.5; prose writes «1 500,5»: one parser for both (a JSON comma never sits inside a number).
    const value = parseRuNumber(m[0]);
    if (Number.isFinite(value)) out.push(Math.abs(value));
    // «[1,5]» in JSON is two numbers, «1 500» in a table may be two cells: keep the parts too (a wider pool only
    // makes grounding a little more lenient, never stricter).
    if (/[, \u00a0\u202f]/.test(m[0]))
      for (const part of m[0].split(/[, \u00a0\u202f]/)) if (part) out.push(Number(part));
  }
  return out;
}

/** Counts (порции, штуки, стаканы) up to this are allowed as derived from the plan (days, items of a meal). */
export const MAX_DERIVED_COUNT = 14;

/**
 * Whether a number from the answer is grounded in the pool: the same value, the value as rounded for display (to the
 * written decimals, or to tens / hundreds for round numbers of kcal, g and ml), litres ↔ millilitres.
 */
export function isGrounded(
  q: QuantifiedNumber,
  pool: ReadonlySet<number> | readonly number[],
): boolean {
  const values = pool instanceof Set ? [...pool] : (pool as readonly number[]);
  if (q.unit === 'count' && Number.isInteger(q.value) && q.value <= MAX_DERIVED_COUNT) return true;
  const candidates = q.unit === 'l' ? [q.value, q.value * 1000] : [q.value];
  const step = 10 ** -q.decimals;
  return candidates.some((t) =>
    values.some((s) => {
      if (Math.abs(t - s) <= step / 2 + 1e-9) return true;
      const isMl = q.unit === 'l' && t !== q.value;
      if (q.decimals > 0 || isMl) return false;
      // «≈ 440 ккал» for 437.6; «1 500 ккал» for 1 512: rounding to tens / hundreds as people write it.
      if (t >= 100 && t % 10 === 0 && Math.abs(t - s) <= 5) return true;
      if (t >= 1000 && t % 100 === 0 && Math.abs(t - s) <= 50) return true;
      return false;
    }),
  );
}
