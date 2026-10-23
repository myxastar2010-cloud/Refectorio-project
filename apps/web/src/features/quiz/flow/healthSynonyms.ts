import type { HealthChipId } from '../../../content/quizSchema';
import { RISKY_HEALTH_CHIPS, SHOWN_HEALTH_CHIPS } from './healthChips';

/**
 * Free text of the «+» health panel → health chips (stage 3, 4.13). Since the design shows only five chips, the
 * conditions that drive safety rules but have no chip of their own (kidney disease, PKU, an eating disorder, warfarin,
 * MAO inhibitors, breastfeeding) are found in what people type. Whole words and word stems only — never raw
 * substrings («инсулинорезистентность» is not «инсулин», «предиабет» is not «диабет»).
 *
 * Every match gets a verdict (review-health-synonyms.md, sections D–G):
 * - nothing — the phrase names something else («несахарный диабет», «внутриглазное давление»), or a shown chip is
 *   denied («нет диабета») or is somebody else's («диабет у мамы»);
 * - unticked (`confident: false`: the chip appears, the person decides) — a hidden chip denied («никаких проблем с
 *   почками»), a risky hidden chip of somebody else («диализ у отца»), doubt or a question («подозрение на
 *   гипотиреоз»), the past or a plan of a passing state («закончила ГВ», «планирую беременность»), a word that may or
 *   may not mean the condition («щитовидка», «линезолид»), a typo («варфорин»);
 * - ticked — everything else. A ticked match wins over an unticked one.
 * The typed text is always kept verbatim as well. Reviewed by science-fact-checker
 * (refectorio-workspace/reports/stage-3/review-health-synonyms.md).
 */
export type HealthMatch = { readonly chip: HealthChipId; readonly confident: boolean };

/** Who a text is about: the person, or the child a parent fills the quiz for (family mode: «у сына ФКУ» — the child). */
export type HealthSubject = 'self' | 'child';

/** One word of a pattern: a full-token regular expression. */
type Word = RegExp;
type Pattern = readonly Word[];
/** Token indices of a match, both ends included. */
type Span = { readonly start: number; readonly end: number };

const L = '\\p{L}*';
const w = (source: string): Word => new RegExp(`^(?:${source})$`, 'u');
/** Any word beginning with one of the stems. */
const stem = (...stems: readonly string[]): Word => w(stems.map((s) => `${s}${L}`).join('|'));

type Entry = {
  readonly chip: HealthChipId;
  /** Words or phrases that name the condition or its drug: ticked. */
  readonly names: readonly Pattern[];
  /** General words («почки»): ticked unless a `doubt` word stands in the same clause («камни в почках»). */
  readonly vague?: readonly Pattern[];
  readonly doubt?: readonly Word[];
  /** Words that may or may not mean the condition («щитовидка», «линезолид»): unticked. */
  readonly unsure?: readonly Pattern[];
  /** A name inside such a phrase is in doubt («острая почечная недостаточность»). */
  readonly demote?: readonly Pattern[];
  /** A name inside such a phrase is something else entirely («несахарный диабет»): nothing. */
  readonly not?: readonly Pattern[];
  /** A state that passes (pregnancy, breastfeeding, a drug): its past or a plan puts it in doubt. */
  readonly passing?: boolean;
  /** Long words whose typos are caught (H13): a near miss is unticked, never ticked. */
  readonly typos?: readonly string[];
};

const INSULIN = w('инсулин|инсулина|инсулину|инсулином|инсулине|инсулины|инсулинов');
const HIGH = stem('высок', 'повыш');
const PRESSURE = stem('давлени');
const THYROID = stem('щитовидк', 'щитовидн');
/** The breast in «кормлю грудью», never «грудка» or «грудинка» (H12). */
const BREAST = w('грудью|груди|грудь|грудным|грудное|грудного|грудном');
const SUGAR_HIGH: readonly Pattern[] = [
  [stem('сахар'), HIGH],
  [HIGH, stem('сахар')],
];
const INSULIN_HIGH: readonly Pattern[] = [
  [HIGH, INSULIN],
  [INSULIN, HIGH],
];
const METFORMIN = stem('метформин', 'глюкофаж', 'сиофор');

