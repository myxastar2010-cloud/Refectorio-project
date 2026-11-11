/**
 * Checks of Kiki's final text (ТЗ 07 §8), run on the server before the turn ends: number grounding (00 §5.6), identity,
 * medical lexicon (no diagnoses, no dosing), links, length, language; raw HTML is stripped. A failed check means one
 * corrective re-ask listing the problems, then a safe fallback (the server decides; this module only judges).
 */
import { extractNumbers, extractQuantities, isGrounded } from './numbers';

export const ISSUE_CODES = [
  'ungroundedNumber',
  'identity',
  'diagnosis',
  'dosing',
  'link',
  'tooLong',
  'notRussian',
  'empty',
  'quietNumbers',
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];
export type Issue = { readonly code: IssueCode; readonly detail?: string };

export type GroundingSources = {
  /** Contents of this turn's tool results (JSON or text). */
  readonly toolResults: readonly string[];
  readonly digest: string;
  /** The user's messages of this turn (people may quote their own numbers back). */
  readonly userTexts: readonly string[];
};

export const IDENTITY_RU = 'Я — KI k1, персональный ИИ-агент сервиса ПроЛанч.';

// Vendors and model families Kiki must never name (ТЗ 07 §1). Words people also use otherwise («мета», «гугл») are left out.
const VENDOR =
  /(?<![a-zа-яё])(deep\s?seek|mistral|glm-?\d|zhipu|z\.ai|nvidia|nemotron|kimi|moonshot|open\s?ai|chat\s?gpt|gpt-?\d|claude|anthropic|llama|qwen|gemini|gigachat|yandex\s?gpt|дипсик|мистрал[ья]|нвидиа|чат\s?гпт|клод[а-я]*|гигачат|яндекс\s?гпт)(?![a-zа-яё])/iu;

const DIAGNOSIS =
  /у\s+вас[,\s]+(?:скорее\s+всего|вероятно|наверное|похоже|видимо)?[,\s]*(сахарный\s+)?(диабет|анеми[яи]|гипотиреоз|гипертони[яи]|подагр[аы]|целиаки[яи]|ожирени[ея]|булими[яи]|анорекси[яи]|рпп|расстройств[оа]\s+пищев|дефицит\s+(?:железа|витамин|в12|b12))/iu;
const DOSE_UNIT =
  /\d[\d\s.,]*\s*(ме|iu|таблет[а-яё]*|капсул[а-яё]*|драже|ампул[а-яё]*)(?![а-яё])/iu;
const DOSE_VERB =
  /(принимайте|принимать|пропейте|пейте\s+по|начните\s+принимать|назнача[а-яё]*|дозиров[а-яё]*|добавьте\s+(?:в\s+рацион\s+)?(?:добавк|бад|витамин))/iu;
const MEDICINE =
  /(витамин|добавк|бад(?![а-яё])|препарат|лекарств|таблет|капсул|омега|магни[йя]|желез[оа]\s+в\s+таблет|цинк|йод(?![а-яё])|мелатонин|метформин|инсулин|аспирин|ибупрофен|антибиотик|статин)/iu;
const NUMBER_WITH_MASS = /\d[\d\s.,]*\s*(мг|мкг|г)(?![а-яё])/iu;

const URL = /https?:\/\/[^\s)<>»"']+/giu;
/** The site itself: links to it are always fine. */
export const SITE_HOSTS = [
  'refectorio.onrender.com',
  'myxastar2010-cloud.github.io',
  'localhost',
  '127.0.0.1',
];
/** A URL as written in prose or JSON: without the sentence's last dot or comma. */
const trimUrl = (url: string) => url.replace(/[.,;:!?]+$/u, '');

/** The digest's flag line (client/digest.ts) for people who asked not to see numbers. */
const QUIET_FLAG = /deemphasizeNumbers=да/u;
/** Water (мл, л, стаканы) and counts stay: they are not what the screening flag is about. */
const QUIET_UNITS = new Set<string>(['kcal', 'g', 'kg', 'mg', 'mcg', 'percent', 'any']);

export const MAX_ANSWER_CHARS = 1500;
export const MAX_TABLE_ANSWER_CHARS = 3000;

export function sanitizeMarkdown(text: string): string {
  return text
    .replace(/<\/?[a-z][^>]*>/giu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+|\n+/u).filter(Boolean);
}

export function groundingPool(sources: GroundingSources): Set<number> {
  const pool = new Set<number>();
  // Dates («2026-11-11») are not amounts: their parts would ground any «11 %» (review of phase 5, M2).
  for (const text of [...sources.toolResults, sources.digest, ...sources.userTexts])
    for (const n of extractNumbers(text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' '))) pool.add(n);
  return pool;
}

export function ungroundedNumbers(text: string, sources: GroundingSources): string[] {
  const pool = groundingPool(sources);
  const out: string[] = [];
  for (const q of extractQuantities(text)) if (!isGrounded(q, pool)) out.push(q.raw.trim());
  return [...new Set(out)];
}

