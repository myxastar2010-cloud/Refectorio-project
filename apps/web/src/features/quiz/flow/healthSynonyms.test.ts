import { describe, expect, it } from 'vitest';
import { matchHealthChips, type HealthMatch } from './healthSynonyms';
import { initialQuizState, reconcile } from './machine';
import { activeHealthChips, healthFlags, safetyOf } from './safety';
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

  it('negations, somebody else and false friends show the chip unticked', () => {
    expect(matchHealthChips('нет проблем с почками')).toEqual(doubt('kidneyDisease'));
    expect(matchHealthChips('мама на диализе')).toEqual(doubt('kidneyDisease'));
    expect(matchHealthChips('камни в почках')).toEqual(doubt('kidneyDisease'));
    expect(matchHealthChips('не кормлю грудью')).toEqual(doubt('lactation'));
    expect(matchHealthChips('у мужа диабет')).toEqual(doubt('diabetes'));
    expect(matchHealthChips('щитовидка')).toEqual(doubt('hypothyroidism'));
  });

  it('a negation stays in its own clause; a sure match wins over a doubtful one', () => {
    expect(matchHealthChips('диабета нет, но есть гипертония')).toEqual([
      ...doubt('diabetes'),
      ...sure('hypertension'),
    ]);
    expect(matchHealthChips('почки не болят')).toEqual(doubt('kidneyDisease'));
    expect(matchHealthChips('нет диабета, но есть гипертония')).toEqual([
      ...doubt('diabetes'),
      ...sure('hypertension'),
    ]);
    expect(matchHealthChips('камни в почках, ХБП')).toEqual(sure('kidneyDisease'));
  });

  it('names of something else tick nothing', () => {
    expect(matchHealthChips('низкое давление')).toEqual([]);
    expect(matchHealthChips('гипертиреоз')).toEqual([]);
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
