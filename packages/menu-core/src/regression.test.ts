/**
 * Regression over the 88 reference personas of nutrition-core (fixtures/test-personas.json): each is mapped to quiz
 * answers, run through the profile builder and the planner, and one compact summary is snapshotted.
 *
 * Fields the quiz cannot express are ignored: budget, cookTimeMaxMin, bodyFatPct, ratePctPerWeek (the target weight
 * is set to ±5 % instead), edScreenPositive, goal 'habits' (-> maintain), diets halal / kosher (-> omnivore),
 * lentLay (-> vegan), sex 'unspecified' and fractional ages (the quiz rejects them), exact lifestyle (a typical one per activity group), dislikes list vs text (joined by ", ").
 */
import type { QuizAnswersV1 } from '@refectorio/contracts';
import personasJson from '../../nutrition-core/src/fixtures/test-personas.json';
import { describe, expect, it } from 'vitest';
import { buildContext } from './context';
import { generate } from './generate';
import { buildMenuProfile } from './profile';
import { DEFAULT_STRUCTURE, structureFromKinds } from './structure';
import { quizAnswers, testFoods } from './testing';
import type { Meal, MealKind, Plan } from './types';
import { hardViolations } from './validate';

type PersonaInput = {
  ageYears: number;
  sex: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  activity: 'kfa1' | 'kfa2' | 'kfa3' | 'kfa4';
  goal: string;
  mode: 'self' | 'family';
  pregnancy?: 'trimester1' | 'trimester2' | 'trimester3';
  lactation?: 'months0to6' | 'months7to12';
  health?: QuizAnswersV1['health']['flags'];
  diet?: string;
  allergens?: QuizAnswersV1['allergies']['items'];
  mealsPerDay?: number;
  dislikesOther?: string;
  dislikes?: string[];
};
type Persona = {
  id: string;
  title: string;
  category: string;
  input: PersonaInput;
  expected: { guardrail?: { status: string }; inputError?: string };
};

const personas = personasJson as unknown as Persona[];
const foods = testFoods();

const ACTIVITY = {
  kfa1: { exercise: 'none', lifestyle: 'mostlySitting' },
  kfa2: { exercise: '1to2', lifestyle: 'mostlySitting' },
  kfa3: { exercise: '3to4', lifestyle: 'mostlyStanding' },
  kfa4: { exercise: 'daily', lifestyle: 'physicalLabour' },
} as const;

const DIET: Record<string, QuizAnswersV1['diet']> = {
  omnivore: 'omnivore',
  vegan: 'vegan',
  lentLay: 'vegan',
  halal: 'omnivore',
  kosher: 'omnivore',
};

function structureFor(mealsPerDay: number | undefined): readonly Meal[] {
  if (mealsPerDay === undefined) return DEFAULT_STRUCTURE;
  const kinds: MealKind[] =
    mealsPerDay <= 2
      ? ['lunch', 'dinner']
      : mealsPerDay === 3
        ? ['breakfast', 'lunch', 'dinner']
        : mealsPerDay === 4
          ? ['breakfast', 'lunch', 'snack', 'dinner']
          : ['breakfast', 'snack', 'lunch', 'snack', 'dinner'];
  return structureFromKinds(kinds);
}

