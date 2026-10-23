import { describe, expect, it } from 'vitest';
import { matchHealthChips, type HealthMatch } from './healthSynonyms';
import { initialQuizState, reconcile } from './machine';
import { activeHealthChips, healthFlags, safetyOf, unmatchedHealthTexts } from './safety';
import { STEPS } from './steps';
import type { Answers, QuizState } from './types';

const sure = (...chips: HealthMatch['chip'][]) => chips.map((chip) => ({ chip, confident: true }));
const doubt = (...chips: HealthMatch['chip'][]) =>
  chips.map((chip) => ({ chip, confident: false }));

describe('health synonyms → chips (4.13)', () => {
  it.each([
    ['почки', 'kidneyDisease'],
    ['Хроническая болезнь почек', 'kidneyDisease'],
    ['ХБП 3 стадии', 'kidneyDisease'],
    ['почечная недостаточность', 'kidneyDisease'],
    ['хожу на диализ', 'kidneyDisease'],
    ['ФКУ', 'pku'],
    ['фенилкетонурия', 'pku'],
    ['пью варфарин', 'warfarin'],
    ['Варфарекс', 'warfarin'],
    ['МАО', 'maoi'],
    ['ИМАО', 'maoi'],
    ['ингибиторы моноаминоксидазы', 'maoi'],
    ['РПП', 'eatingDisorder'],
    ['была анорексия', 'eatingDisorder'],
    ['булимия', 'eatingDisorder'],
    ['компульсивное переедание', 'eatingDisorder'],
    ['кормлю грудью', 'lactation'],
    ['грудное вскармливание', 'lactation'],
    ['ГВ', 'lactation'],
    ['лактация', 'lactation'],
    ['сахарный диабет', 'diabetes'],
    ['СД2', 'diabetes'],
    ['сд 1', 'diabetes'],
    ['колю инсулин', 'diabetes'],
    ['инсулинорезистентность', 'insulinResistance'],
    ['предиабет', 'insulinResistance'],
    ['гипертензия', 'hypertension'],
    ['высокое давление', 'hypertension'],
    ['гипотиреоз', 'hypothyroidism'],
    ['пью эутирокс', 'hypothyroidism'],
    ['беременна', 'pregnancy'],
    ['Ё-моё, беремЁнность!', 'pregnancy'],
  ] as const)('«%s» → %s', (text, chip) => {
    expect(matchHealthChips(text)).toEqual(sure(chip));
  });

  it('never matches inside other words', () => {
    expect(matchHealthChips('инсулинорезистентность')).not.toContainEqual(
      expect.objectContaining({ chip: 'diabetes' }),
    );
    expect(matchHealthChips('преддиабет')).not.toContainEqual(
      expect.objectContaining({ chip: 'diabetes' }),
    );
    expect(matchHealthChips('маослёнок')).toEqual([]);
    expect(matchHealthChips('анемия')).toEqual([]);
    expect(matchHealthChips('')).toEqual([]);
  });

  it('negations, somebody else and false friends: hidden chips unticked, shown chips quiet', () => {
    expect(matchHealthChips('нет проблем с почками')).toEqual(doubt('kidneyDisease'));
    expect(matchHealthChips('мама на диализе')).toEqual(doubt('kidneyDisease'));
    expect(matchHealthChips('камни в почках')).toEqual(doubt('kidneyDisease'));
    expect(matchHealthChips('не кормлю грудью')).toEqual(doubt('lactation'));
    expect(matchHealthChips('щитовидка')).toEqual(doubt('hypothyroidism'));
    // A shown chip denied or somebody else's: no note (it would read as a contradiction, review D.5).
    expect(matchHealthChips('у мужа диабет')).toEqual([]);
    expect(matchHealthChips('нет диабета')).toEqual([]);
  });

  it('a negation stays in its own clause; a sure match wins over a doubtful one', () => {
    expect(matchHealthChips('диабета нет, но есть гипертония')).toEqual(sure('hypertension'));
    expect(matchHealthChips('почки не болят')).toEqual(doubt('kidneyDisease'));
    expect(matchHealthChips('нет диабета, но есть гипертония')).toEqual(sure('hypertension'));
    expect(matchHealthChips('нет диабета, есть гипертония')).toEqual(sure('hypertension'));
    expect(matchHealthChips('камни в почках, ХБП')).toEqual(sure('kidneyDisease'));
    // Not every «не» denies: «почки не работают», «щитовидка не работает».
    expect(matchHealthChips('почки не работают')).toEqual(sure('kidneyDisease'));
    expect(matchHealthChips('щитовидка не работает')).toEqual(sure('hypothyroidism'));
  });

  it('names of something else tick nothing', () => {
    expect(matchHealthChips('низкое давление')).toEqual([]);
    expect(matchHealthChips('гипертиреоз')).toEqual([]);
    expect(matchHealthChips('гипертонус')).toEqual([]);
  });
});