const ENTRIES: readonly Entry[] = [
  {
    chip: 'kidneyDisease',
    names: [
      [w('хбп|хпн|ckd|dialysis')],
      [stem('диализ', 'гемодиализ', 'нефропати', 'гломерулонефрит')],
      [stem('почечн'), stem('недостаточност')],
      [stem('недостаточност'), w('почек')],
      [stem('нефротическ'), stem('синдром')],
      [stem('поликистоз'), w(`почк${L}|почек`)],
    ],
    vague: [[w(`почк${L}|почек`)], [stem('почечн')]],
    // Stones, sand and a passing infection are not chronic kidney disease, but the person may still want the chip.
    doubt: [
      w(`камн${L}|камен${L}|камень`),
      w('песок|песка|песке'),
      stem('колик', 'мочекаменн', 'цистит'),
    ],
    unsure: [
      [w('нефрит|нефрита|нефритом|скф|опн|опп')],
      [stem('креатинин', 'нефролог', 'пиелонефрит', 'нефрэктоми')],
    ],
    demote: [
      [stem('одн', 'единствен', 'удал'), w(`почк${L}`)],
      [stem('остр'), stem('почечн')],
    ],
    not: [[stem('говяж', 'свин', 'курин', 'берез', 'теляч', 'баран'), w(`почк${L}`)]],
    typos: ['гемодиализ', 'гломерулонефрит', 'нефропатия'],
  },
  {
    chip: 'pku',
    names: [
      [w('фку|пку|pku|kuvan|бн4')],
      [stem('фенилкетонури', 'сапроптерин', 'куван')],
      [stem('дефицит'), stem('фенилаланингидроксилаз')],
    ],
    // Phenylalanine and aspartame name a substance, not the diagnosis; mild hyperphenylalaninaemia may need no diet.
    unsure: [[stem('гиперфенилаланинеми', 'фенилаланин', 'аспартам')], [w('e951|е951')]],
    typos: ['фенилкетонурия'],
  },
  {
    chip: 'warfarin',
    passing: true,
    names: [
      [stem('варфарин', 'варфарекс', 'мареван', 'варфалан')],
      [w('warfarin|coumadin|jantoven|marevan|мно|inr')],
    ],
    // Other anticoagulants need no steady vitamin K; a mechanical valve usually means warfarin, but not always.
    unsure: [
      [stem('антикоагулянт')],
      [stem('разжиж'), stem('кров')],
      [stem('механическ', 'искусствен', 'протез'), stem('клапан')],
    ],
    typos: ['варфарин', 'варфарекс'],
  },
  {
    chip: 'maoi',
    passing: true,
    names: [
      [w('мао|имао|maoi|ксадаго')],
      [stem('ингибитор'), stem('моноаминоксидаз')],
      [
        stem(
          'фенелзин',
          'транилципромин',
          'изокарбоксазид',
          'ниаламид',
          'ипрониазид',
          'моклобемид',
          'аурорикс',
          'пиразидол',
          'пирлиндол',
          'селегилин',
          'разагилин',
          'азилект',
          'сафинамид',
        ),
      ],
    ],
    // Linezolid is a short course of an antibiotic; Parkinson's disease is often, not always, treated with MAO-B.
    unsure: [[stem('линезолид', 'зивокс', 'зеникс', 'зиваксилид', 'паркинсон')]],
    not: [[w('мао'), stem('цзэдун', 'цзедун', 'дзэдун', 'дзедун')]],
    typos: ['моклобемид', 'транилципромин', 'фенелзин', 'селегилин', 'разагилин'],
  },
  {
    chip: 'eatingDisorder',
    names: [
      [w('рпп|арфид|arfid')],
      [stem('анорекси', 'булими', 'орторекси')],
      [stem('компульсивн', 'приступ'), stem('переедани')],
      [stem('расстройств', 'нарушени'), stem('пищев'), stem('поведени')],
      [stem('расстройств'), w(`прием${L}`), w('пищи')],
      [stem('пищев', 'избирательн'), stem('расстройств')],
    ],
    // «Расстройство пищеварения» is the stomach, not an eating disorder (H1).
    not: [
      [stem('расстройств'), stem('пищеварени', 'желуд', 'кишечник', 'стул')],
      [stem('пищев'), stem('отравлени')],
    ],
    // The SCOFF questions in plain words: asked, never ticked (Section F.5).
    unsure: [
      [stem('пищев'), stem('зависимост')],
      [stem('вызыва'), stem('рвот')],
      [stem('слабительн', 'переедани')],
      [stem('теря', 'потер'), stem('контрол')],
      [w('не'), w('могу'), stem('останов')],
      [stem('боюсь', 'страх'), stem('поправ', 'потолст', 'набра')],
      [stem('чувству'), stem('толст')],
      [stem('дума'), w('еде|еду|еда')],
      [stem('кажд'), stem('калори')],
      [
        w(
          'срываюсь|срывы|срывов|голодаю|голодала|голодовки|голодовка|голодовку|переедаю|переедала',
        ),
      ],
    ],
    typos: ['анорексия', 'булимия', 'орторексия'],
  },
  {
    chip: 'lactation',
    passing: true,
    names: [
      [stem('корм', 'вскармлива'), BREAST],
      [w('грудное|грудным|грудного|грудном'), stem('вскармливани')],
      [stem('смешанн'), stem('вскармливани')],
      [stem('кормящ'), w('мама|мать|мамой')],
      [stem('лактаци', 'лактиру', 'кормящ', 'сцежива', 'лактостаз')],
      [w('гв')],
    ],
    // Feeding a baby may be formula; right after the birth — maybe breastfeeding.
    unsure: [
      [stem('корм'), stem('ребенк', 'малыш', 'дочк', 'сын')],
      [w('после'), w('родов')],
    ],
    typos: ['лактация'],
  },
  {
    chip: 'diabetes',
    names: [
      [stem('диабет')],
      [w('сд'), w('1|2')],
      [w('сд1|сд2|гсд')],
      [stem('инсулинозависим', 'инсулиннезависим')],
      [INSULIN],
      [stem('инсулинов'), stem('помп')],
      [
        stem(
          'лантус',
          'левемир',
          'туджео',
          'тресиб',
          'хумалог',
          'новорапид',
          'апидр',
          'актрапид',
          'хумулин',
          'протафан',
          'инсуман',
          'фиасп',
          'ринсулин',
          'росинсулин',
          'биосулин',
        ),
      ],
    ],
    // «СД» alone may be another syndrome; metformin and GLP-1 drugs are also used without diabetes.
    unsure: [
      [w('сд')],
      [METFORMIN],
      [stem('оземпик', 'семаглутид', 'саксенд', 'мунджаро', 'тирзепатид')],
      ...SUGAR_HIGH,
    ],
    // Diabetes insipidus is another disease; «высокий инсулин» is insulin resistance in everyday speech (H6, H7).
    not: [[stem('несахарн'), stem('диабет')], ...INSULIN_HIGH, [stem('резистентност'), INSULIN]],
  },
  {
    chip: 'insulinResistance',
    names: [
      [stem('инсулинорезистентн', 'предиабет', 'преддиабет')],
      [stem('резистентност'), INSULIN],
      [w('ир|нтг|нгн')],
      [stem('нарушен'), stem('толерантност', 'гликеми')],
    ],
    unsure: [
      [stem('метаболическ'), stem('синдром')],
      [w('спкя')],
      [stem('поликистоз'), stem('яичник')],
      [METFORMIN],
      ...INSULIN_HIGH,
      ...SUGAR_HIGH,
    ],
    typos: ['инсулинорезистентность'],
  },
  {
    chip: 'hypertension',
    names: [
      [stem('гипертони', 'гипертенз')],
      [w('аг')],
      [HIGH, PRESSURE],
      [PRESSURE, HIGH],
      [stem('скач'), PRESSURE],
      [PRESSURE, stem('скач')],
      [stem('таблетк', 'лекарств', 'препарат'), PRESSURE],
    ],
    unsure: [[w('гб')]],
    // Pulmonary and portal hypertension are other conditions (salt is limited there too): asked (Section F.9).
    demote: [[stem('легочн', 'портальн'), stem('гипертенз')]],
    // The eye and the skull, and low pressure, are something else (H5).
    not: [
      [stem('внутричерепн', 'внутриглазн', 'глазн'), PRESSURE],
      [PRESSURE, stem('глаз')],
      [stem('внутричерепн', 'внутриглазн', 'глазн'), stem('гипертенз')],
      [stem('низк', 'пониж'), PRESSURE],
      [PRESSURE, stem('низк', 'пониж')],
      [stem('гипотони', 'гипотенз')],
    ],
    typos: ['гипертония', 'гипертензия'],
  },
  {
    chip: 'hypothyroidism',
    names: [
      [stem('гипотиреоз', 'левотироксин', 'эутирокс', 'баготирокс')],
      [w('л|l'), stem('тироксин')],
      [stem('сниж', 'понижен'), stem('функци'), THYROID],
      [THYROID, w('не'), stem('работа')],
    ],
    // The thyroid in general, a lab value, goitre: maybe hypothyroidism, maybe not (levothyroxine alone also treats
    // goitre and follows thyroid surgery, Section F.10).
    unsure: [
      [stem('тироксин', 'тиреоидит', 'тиреоидэктоми', 'хашимото', 'зоб')],
      [THYROID],
      [w('ттг|аит')],
    ],
    not: [
      [
        stem(
          'гипертиреоз',
          'тиреотоксикоз',
          'базедов',
          'тирозол',
          'мерказолил',
          'тиамазол',
          'метимазол',
        ),
      ],
      [stem('болезн'), stem('грейвс')],
    ],
    typos: ['гипотиреоз', 'левотироксин'],
  },
  {
    chip: 'pregnancy',
    passing: true,
    names: [
      [stem('беремен', 'вынашива')],
      [w('жду|ждем|ожидаю|ожидаем'), stem('ребенк', 'малыш')],
      [w('в'), w('положении')],
    ],
    unsure: [[stem('токсикоз', 'забеременет')], [w('эко')]],
  },
];

