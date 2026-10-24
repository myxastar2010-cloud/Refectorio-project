import type { SafetyAdjustment } from '@refectorio/contracts';
import { initialQuizState } from './machine';
import { nextStepId, STEPS } from './steps';
import { STEP_IDS, type Answers, type QuizState, type Screen, type StepId } from './types';

/**
 * Test builds only (`__TEST_HOOKS__`, vite build --mode test): `?step=<id>&state=<name>` opens any step in any of its
 * known sub-states, so the fit of every step (4.11) can be checked on every window size. Sub-states that need a
 * click (an open picker, the «+» panel) are opened by the tests themselves.
 */
const NOW = '2026-10-21T10:00:00.000Z';

/** A 35-year-old woman, 165 cm, 62 kg, who finished the game (an exhausted catalog keeps the dish ids out). */
const ADULT: Partial<Answers> = {
  tasteExhausted: true,
  sex: 'female',
  ageYears: 35,
  heightCm: 165,
  goal: 'lose',
  weightKg: 70,
  targetWeightKg: 65,
  foodStyle: 'omnivore',
  macroProfile: 'recommended',
  health: 'no',
  allergy: 'no',
  dislikes: 'no',
  exercise: '3to4',
  strength: 'yes',
  lifestyle: 'mostlySitting',
};

const LONG_DISLIKES =
  'Не люблю кинзу, оливки, маслины, печень, субпродукты, баклажаны, кабачки, тыкву, грибы, лук в супах, варёную морковь, ' +
  'рыбу с костями, острый перец, сельдерей, творог с комочками, манку, молочный суп, холодец, жирное мясо, сало, ' +
  'брокколи на пару, цветную капусту, горошек из банки, кукурузу, ананасы в салатах, изюм в выпечке, корицу, мяту, ' +
  'имбирь, сыр с плесенью, анчоусы, каперсы, оливковое масло с горечью, газировку и слишком сладкие десерты. Всё.';

const LONG_NOTES =
  'Обычно завтракаю в 7 утра, обедаю на работе в столовой, ужинаю поздно, около 21 часа. По выходным готовлю на всю ' +
  'неделю вперёд. Люблю супы и запеканки, не люблю долго стоять у плиты. Есть мультиварка и духовка. Пью много чая.';

/** Each step's sub-states: answers on top of the adult above (or of nothing, for the earliest steps). */
const STATES: Partial<Record<StepId, Record<string, Partial<Answers>>>> = {
  body: {
    empty: {},
    filled: { sex: 'female', ageYears: 35, heightCm: 165 },
    child: { sex: 'female', ageYears: 9, heightCm: 132 },
  },
  goalSetup: {
    lose: {},
    maintain: { goal: 'maintain' },
  },
  healthConditions: {
    empty: { health: 'yes' },
    followups: {
      health: 'yes',
      healthChips: ['diabetes', 'pregnancy', 'hypertension'],
    },
    max: {
      health: 'yes',
      healthChips: ['diabetes', 'pregnancy', 'lactation', 'hypertension', 'warfarin'],
      insulin: 'no',
      healthCustom: ['анемия', 'мигрень', 'гастрит', 'мама на диализе'],
    },
  },
  allergens: {
    empty: { allergy: 'yes' },
    severe: {
      allergy: 'yes',
      allergenChips: ['peanut', 'fish', 'crustacean', 'celery'],
      severeTraces: true,
      allergenCustom: ['киви', 'креветки'],
    },
  },
  dislikesText: {
    empty: { dislikes: 'yes' },
    long: { dislikes: 'yes', dislikesText: LONG_DISLIKES },
  },
  extraGoals: {
    empty: {},
    chosen: { extraGoals: ['clothesFit', 'overallHealth', 'energy'] },
    // A teenager has no weight goal (else the step would first show that notice).
    teen: { ageYears: 16, goal: 'maintain' },
  },
  notes: { empty: {}, long: { notes: LONG_NOTES } },
};

export const testStateNames = (step: StepId): readonly string[] =>
  Object.keys(STATES[step] ?? { default: {} });

/** The screens before `step` for these answers (Back and the progress bar see a real path). */
function historyTo(step: StepId, answers: Answers): Screen[] {
  const history: Screen[] = [];
  let at: StepId | null = 'taste';
  while (at && at !== step) {
    history.push(at);
    at = nextStepId(at, answers);
  }
  return history;
}

export function testState(
  stepText: string,
  stateName: string | null,
  seed: number,
): QuizState | null {
  const base = initialQuizState(seed, NOW);
  if (stepText === 'adjustments' || stepText === 'finale') {
    const adjustments: SafetyAdjustment[] = ['goalToMaintain', 'ketoToRecommended'];
    const answers: Answers = {
      ...base.answers,
      ...ADULT,
      ...(stateName === 'refused' ? { health: 'yes', healthChips: ['kidneyDisease'] } : {}),
    };
    const screen: Screen = stepText;
    return {
      ...base,
      answers,
      screen,
      history: [...historyTo('notes', answers), 'notes'],
      adjustments: stepText === 'adjustments' ? adjustments : [],
    };
  }
  const step = STEP_IDS.find((id) => id === stepText);
  if (!step) return null;
  const sub = STATES[step]?.[stateName ?? ''] ?? Object.values(STATES[step] ?? {})[0] ?? {};
  const earliest = STEPS.findIndex((s) => s.id === step) <= STEPS.findIndex((s) => s.id === 'body');
  const answers = {
    ...base.answers,
    ...(step === 'taste' ? {} : earliest ? { tasteExhausted: true } : ADULT),
    ...sub,
  };
  return { ...base, answers, screen: step, history: historyTo(step, answers) };
}