/** The cases of the fact-check (review-health-synonyms.md G.2): H1–H17. */
describe('the review cases (G.2)', () => {
  it.each([
    // H1: the stomach is not an eating disorder; the ICD name is.
    ['расстройство пищеварения', []],
    ['расстройство приёма пищи', sure('eatingDisorder')],
    // H2: somebody else after the name.
    ['диабет у мамы', []],
    ['диализ у отца', doubt('kidneyDisease')],
    ['анорексия у подруги', doubt('eatingDisorder')],
    // H3: exact forms of relatives; the person speaking of themself.
    ['женщина 30 лет беременна', sure('pregnancy')],
    ['мы с мужем ждём ребёнка', sure('pregnancy')],
    ['дочке 2 месяца, кормлю грудью', sure('lactation')],
    ['другие проблемы с почками', sure('kidneyDisease')],
    ['брать варфарин по вечерам', sure('warfarin')],
    ['у меня и у мамы диабет', sure('diabetes')],
    // H4: the past and a plan of a passing state; the past of a lasting one stays.
    ['планирую беременность', doubt('pregnancy')],
    ['закончила ГВ', doubt('lactation')],
    ['раньше пила варфарин', doubt('warfarin')],
    ['были РПП в юности', sure('eatingDisorder')],
    // Doubt and questions.
    ['подозрение на гипотиреоз', doubt('hypothyroidism')],
    ['есть ли у меня диабет?', doubt('diabetes')],
    // H5: blood pressure in any order; the eye is something else.
    ['давление высокое', sure('hypertension')],
    ['высокое внутриглазное давление', []],
    ['гипотония и гипертония', sure('hypertension')],
    // H6, H7.
    ['несахарный диабет', []],
    ['высокий инсулин', doubt('insulinResistance')],
    ['колю инсулин', sure('diabetes')],
    // Other anticoagulants; a typo is asked, never ticked (H13); «марфарин» is no drug, but one letter from it.
    ['принимаю ксарелто', []],
    ['пью варфорин', doubt('warfarin')],
    ['марфарин', doubt('warfarin')],
    ['фенилкетанурия', doubt('pku')],
    // Kidneys: what may be or lead to CKD is asked.
    ['хронический пиелонефрит', doubt('kidneyDisease')],
    ['острая почечная недостаточность', doubt('kidneyDisease')],
    ['одна почка', doubt('kidneyDisease')],
    ['никаких проблем с почками', doubt('kidneyDisease')],
    ['говяжьи почки', []],
    // A denied list: the bare names after the comma are denied too, but asked — never quiet (Section E.1).
    ['нет диабета, ХБП, РПП', doubt('kidneyDisease', 'eatingDisorder')],
    ['диабет 2 типа, ХБП 3 стадии', sure('diabetes', 'kidneyDisease')],
    // H8: MAO inhibitors; linezolid is a short course.
    ['азилект', sure('maoi')],
    ['пью линезолид', doubt('maoi')],
    ['Мао Цзэдун', []],
    ['ингибиторы АПФ', []],
    // H10, H14: latin and other names.
    ['PKU', sure('pku')],
    ['warfarin', sure('warfarin')],
    ['МНО 2,5', sure('warfarin')],
    // H12: the breast, never «грудка».
    ['куриная грудка, кормлю кота', []],
    ['кормящая мама', sure('lactation')],
    // F.10: levothyroxine by its two-word name; «тироксин» alone may be a lab value.
    ['пью л-тироксин', sure('hypothyroidism')],
    ['свободный тироксин', doubt('hypothyroidism')],
    // H17: aspartame in the health panel.
    ['аспартам', doubt('pku')],
    // F.12: both named.
    ['диабетическая нефропатия', sure('kidneyDisease', 'diabetes')],
  ] as const)('«%s»', (text, expected) => {
    expect(matchHealthChips(text)).toEqual(expected);
  });

  it('family mode (H16): the child is the very person', () => {
    expect(matchHealthChips('у сына ФКУ')).toEqual(doubt('pku'));
    expect(matchHealthChips('у сына ФКУ', 'child')).toEqual(sure('pku'));
    expect(matchHealthChips('у дочки диабет', 'child')).toEqual(sure('diabetes'));
    expect(matchHealthChips('у мамы диабет', 'child')).toEqual([]);
  });

  it('is case- and ё-blind and gives the same answer twice', () => {
    expect(matchHealthChips('ХБП')).toEqual(matchHealthChips('хбп'));
    expect(matchHealthChips('ждём ребёнка')).toEqual(matchHealthChips('ждем ребенка'));
    expect(matchHealthChips('пью варфорин')).toEqual(matchHealthChips('пью варфорин'));
  });
});