/** A negation near a name (3 words before, 2 after): «нет», «не», «без», «никаких»… */
const NEGATION = w(
  'не|нет|ни|без|нету|никогда|никакой|никакая|никакие|никаких|никакого|никакому|ничего|отсутствует|отсутствуют|отсутствие|отрицаю',
);
/** …unless it negates something else: «не раз», «без рецепта», «почки не работают» (a pseudo-negation, Section E.1). */
const NOT_A_NEGATION = w(
  `раз|только|менее|всегда|кажд${L}|по|нет|перерыв${L}|рецепт${L}|сил|работа${L}|исключен${L}|знаю|уверен${L}`,
);
/** A denial after the name: «почки в порядке», «беременность исключена», «диагноз сняли». */
const DENIALS: readonly Pattern[] = [
  [w('в'), w('порядке|норме')],
  [stem('здоров', 'исключ')],
  [w('чисто|чистые')],
  [w('не'), stem('подтверд')],
  [stem('снят', 'сняли'), stem('диагноз')],
];
const LOOK_BACK = 3;
const LOOK_AHEAD = 2;
/** Somebody else is looked for this many words on both sides of a name. */
const RELATIVE_WINDOW = 3;
/** Words of a phrase may stand this many words apart («кормлю сейчас грудью»). */
const MAX_GAP = 1;

