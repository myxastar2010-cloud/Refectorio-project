/**
 * Russian text for search and term resolution: normalisation (lower case, ё → е, punctuation out), tokens, a Russian
 * stemmer and a one-edit typo test. The stemmer follows the published Snowball «Russian stemming algorithm»
 * (snowballstem.org/algorithms/russian/stemmer.html), written here from its description.
 */

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim();
}

export type Token = {
  readonly word: string;
  readonly stem: string;
  readonly start: number;
  readonly end: number;
};

/** Words with their stems and spans in the ORIGINAL text (for highlighting). */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const lower = text.toLowerCase().replaceAll('ё', 'е');
  const re = /[a-zа-я0-9]+/g;
  for (let m = re.exec(lower); m; m = re.exec(lower)) {
    tokens.push({ word: m[0], stem: stem(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

const VOWELS = new Set('аеиоуыэюя');

/** RV: after the first vowel. R1: after the first non-vowel that follows a vowel. R2: the same inside R1. */
function regions(word: string): { rv: number; r2: number } {
  let rv = word.length;
  for (let i = 0; i < word.length; i += 1) {
    if (VOWELS.has(word[i] ?? '')) {
      rv = i + 1;
      break;
    }
  }
  const after = (from: number): number => {
    for (let i = from + 1; i < word.length; i += 1) {
      if (!VOWELS.has(word[i] ?? '') && VOWELS.has(word[i - 1] ?? '')) return i + 1;
    }
    return word.length;
  };
  const r1 = after(0);
  return { rv, r2: after(r1) };
}

const byLength = (list: readonly string[]) => [...list].sort((a, b) => b.length - a.length);

// Group 1 endings must follow «а» or «я» (which stays); group 2 endings stand alone.
const PERFECTIVE_GERUND_1 = byLength(['в', 'вши', 'вшись']);
const PERFECTIVE_GERUND_2 = byLength(['ив', 'ивши', 'ившись', 'ыв', 'ывши', 'ывшись']);
const ADJECTIVE = byLength([
  'ее',
  'ие',
  'ые',
  'ое',
  'ими',
  'ыми',
  'ей',
  'ий',
  'ый',
  'ой',
  'ем',
  'им',
  'ым',
  'ом',
  'его',
  'ого',
  'ему',
  'ому',
  'их',
  'ых',
  'ую',
  'юю',
  'ая',
  'яя',
  'ою',
  'ею',
]);
const PARTICIPLE_1 = byLength(['ем', 'нн', 'вш', 'ющ', 'щ']);
const PARTICIPLE_2 = byLength(['ивш', 'ывш', 'ующ']);
const REFLEXIVE = byLength(['ся', 'сь']);
const VERB_1 = byLength([
  'ла',
  'на',
  'ете',
  'йте',
  'ли',
  'й',
  'л',
  'ем',
  'н',
  'ло',
  'но',
  'ет',
  'ют',
  'ны',
  'ть',
  'ешь',
  'нно',
]);
const VERB_2 = byLength([
  'ила',
  'ыла',
  'ена',
  'ейте',
  'уйте',
  'ите',
  'или',
  'ыли',
  'ей',
  'уй',
  'ил',
  'ыл',
  'им',
  'ым',
  'ен',
  'ило',
  'ыло',
  'ено',
  'ят',
  'ует',
  'уют',
  'ит',
  'ыт',
  'ены',
  'ить',
  'ыть',
  'ишь',
  'ую',
  'ю',
]);
const NOUN = byLength([
  'а',
  'ев',
  'ов',
  'ие',
  'ье',
  'е',
  'иями',
  'ями',
  'ами',
  'еи',
  'ии',
  'и',
  'ией',
  'ей',
  'ой',
  'ий',
  'й',
  'иям',
  'ям',
  'ием',
  'ем',
  'ам',
  'ом',
  'о',
  'у',
  'ах',
  'иях',
  'ях',
  'ы',
  'ь',
  'ию',
  'ью',
  'ю',
  'ия',
  'ья',
  'я',
]);
const SUPERLATIVE = byLength(['ейш', 'ейше']);
const DERIVATIONAL = byLength(['ост', 'ость']);

/** The length of the longest ending of `list` inside region [from…), or 0. */
function ending(word: string, from: number, list: readonly string[], afterAYa = false): number {
  for (const suffix of list) {
    if (!word.endsWith(suffix)) continue;
    const start = word.length - suffix.length;
    if (start < from) continue;
    if (afterAYa) {
      const before = word[start - 1];
      if (start - 1 < from || (before !== 'а' && before !== 'я')) continue;
    }
    return suffix.length;
  }
  return 0;
}

const cut = (word: string, n: number) => word.slice(0, word.length - n);

export function stem(input: string): string {
  let word = input.toLowerCase().replaceAll('ё', 'е');
  if (word.length < 3 || !/^[а-я]+$/.test(word)) return word;
  const { rv, r2 } = regions(word);

  // Step 1.
  const gerund = Math.max(
    ending(word, rv, PERFECTIVE_GERUND_1, true),
    ending(word, rv, PERFECTIVE_GERUND_2),
  );
  if (gerund > 0) {
    word = cut(word, gerund);
  } else {
    const reflexive = ending(word, rv, REFLEXIVE);
    if (reflexive > 0) word = cut(word, reflexive);
    const adjective = ending(word, rv, ADJECTIVE);
    if (adjective > 0) {
      word = cut(word, adjective);
      const participle = Math.max(
        ending(word, rv, PARTICIPLE_1, true),
        ending(word, rv, PARTICIPLE_2),
      );
      if (participle > 0) word = cut(word, participle);
    } else {
      const verb = Math.max(ending(word, rv, VERB_1, true), ending(word, rv, VERB_2));
      if (verb > 0) word = cut(word, verb);
      else {
        const noun = ending(word, rv, NOUN);
        if (noun > 0) word = cut(word, noun);
      }
    }
  }
  // Step 2.
  if (word.endsWith('и') && word.length - 1 >= rv) word = cut(word, 1);
  // Step 3.
  const derivational = ending(word, r2, DERIVATIONAL);
  if (derivational > 0) word = cut(word, derivational);
  // Step 4.
  if (word.endsWith('нн') && word.length - 2 >= rv) {
    word = cut(word, 1);
  } else {
    const superlative = ending(word, rv, SUPERLATIVE);
    if (superlative > 0) {
      word = cut(word, superlative);
      if (word.endsWith('нн')) word = cut(word, 1);
    } else if (word.endsWith('ь') && word.length - 1 >= rv) {
      word = cut(word, 1);
    }
  }
  return word;
}

/**
 * Optimal string alignment distance ≤ 1 (one insertion, deletion, substitution or swap of neighbours): «гречка» ~
 * «гречак». Callers allow it only for words of 5+ letters.
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i += 1;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swap
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