const NOW = '2026-10-17T10:00:00.000Z';
const tenDecisions = Array.from({ length: 10 }, (_, i) => ({
  dishId: `d_dish_${i}`,
  answer: 'like' as const,
}));
function at(extra: Partial<Answers>): QuizState {
  const base = initialQuizState(1, NOW);
  return {
    ...base,
    screen: 'healthConditions',
    answers: {
      ...base.answers,
      tasteDecisions: tenDecisions,
      sex: 'female',
      ageYears: 30,
      heightCm: 165,
      weightKg: 60,
      goal: 'lose',
      health: 'yes',
      ...extra,
    },
  };
}

/**
 * Stage-2 drafts with a chip that is now hidden: the chip is still active, and every flag, follow-up, notice and the
 * guardrail decision are those of stage 2 (the chips were visible to this person then).
 */
describe('drafts with a now-hidden chip keep every rule (migration fixtures)', () => {
  it('kidney disease and PKU: refused, with the refused notice', () => {
    for (const chip of ['kidneyDisease', 'pku'] as const) {
      const state = at({ healthChips: [chip] });
      expect(activeHealthChips(state.answers)).toEqual([chip]);
      expect(safetyOf(state.answers).decision.status).toBe('refused');
      expect(reconcile(state, 'healthConditions').notices).toContain('refused');
    }
    // A child: the same, through «+» now.
    const child = at({
      ageYears: 9,
      familyConfirmed: true,
      goal: 'maintain',
      healthChips: ['pku'],
    });
    expect(safetyOf(child.answers).decision.status).toBe('refused');
  });

  it('an eating disorder: fewer numbers, its notice with the helplines, no weight-loss goal', () => {
    const state = at({ healthChips: ['eatingDisorder'] });
    const { decision } = safetyOf(state.answers);
    expect(decision.deemphasizeNumbers).toBe(true);
    expect(decision.allowedGoals).not.toContain('lose');
    expect(reconcile(state, 'healthConditions').notices).toContain('eatingDisorder');
  });

  it('warfarin and MAO inhibitors: their flags (the notes under the chips)', () => {
    expect(healthFlags(at({ healthChips: ['warfarin', 'maoi'] }).answers)).toEqual([
      'warfarin',
      'maoi',
    ]);
  });

  it('breastfeeding: lactation norms, its notice, and «Готово» waits for the baby’s age', () => {
    const state = at({ healthChips: ['lactation'] });
    expect(safetyOf(state.answers).decision.allowedGoals).not.toContain('lose');
    expect(reconcile(state, 'healthConditions').notices).toContain('pregnancyLactation');
    const step = STEPS.find((s) => s.id === 'healthConditions');
    expect(step?.complete(state.answers)).toBe(false);
    expect(step?.complete({ ...state.answers, lactationPeriod: 'months0to6' })).toBe(true);
  });

  it('a hidden chip that does not fit the person (lactation for a man) stays inactive, as the contract requires', () => {
    expect(activeHealthChips(at({ sex: 'male', healthChips: ['lactation'] }).answers)).toEqual([]);
  });
});

/** Texts the menu cannot follow, and conditions ticked outside the health step (review-health-synonyms.md B.4). */
describe('what the chips do not cover (B.4, points 3–5)', () => {
  it('a text that ticks no active chip: kept, the doctor advised, its notice and the honest line', () => {
    const state = at({ healthChips: ['hypertension'], healthCustom: ['мигрень'] });
    expect(unmatchedHealthTexts(state.answers)).toEqual(['мигрень']);
    expect(healthFlags(state.answers)).toEqual(['hypertension', 'otherChronic']);
    const { decision } = safetyOf(state.answers);
    expect(decision.status).toBe('requiresDoctor');
    expect(decision.reasons).toContain('OTHER_CHRONIC');
    expect(decision.referToDoctor).toContain('gp');
    // Nothing restricted: the goal stays.
    expect(decision.allowedGoals).toContain('lose');
    expect(reconcile(state, 'healthConditions').notices).toContain('otherChronic');
  });

  it('a text asked about but left unticked counts as not covered; a ticked one is covered', () => {
    expect(unmatchedHealthTexts(at({ healthCustom: ['одна почка'] }).answers)).toEqual([
      'одна почка',
    ]);
    const ticked = at({ healthChips: ['kidneyDisease'], healthCustom: ['одна почка'] });
    expect(unmatchedHealthTexts(ticked.answers)).toEqual([]);
    expect(unmatchedHealthTexts(at({ health: 'no', healthCustom: ['мигрень'] }).answers)).toEqual(
      [],
    );
  });

  it('a condition ticked later (aspartame, the notes) brings its notices at that step', () => {
    const notes = {
      ...at({ health: 'yes', healthChips: ['kidneyDisease'] }),
      screen: 'notes' as const,
    };
    expect(reconcile(notes, 'notes').notices).toContain('refused');
    const allergens = { ...at({ healthChips: ['pku'] }), screen: 'allergens' as const };
    expect(reconcile(allergens, 'allergens').notices).toContain('refused');
  });
});