/** Somebody else, in the exact forms of these words (stems caught «женщина», «другие», «брать», «папайя»: H3). */
const RELATIVES = w(
  'мама|мамы|маме|маму|мамой|мать|матери|папа|папы|папе|папу|папой|отец|отца|отцу|отцом|бабушка|бабушки|бабушке|бабушку|бабушкой|дедушка|дедушки|дедушке|дедушку|дед|деда|деду|муж|мужа|мужу|мужем|жена|жены|жене|жену|женой|брат|брата|брату|братом|сестра|сестры|сестре|сестру|сестрой|друг|друга|другу|подруга|подруги|подруге|подругу|знакомая|знакомой|знакомого|родственники|родственников|родственника|родители|родителей|коллега|коллеги|коллеге|сосед|соседа|соседка|соседки|тетя|тети|дядя|дяди|них',
);
/** A child: somebody else for an adult, the very person in family mode (H16). */
const CHILDREN = w(
  'сын|сына|сыну|сыном|дочь|дочка|дочки|дочке|дочку|дочери|дочерью|ребенок|ребенка|ребенку|ребенком|малыш|малыша|малышу|него|нее',
);
/** The whole family: «в семье», «наследственное». */
const FAMILY = w(`наследствен${L}|наследству|семье|семья|семьи|семейный|семейная|роду`);
/** The person speaks of themself: then a relative nearby does not take the condition away («мы с мужем ждём»). */
const FIRST_PERSON = w(
  'я|мне|меня|мной|мы|нам|нас|нами|принимаю|принимаем|пью|пьем|колю|колем|кормлю|кормим|жду|ждем|ожидаю|ожидаем|наблюдаюсь|лечусь|лечимся|страдаю|болею|болеем|вынашиваю|сцеживаю|лактирую|вскармливаю|сижу|хожу|получаю|использую',
);
/** A passing state that is over (Section E.2)… */
const PAST = w(
  'была|был|были|было|раньше|прошлом|прошлую|прошлой|давно|закончила|закончил|закончили|закончилось|отменили|отменил|отменила|перестала|перестал|перестали|бросила|бросил|переболела|кормила|кормил|кормили|вскармливала|принимала|принимал|принимали|пила|пил|пили|отлучила|отлучили|сняла|сняли',
);
const AFTER_BIRTH: Pattern = [w('после'), stem('родов', 'беремен')];
/** …or only planned (looked for before the name). */
const PLAN = w(
  'планирую|планируем|собираюсь|собираемся|хочу|хотим|хотела|хотел|хотели|мечтаю|мечтаем|пытаемся|пытаюсь|готовлюсь|готовимся|эко|скоро|буду|будем|будет',
);
/** Doubt or a question anywhere in the clause: «возможно», «подозрение на», «есть ли», «если у меня». */
const DOUBT = w(
  'возможно|наверное|наверно|кажется|вроде|подозреваю|подозреваем|подозрение|подозрением|подозрения|вероятно|похоже|предполагают|предположили|предположил|предположила|боюсь|опасаюсь|ли|если',
);
const DOUBT_PHRASES: readonly Pattern[] = [
  [w('не'), stem('уверен', 'исключ')],
  [w('жду|ждем'), stem('результат')],
  [stem('сда'), stem('анализ')],
];
/** A part after a comma that still lists what was denied before it: «нет диабета, ХБП, РПП» (Section E.1). */
const LIST_ITEM_MAX_WORDS = 3;
/** …unless it says the opposite: «нет диабета, есть гипертония». */
const AFFIRMATION = w(
  'есть|имеется|имеются|был|была|были|было|диагноз|диагностировали|поставили|выявили|нашли|обнаружили',
);
/** Clauses: «но», «а», «однако»… end what a negation applies to. */
const TERMINATORS = /\s+(?:но|а|однако|зато|кроме|только|хотя|впрочем|правда)\s+/u;

