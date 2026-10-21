import type { HealthChipId } from '../../../content/quizSchema';

/**
 * Free text of the «+» health panel → health chips (stage 3, 4.13). Since the design shows only five chips, the
 * conditions that drive safety rules but have no chip of their own (kidney disease, PKU, an eating disorder, warfarin,
 * MAO inhibitors, breastfeeding) are found in what people type. Whole words and word stems only — never raw
 * substrings («инсулинорезистентность» is not «инсулин», «предиабет» is not «диабет»). A match the text puts in doubt
 * — a negation («нет проблем с почками»), somebody else («мама на диализе»), a false friend («камни в почках») — is
 * returned as `confident: false`: the chip appears unticked and the person decides. The typed text is always kept
 * verbatim as well. Reviewed by science-fact-checker (refectorio-workspace/reports/stage-3/review-health-synonyms.md).
 */
export type HealthMatch = { readonly chip: HealthChipId; readonly confident: boolean };

/** One word of a pattern: a full-token regular expression. */
type Word = RegExp;
type Pattern = readonly Word[];

const L = '\\p{L}*';
const w = (source: string): Word => new RegExp(`^(?:${source})$`, 'u');

type Entry = {
  readonly chip: HealthChipId;
  /** Words or phrases that name the condition itself. */
  readonly names: readonly Pattern[];
  /** General words («почки»): doubtful when one of `doubt` stands in the same clause («камни в почках»). */
  readonly vague?: readonly Pattern[];
  readonly doubt?: readonly Word[];
  /** Words that may or may not mean the condition («щитовидка»): always shown unticked. */
  readonly unsure?: readonly Pattern[];
  /** Phrases that name something else entirely: no match at all. */
  readonly not?: readonly Pattern[];
};

const ENTRIES: readonly Entry[] = [
  {
    chip: 'kidneyDisease',
    names: [
      [w('хбп')],
      [w(`диализ${L}`)],
      [w(`гемодиализ${L}`)],
      [w(`нефропати${L}`)],
      [w(`гломерулонефрит${L}`)],
      [w(`почечн${L}`), w(`недостаточност${L}`)],
    ],
    vague: [[w(`почк${L}|почек`)], [w(`почечн${L}`)]],
    // Stones, sand and a passing infection are not chronic kidney disease, but the person may still want the chip.
    doubt: [
      w(`камн${L}|камен${L}|камень`),
      w('песок|песка|песке'),
      w(`пиелонефрит${L}`),
      w(`цистит${L}`),
      w(`колик${L}`),
    ],
  },
  { chip: 'pku', names: [[w('фку')], [w(`фенилкетонури${L}`)]] },
  {
    chip: 'warfarin',
    names: [[w(`варфарин${L}`)], [w(`варфарекс${L}`)], [w(`марфарин${L}`)]],
  },
  {
    chip: 'maoi',
    names: [
      [w('мао|имао')],
      [w(`ингибитор${L}`), w(`моноаминоксидаз${L}`)],
      [w(`фенелзин${L}`)],
      [w(`транилципромин${L}`)],
      [w(`изокарбоксазид${L}`)],
      [w(`моклобемид${L}`)],
      [w(`аурорикс${L}`)],
      [w(`селегилин${L}`)],
      [w(`разагилин${L}`)],
      [w(`линезолид${L}`)],
    ],
  },
  {
    chip: 'eatingDisorder',
    names: [
      [w('рпп')],
      [w(`анорекси${L}`)],
      [w(`булими${L}`)],
      [w(`орторекси${L}`)],
      [w(`компульсивн${L}`), w(`переедани${L}`)],
      [w(`приступ${L}`), w(`переедани${L}`)],
      [w(`расстройств${L}`), w(`пищев${L}`)],
      [w(`пищев${L}`), w(`расстройств${L}`)],
    ],
  },
  {
    chip: 'lactation',
    names: [
      [w(`корм${L}`), w(`груд${L}`)],
      [w(`грудн${L}`), w(`вскармлива${L}`)],
      [w('гв')],
      [w(`лактаци${L}`)],
      [w(`кормящ${L}`)],
    ],
  },
  {
    chip: 'diabetes',
    names: [
      [w(`диабет${L}`)],
      [w('сд'), w('1|2')],
      [w('сд1|сд2')],
      [w('инсулин|инсулина|инсулину|инсулином|инсулине|инсулины|инсулинов')],
    ],
  },
  {
    chip: 'insulinResistance',
    names: [
      [w(`инсулинорезистентн${L}`)],
      [w(`предиабет${L}`)],
      [w(`преддиабет${L}`)],
      [w('нтг')],
      [w(`нарушен${L}`), w(`толерантност${L}`)],
    ],
  },
  {
    chip: 'hypertension',
    names: [
      [w(`гипертони${L}`)],
      [w(`гипертенз${L}`)],
      [w(`высок${L}|повышенн${L}`), w(`давлени${L}`)],
    ],
    not: [[w(`низк${L}|пониженн${L}`), w(`давлени${L}`)], [w(`гипотони${L}`)]],
  },
  {
    chip: 'hypothyroidism',
    names: [
      [w(`гипотиреоз${L}`)],
      [w(`левотироксин${L}`)],
      [w(`тироксин${L}`)],
      [w(`эутирокс${L}`)],
      [w(`баготирокс${L}`)],
    ],
    // The thyroid in general: maybe hypothyroidism, maybe not — asked, not ticked.
    unsure: [[w(`щитовидк${L}|щитовидн${L}`)]],
    not: [[w(`гипертиреоз${L}`)], [w(`тиреотоксикоз${L}`)]],
  },
  {
    chip: 'pregnancy',
    names: [[w(`беремен${L}`)], [w('жду|ждем'), w(`ребенк${L}|малыш${L}`)]],
  },
];