function dislikesText(p: PersonaInput): string | undefined {
  const parts = [p.dislikesOther, p.dislikes?.join(', ')].filter((t): t is string => !!t);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function answersOf(p: PersonaInput): QuizAnswersV1 {
  const goal = p.goal === 'lose' || p.goal === 'gain' ? p.goal : 'maintain';
  const target =
    goal === 'lose'
      ? Math.round(p.weightKg * 0.95 * 10) / 10
      : goal === 'gain'
        ? Math.round(p.weightKg * 1.05 * 10) / 10
        : undefined;
  const text = dislikesText(p);
  const activity = ACTIVITY[p.activity];
  return quizAnswers({
    body: {
      sex: p.sex,
      ageYears: p.ageYears,
      heightCm: p.heightCm,
      weightKg: p.weightKg,
      mode: p.mode,
    },
    goal: target !== undefined ? { goal, targetWeightKg: target } : { goal },
    diet: DIET[p.diet ?? 'omnivore'] ?? 'omnivore',
    health: {
      flags: [...(p.health ?? [])],
      pregnancy: p.pregnancy ?? 'none',
      lactation: p.lactation ?? 'none',
      custom: [],
    },
    allergies: { items: [...(p.allergens ?? [])], custom: [] },
    ...(text !== undefined ? { dislikesText: text } : {}),
    activity: { ...activity, strengthTraining: false, group: p.activity },
  });
}

const round = (value: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
};

type Entry = {
  id: string;
  status: string;
  energyKcal?: number;
  days?: number;
  within5?: number;
  proteinOk?: number;
  flags?: Record<string, number>;
  notes?: string[];
  distinctMains?: number;
  soups?: number;
};

type Outcome = { entry: Entry; plan?: Plan; violations: number };

function run(persona: Persona): Outcome {
  let answers: QuizAnswersV1;
  try {
    answers = answersOf(persona.input);
  } catch {
    return { entry: { id: persona.id, status: 'quizRejected' }, violations: 0 };
  }
  const built = buildMenuProfile(answers, { foods });
  if (!built.ok) return { entry: { id: persona.id, status: built.error.code }, violations: 0 };
  const profile = built.value;
  const structure = structureFor(persona.input.mealsPerDay);
  const result = generate({
    profile,
    foods,
    today: '2026-11-02',
    seed: 2026,
    iterationsPerDay: 60,
    structure,
  });
  if (!result.ok) return { entry: { id: persona.id, status: result.error.code }, violations: 0 };
  const { plan } = result.value;
  const target = plan.targets;
  const days = plan.days;
  const within5 = days.filter(
    (d) => Math.abs((d.totals.energyKcal ?? 0) / target.energyKcal - 1) <= 0.05,
  ).length;
  const proteinOk = days.filter((d) => {
    const g = d.totals.proteinG ?? 0;
    return g >= target.proteinG.min && g <= target.proteinG.max;
  }).length;
  const flags: Record<string, number> = {};
  for (const d of days) for (const f of d.flags) flags[f.code] = (flags[f.code] ?? 0) + 1;
  const mains = new Set<string>();
  let soups = 0;
  for (const d of days) {
    for (const [mealId, list] of Object.entries(d.meals)) {
      for (const item of list) {
        if (item.slot === 'soup') soups += 1;
        if (item.slot === 'core' && (mealId === 'lunch' || mealId === 'dinner'))
          mains.add(item.itemId);
      }
    }
  }
  const violations = hardViolations(buildContext(profile, foods, structure, []), days);
  return {
    plan,
    violations: violations.length,
    entry: {
      id: persona.id,
      status: 'plan',
      energyKcal: Math.round(target.energyKcal),
      days: days.length,
      within5: round(within5 / days.length, 2),
      proteinOk: round(proteinOk / days.length, 2),
      flags: Object.fromEntries(Object.entries(flags).sort(([a], [b]) => (a < b ? -1 : 1))),
      notes: plan.notes.map((n) => n.code).sort(),
      distinctMains: mains.size,
      soups,
    },
  };
}

describe('menu engine over the reference personas', () => {
  const outcomes = new Map<string, Outcome>();
  for (const persona of personas) outcomes.set(persona.id, run(persona));

  it('covers all 88 personas', () => {
    expect(personas).toHaveLength(88);
  });

  it('refusals agree with the expected guardrail status', () => {
    for (const persona of personas) {
      const status = persona.expected.guardrail?.status;
      const got = outcomes.get(persona.id)?.entry.status;
      if (got === 'quizRejected') {
        // The quiz itself would not accept this person: only for invalid input or values off the quiz wheels.
        const i = persona.input;
        const offWheel =
          (i.sex as string) === 'unspecified' ||
          !Number.isInteger(i.ageYears) ||
          i.weightKg < 5 ||
          i.ageYears < 1;
        expect([persona.id, !!persona.expected.inputError || offWheel]).toEqual([persona.id, true]);
        continue;
      }
      if (status === 'refused') expect([persona.id, got]).toEqual([persona.id, 'refused']);
      else if (status === 'requiresAdult')
        expect([persona.id, got]).toEqual([persona.id, 'requiresAdult']);
      else if (status !== undefined)
        expect([persona.id, got === 'refused' || got === 'requiresAdult']).toEqual([
          persona.id,
          false,
        ]);
    }
  });

  it('plans have no hard violations and no rules, injection text stays harmless', () => {
    for (const persona of personas) {
      const out = outcomes.get(persona.id);
      if (!out?.plan) continue;
      expect([persona.id, out.violations]).toEqual([persona.id, 0]);
      expect(out.plan.rules).toHaveLength(0);
      const text = dislikesText(persona.input);
      for (const note of out.plan.notes)
        if (note.code === 'dislikesUnmatched') expect(note.text).toBe(text);
      for (const day of out.plan.days)
        for (const list of Object.values(day.meals))
          for (const item of list) {
            expect(item.reasons).not.toContain('ruleByUser');
            expect(item.reasons).not.toContain('ruleByKiki');
          }
    }
  });

  it('summary snapshot', () => {
    const summary = personas.map((p) => outcomes.get(p.id)?.entry);
    expect(summary).toMatchSnapshot();
  });
});