type Clause = {
  readonly tokens: readonly string[];
  /** A question («Это диабет?»), doubt («возможно», «подозрение на»). */
  readonly doubtful: boolean;
  /** A bare part of a denied list. */
  readonly listDenied: boolean;
  readonly firstPerson: boolean;
  readonly family: boolean;
};

const tokenize = (part: string) =>
  part
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

/** Each next word of a pattern at most MAX_GAP words after the previous one. */
function findAll(tokens: readonly string[], pattern: Pattern): Span[] {
  const spans: Span[] = [];
  const [first, ...rest] = pattern;
  if (!first) return spans;
  for (let start = 0; start < tokens.length; start += 1) {
    if (!first.test(tokens[start] ?? '')) continue;
    let at = start;
    let ok = true;
    for (const word of rest) {
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
    if (ok) spans.push({ start, end: at });
  }
  return spans;
}

const negationAt = (tokens: readonly string[], index: number) =>
  NEGATION.test(tokens[index] ?? '') && !NOT_A_NEGATION.test(tokens[index + 1] ?? '');

/** Lower case, ё → е, everything but letters and digits a word break; clauses split on punctuation and «но», «а»… */
function clauses(text: string): Clause[] {
  const out: Clause[] = [];
  const lower = text.toLocaleLowerCase('ru').replaceAll('ё', 'е');
  for (const [sentence] of lower.matchAll(/[^.;:!?()\n]+[.;:!?()\n]*/gu)) {
    const question = sentence.includes('?');
    for (const scope of ` ${sentence} `.split(TERMINATORS)) {
      let listDenied = false;
      for (const part of scope.split(',')) {
        const tokens = tokenize(part);
        if (tokens.length === 0) continue;
        const firstPerson = tokens.some((token) => FIRST_PERSON.test(token));
        const bare =
          tokens.length <= LIST_ITEM_MAX_WORDS &&
          !firstPerson &&
          !tokens.some((token) => AFFIRMATION.test(token));
        const inherited: boolean = listDenied && bare;
        listDenied = inherited || tokens.some((_, index) => negationAt(tokens, index));
        out.push({
          tokens,
          doubtful:
            question ||
            tokens.some((token) => DOUBT.test(token)) ||
            DOUBT_PHRASES.some((pattern) => findAll(tokens, pattern).length > 0),
          listDenied: inherited,
          firstPerson,
          family: tokens.some((token) => FAMILY.test(token)),
        });
      }
    }
  }
  return out;
}

/** Indices around a span (the span itself left out). */
function around(tokens: readonly string[], span: Span, before: number, after: number): number[] {
  const indices: number[] = [];
  for (let i = Math.max(0, span.start - before); i < span.start; i += 1) indices.push(i);
  for (let i = span.end + 1; i <= Math.min(tokens.length - 1, span.end + after); i += 1)
    indices.push(i);
  return indices;
}

const overlaps = (
  tokens: readonly string[],
  patterns: readonly Pattern[] | undefined,
  span: Span,
) =>
  (patterns ?? []).some((pattern) =>
    findAll(tokens, pattern).some((other) => other.start <= span.end && other.end >= span.start),
  );

function denied(tokens: readonly string[], span: Span): boolean {
  if (around(tokens, span, LOOK_BACK, LOOK_AHEAD).some((index) => negationAt(tokens, index)))
    return true;
  return DENIALS.some((pattern) =>
    findAll(tokens, pattern).some(
      (other) => other.start > span.end && other.start <= span.end + LOOK_AHEAD,
    ),
  );
}

function somebodyElse(clause: Clause, span: Span, subject: HealthSubject): boolean {
  if (clause.firstPerson) return false;
  if (clause.family) return true;
  return around(clause.tokens, span, RELATIVE_WINDOW, RELATIVE_WINDOW).some((index) => {
    const token = clause.tokens[index] ?? '';
    return RELATIVES.test(token) || (subject === 'self' && CHILDREN.test(token));
  });
}

function overOrPlanned(tokens: readonly string[], span: Span): boolean {
  const from = Math.max(0, span.start - LOOK_BACK);
  const to = Math.min(tokens.length - 1, span.end + LOOK_AHEAD);
  for (let i = from; i <= to; i += 1) if (PAST.test(tokens[i] ?? '')) return true;
  for (let i = from; i < span.start; i += 1) if (PLAN.test(tokens[i] ?? '')) return true;
  return findAll(tokens, AFTER_BIRTH).some((other) => other.start >= from && other.start <= to);
}

type Kind = 'name' | 'vague' | 'unsure' | 'typo';
type Verdict = 'tick' | 'ask' | 'none';

function verdict(
  entry: Entry,
  clause: Clause,
  span: Span,
  kind: Kind,
  subject: HealthSubject,
): Verdict {
  const { tokens } = clause;
  if (overlaps(tokens, entry.not, span)) return 'none';
  if (clause.doubtful || clause.listDenied) return 'ask';
  // A shown chip the person denies needs no note: it would read as a contradiction (Section D.5).
  if (denied(tokens, span)) return SHOWN_HEALTH_CHIPS.includes(entry.chip) ? 'none' : 'ask';
  if (somebodyElse(clause, span, subject))
    return RISKY_HEALTH_CHIPS.includes(entry.chip) ? 'ask' : 'none';
  if (entry.passing && overOrPlanned(tokens, span)) return 'ask';
  if (kind === 'unsure' || kind === 'typo') return 'ask';
  if (overlaps(tokens, entry.demote, span)) return 'ask';
  if (kind === 'vague' && entry.doubt?.some((word) => tokens.some((token) => word.test(token))))
    return 'ask';
  return 'tick';
}

/** Every word the entries know: such a word is never a typo of another («гипертиреоз» is not «гипотиреоз»). */
const KNOWN: readonly Word[] = ENTRIES.flatMap((entry) =>
  [
    ...entry.names,
    ...(entry.vague ?? []),
    ...(entry.unsure ?? []),
    ...(entry.demote ?? []),
    ...(entry.not ?? []),
  ].flat(),
);
/** Typos are looked for in words this long; up to 1 edit, 2 from 11 letters (H13). */
const TYPO_FROM_LETTERS = 7;
const TWO_TYPOS_FROM_LETTERS = 11;

/** Optimal-string-alignment distance: insertions, deletions, substitutions and swaps of two neighbours. */
function editDistance(a: string, b: string): number {
  const width = b.length + 1;
  const d = new Array<number>((a.length + 1) * width).fill(0);
  const at = (i: number, j: number) => d[i * width + j] ?? 0;
  for (let i = 0; i <= a.length; i += 1) d[i * width] = i;
  for (let j = 0; j <= b.length; j += 1) d[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        best = Math.min(best, at(i - 2, j - 2) + 1);
      d[i * width + j] = best;
    }
  }
  return at(a.length, b.length);
}