function hostOf(url: string): string | null {
  try {
    return new globalThis.URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function validateAnswer(text: string, sources: GroundingSources): Issue[] {
  const issues: Issue[] = [];
  const clean = text.trim();
  if (clean.length === 0) return [{ code: 'empty' }];

  for (const raw of ungroundedNumbers(clean, sources))
    issues.push({ code: 'ungroundedNumber', detail: raw });

  // The screening flag (eating-disorder history): no calories, grams or percent at all, even grounded or asked for —
  // the guardrail never rests on the prompt alone (review of phase 5, M10).
  if (QUIET_FLAG.test(sources.digest))
    for (const q of extractQuantities(clean))
      if (QUIET_UNITS.has(q.unit)) {
        issues.push({ code: 'quietNumbers', detail: q.raw });
        break;
      }

  const vendor = VENDOR.exec(clean);
  if (vendor) issues.push({ code: 'identity', detail: vendor[0] });

  const diagnosis = DIAGNOSIS.exec(clean);
  if (diagnosis) issues.push({ code: 'diagnosis', detail: diagnosis[0] });

  for (const sentence of sentences(clean)) {
    const doseUnit = DOSE_UNIT.exec(sentence);
    const dosing =
      (doseUnit && MEDICINE.test(sentence)) ||
      (DOSE_VERB.test(sentence) && MEDICINE.test(sentence) && NUMBER_WITH_MASS.test(sentence));
    if (dosing) {
      issues.push({ code: 'dosing', detail: sentence.slice(0, 80) });
      break;
    }
  }

  // Links: the site's own hosts, or a URL exactly as a tool of this turn returned it — not any *.github.io page and
  // not a prefix of an allowed link (review of phase 5, minor 1).
  const allowed = new Set(sources.toolResults.flatMap((t) => t.match(URL) ?? []).map(trimUrl));
  for (const url of clean.match(URL) ?? []) {
    const host = hostOf(url);
    const fine = host !== null && (SITE_HOSTS.includes(host) || allowed.has(trimUrl(url)));
    if (!fine) issues.push({ code: 'link', detail: url });
  }

  const hasTable = /\n\|?\s*:?-{3,}/.test(clean);
  if (clean.length > (hasTable ? MAX_TABLE_ANSWER_CHARS : MAX_ANSWER_CHARS))
    issues.push({ code: 'tooLong', detail: String(clean.length) });

  const letters = clean.match(/\p{L}/gu) ?? [];
  const cyrillic = clean.match(/[а-яё]/giu) ?? [];
  if (letters.length >= 40 && cyrillic.length / letters.length < 0.5)
    issues.push({ code: 'notRussian' });

  return issues;
}

/** The corrective instruction for one re-ask (English: it is for the model, not the person). */
export function correctionPrompt(issues: readonly Issue[]): string {
  const lines: string[] = [];
  const numbers = issues.filter((i) => i.code === 'ungroundedNumber').map((i) => i.detail);
  if (numbers.length > 0)
    lines.push(
      `These numbers are not in this turn's tool results or the context: ${numbers.join(', ')}. Remove them or replace them with numbers that are; never compute or estimate numbers yourself.`,
    );
  if (issues.some((i) => i.code === 'identity'))
    lines.push(
      `Do not name any AI vendor or model. If asked who you are, say exactly: «${IDENTITY_RU}»`,
    );
  if (issues.some((i) => i.code === 'diagnosis'))
    lines.push('Do not state or suggest a diagnosis; suggest seeing a doctor instead.');
  if (issues.some((i) => i.code === 'dosing'))
    lines.push(
      'Do not give doses or schedules for medicines or supplements; say that a doctor decides that.',
    );
  if (issues.some((i) => i.code === 'link'))
    lines.push('Remove links that did not come from this turn’s tool results.');
  if (issues.some((i) => i.code === 'tooLong'))
    lines.push('Make the answer much shorter: 1–4 sentences, a list only if needed.');
  if (issues.some((i) => i.code === 'quietNumbers'))
    lines.push(
      'This person asked not to see numbers: no calories, grams, kilograms or percent at all, even if asked — describe food and portions in words.',
    );
  if (issues.some((i) => i.code === 'notRussian')) lines.push('Answer in Russian.');
  if (issues.some((i) => i.code === 'empty')) lines.push('Write a short answer in Russian.');
  return `Your previous answer failed an automatic check. Rewrite it (no tool calls), keep everything else:\n- ${lines.join('\n- ')}`;
}

/** The safe sentence when the corrected answer still fails (ТЗ 00 §5.6). */
export function fallbackAnswer(issues: readonly Issue[]): string {
  if (issues.some((i) => i.code === 'identity')) return IDENTITY_RU;
  if (issues.some((i) => i.code === 'dosing' || i.code === 'diagnosis'))
    return 'С этим вопросом лучше к врачу: он учтёт ваше здоровье и анализы. А с меню и привычками я помогу.';
  if (issues.some((i) => i.code === 'quietNumbers'))
    return 'Давайте без цифр: меню уже собрано под вас. Могу рассказать, что в нём, или помочь что-то поменять.';
  if (issues.some((i) => i.code === 'ungroundedNumber'))
    return 'Не хочу называть цифры наугад. Точные значения — в подробностях блюда, во вкладке «КБЖУ», и в карточке дня.';
  return 'Не получилось ответить как следует. Попробуйте переформулировать вопрос.';
}
