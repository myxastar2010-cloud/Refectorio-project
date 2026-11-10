/**
 * Numbers in Russian text (ТЗ 00 §5.6): «1 500» = 1500, «1,5» = 1.5, ranges «10–20 %». The grounding validator extracts
 * every number that carries a unit or a percent from Kiki's answer and looks for it among the numbers of this turn's
 * tool results, the context digest and the user's own words.
 */

export const UNIT_KINDS = ['kcal', 'g', 'mg', 'mcg', 'ml', 'l', 'percent', 'count'] as const;
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
const UNIT = String.raw`(ккал|килокалори[а-яё]*|калори[а-яё]*|кал(?![а-яё])|мкг|микрограмм[а-яё]*|мг|миллиграмм[а-яё]*|мл|миллилитр[а-яё]*|литр[а-яё]*|л(?![а-яё])|грамм[а-яё]*|гр(?![а-яё])|г(?![а-яё])|%|процент[а-яё]*|порци[а-яё]*|порц\.?|шт\.?|штук[а-яё]*|стакан[а-яё]*)`;
const QUANTITY = new RegExp(
  String.raw`(?<![\d.,])(${NUMBER})(?:\s*(?:[–—-]|до)\s*(${NUMBER}))?[ \u00a0\u202f]*${UNIT}`,
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

function unitKind(unit: string): UnitKind {
  const u = unit.toLowerCase();
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
  for (const m of text.matchAll(QUANTITY)) {
    const [raw, first, second, unit] = m;
    if (!first || !unit) continue;
    const kind = unitKind(unit);
    out.push({ value: parseRuNumber(first), unit: kind, raw, decimals: decimalsOf(first) });
    if (second)
      out.push({ value: parseRuNumber(second), unit: kind, raw, decimals: decimalsOf(second) });
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