/** A negation shortly before the name: «нет», «не», «без», «никогда». */
const NEGATION = w('не|нет|без|никогда|ни');
/** Somebody else's condition: «у мамы», «муж на диализе». */
const SOMEBODY_ELSE = w(
  `мам${L}|мать|матер${L}|пап${L}|отц${L}|отец|бабушк${L}|бабул${L}|дедушк${L}|дед|деда|муж${L}|жен${L}|брат${L}|сестр${L}|сын${L}|доч${L}|родител${L}|друг${L}|подруг${L}|родствен${L}|знаком${L}`,
);
/** How many words before a name a negation or a relative still applies to it… */
const LOOK_BACK = 3;
/** …and after it («диабета нет», «почки не болят»). */
const LOOK_AHEAD = 2;
/** Words of a phrase may stand this many words apart («кормлю сейчас грудью»). */
const MAX_GAP = 1;

/** Lower case, ё → е, everything but letters and digits is a word break; clauses split on punctuation and «но», «а». */
function clauses(text: string): string[][] {
  return text
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .split(/[,.;:!?()\n]|\s+(?:но|а|однако)\s+/u)
    .map((clause) =>
      clause
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .split(' ')
        .filter(Boolean),
    )
    .filter((tokens) => tokens.length > 0);
}

/** Where a pattern starts in the tokens (each next word at most MAX_GAP words after the previous one), or −1. */
function find(tokens: readonly string[], pattern: Pattern, from = 0): number {
  for (let start = from; start < tokens.length; start += 1) {
    const first = pattern[0];
    if (!first || !first.test(tokens[start] ?? '')) continue;
    let at = start;
    let ok = true;
    for (const word of pattern.slice(1)) {
      let next = -1;
      for (let j = at + 1; j <= at + 1 + MAX_GAP && j < tokens.length; j += 1) {
        if (word.test(tokens[j] ?? '')) {
          next = j;
          break;
        }
      }
      if (next < 0) {
        ok = false;
        break;
      }
      at = next;
    }
    if (ok) return start;
  }
  return -1;
}

const anyBefore = (tokens: readonly string[], index: number, word: Word) =>
  tokens.slice(Math.max(0, index - LOOK_BACK), index).some((token) => word.test(token));
const anyAfter = (tokens: readonly string[], index: number, word: Word) =>
  tokens.slice(index + 1, index + 1 + LOOK_AHEAD).some((token) => word.test(token));

/** The chips a typed text names; each chip once, a confident match wins over a doubtful one. */
export function matchHealthChips(text: string): HealthMatch[] {
  const found = new Map<HealthChipId, boolean>();
  const note = (chip: HealthChipId, confident: boolean) => {
    found.set(chip, (found.get(chip) ?? false) || confident);
  };
  for (const tokens of clauses(text)) {
    for (const entry of ENTRIES) {
      if (entry.not?.some((pattern) => find(tokens, pattern) >= 0)) continue;
      const somebodyElseOrNot = (at: number) =>
        anyBefore(tokens, at, NEGATION) ||
        anyAfter(tokens, at, NEGATION) ||
        anyBefore(tokens, at, SOMEBODY_ELSE);
      for (const pattern of entry.names) {
        const at = find(tokens, pattern);
        if (at >= 0) note(entry.chip, !somebodyElseOrNot(at));
      }
      const doubted =
        entry.doubt?.some((word) => tokens.some((token) => word.test(token))) ?? false;
      for (const pattern of entry.vague ?? []) {
        const at = find(tokens, pattern);
        if (at >= 0) note(entry.chip, !doubted && !somebodyElseOrNot(at));
      }
      for (const pattern of entry.unsure ?? []) {
        if (find(tokens, pattern) >= 0) note(entry.chip, false);
      }
    }
  }
  return [...found].map(([chip, confident]) => ({ chip, confident }));
}