/** Tokens that are a typo of one of the entry's long words (its beginning, whatever the ending). */
function typoSpans(tokens: readonly string[], entry: Entry): Span[] {
  const spans: Span[] = [];
  tokens.forEach((token, index) => {
    if (token.length < TYPO_FROM_LETTERS - 1 || KNOWN.some((word) => word.test(token))) return;
    const near = (entry.typos ?? []).some((word) => {
      const allowed = word.length >= TWO_TYPOS_FROM_LETTERS ? 2 : 1;
      return [word.length - 1, word.length, word.length + 1].some(
        (length) => token.length >= length && editDistance(token.slice(0, length), word) <= allowed,
      );
    });
    if (near) spans.push({ start: index, end: index });
  });
  return spans;
}

const cache = new Map<string, HealthMatch[]>();
const CACHE_SIZE = 200;

/** The chips a typed text names; each chip once, a ticked match wins over an unticked one. */
export function matchHealthChips(text: string, subject: HealthSubject = 'self'): HealthMatch[] {
  const key = `${subject}\n${text}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const found = new Map<HealthChipId, boolean>();
  const note = (chip: HealthChipId, result: Verdict) => {
    if (result !== 'none') found.set(chip, (found.get(chip) ?? false) || result === 'tick');
  };
  for (const clause of clauses(text)) {
    for (const entry of ENTRIES) {
      const judge = (patterns: readonly Pattern[] | undefined, kind: Kind) => {
        for (const pattern of patterns ?? []) {
          for (const span of findAll(clause.tokens, pattern)) {
            note(entry.chip, verdict(entry, clause, span, kind, subject));
          }
        }
      };
      judge(entry.names, 'name');
      judge(entry.vague, 'vague');
      judge(entry.unsure, 'unsure');
      for (const span of typoSpans(clause.tokens, entry)) {
        note(entry.chip, verdict(entry, clause, span, 'typo', subject));
      }
    }
  }
  const matches = [...found].map(([chip, confident]) => ({ chip, confident }));
  if (cache.size >= CACHE_SIZE) cache.clear();
  cache.set(key, matches);
  return matches;
}
