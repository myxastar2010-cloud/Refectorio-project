import type { AllergenChipId } from '../../../content/quizSchema';

/**
 * Free text of the «+» allergy panel → allergen chips (ТЗ §8.5, research/stage-2-mappings.md §4.2–4.3).
 * The typed text is always kept verbatim for stage 3; a match only additionally ticks a chip. Whole tokens only
 * (JavaScript's \b and \w do not know Cyrillic, so the text is split on non-letters): «сельдерей» is celery, not
 * «сельдь»; «пшено» is not wheat; «сырники» are not «сыр». Ambiguous words («рак», «икра», «орех», «морепродукты»,
 * «вино») tick nothing — a wrong exclusion is worse than none, and the text still reaches stage 3.
 */
type Rule = { readonly chip: AllergenChipId; readonly token: RegExp };

const rule = (chip: AllergenChipId, ...patterns: readonly string[]): Rule[] =>
  patterns.map((pattern) => ({ chip, token: new RegExp(`^(?:${pattern})$`, 'u') }));

const L = '\\p{L}*';

/** Phrases first: «земляной орех» is peanut, «кокосовое молоко» is not milk. */
const PHRASES: readonly { readonly chip: AllergenChipId | null; readonly phrase: RegExp }[] = [
  { chip: 'peanut', phrase: /(^|\s)земляно\p{L}*\s+орех\p{L}*/u },
  { chip: 'sulphites', phrase: /(^|\s)диоксид\p{L}*\s+серы/u },
  { chip: null, phrase: /(^|\s)молочн\p{L}*\s+кислот\p{L}*/u },
  { chip: 'treeNut', phrase: /(^|\s)(кокосов|миндальн)\p{L}*\s+молок\p{L}*/u },
  { chip: 'gluten', phrase: /(^|\s)овсян\p{L}*\s+молок\p{L}*/u },
  { chip: 'soy', phrase: /(^|\s)соев\p{L}*\s+молок\p{L}*/u },
  { chip: null, phrase: /(^|\s)рисов\p{L}*\s+молок\p{L}*/u },
];

const TOKENS: readonly Rule[] = [
  ...rule('celery', `сельдере${L}`),
  ...rule('fish', 'сельдь|сельди|сельдью|сельдей|сельдями'),
  ...rule(
    'crustacean',
    `креветк${L}`,
    `краб${L}`,
    `лобстер${L}`,
    `омар${L}`,
    `лангуст${L}`,
    'криль',
    `ракообразн${L}`,
    `рачк${L}`,
  ),
  ...rule(
    'mollusc',
    'мидии|мидий|мидиям|мидия',
    `кальмар${L}`,
    `осьминог${L}`,
    `устриц${L}`,
    `гребешк${L}`,
    'гребешок',
    `рапан${L}`,
    `каракатиц${L}`,
    `моллюск${L}`,
  ),
  ...rule(
    'fish',
    `рыб${L}`,
    `лосос${L}`,
    `семг${L}`,
    `форел${L}`,
    'тунец',
    `тунц${L}`,
    `скумбри${L}`,
    `сардин${L}`,
    `шпрот${L}`,
    `кильк${L}`,
    'килька',
    `треск${L}`,
    `минта${L}`,
    `хек${L}`,
    `судак${L}`,
    'щука|щуки|щуку|щукой',
    'карп|карпа|карпу|карпом|карпы|карпов',
    'окунь|окуня|окуню|окунем|окуни',
    `горбуш${L}`,
  ),
  ...rule('mustard', `горчиц${L}`, `горчичн${L}`),
  ...rule('lupin', `люпин${L}`),
  ...rule('sulphites', `сульфит${L}`, 'e22\\d', 'е22\\d'),
  ...rule('aspartame', `аспартам${L}`),
  ...rule(
    'gluten',
    `пшениц${L}`,
    `пшеничн${L}`,
    'рожь|ржи',
    `ржан${L}`,
    `ячмен${L}`,
    `перлов${L}`,
    'овес|овса|овсом',
    `глютен${L}`,
    `клейковин${L}`,
    'манка|манки|манку|манной|манная',
    'булгур',
    'кускус',
    'полба',
    `спельт${L}`,
    `семолин${L}`,
    'сейтан',
  ),
  ...rule('lactose', `лактоз${L}`),
  ...rule(
    'milk',
    `молок${L}`,
    `молочн${L}`,
    `казеин${L}`,
    'творог',
    `творож${L}`,
    `кефир${L}`,
    `йогурт${L}`,
    `сливк${L}`,
    `сливочн${L}`,
    `сметан${L}`,
    `ряженк${L}`,
    'сыр|сыра|сыру|сыры|сыров|сырам|сыром',
  ),
  ...rule(
    'egg',
    `яйц${L}`,
    'яиц',
    'яичный|яичная|яичное|яичные|яичного|яичной',
    `омлет${L}`,
    `меренг${L}`,
  ),
  ...rule(
    'treeNut',
    'кешью',
    `фундук${L}`,
    `миндал${L}`,
    `грецк${L}`,
    `пекан${L}`,
    `фисташ${L}`,
    `макадами${L}`,
  ),
  ...rule('peanut', `арахис${L}`),
  ...rule('sesame', `кунжут${L}`, `сезам${L}`, `тахин${L}`),
  ...rule('soy', 'соя|сои|сою|соей', `соев${L}`, 'тофу', 'эдамаме', 'мисо', 'темпе'),
];

const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е');

/** Chips that the typed item matches (empty when nothing clear is found). */
export function matchAllergenChips(text: string): AllergenChipId[] {
  let rest = ` ${normalize(text)} `;
  const found = new Set<AllergenChipId>();
  for (const { chip, phrase } of PHRASES) {
    if (phrase.test(rest)) {
      if (chip) found.add(chip);
      rest = rest.replace(phrase, ' ');
    }
  }
  for (const token of rest.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const match = TOKENS.find((r) => r.token.test(token));
    if (match) found.add(match.chip);
  }
  return [...found];
}
