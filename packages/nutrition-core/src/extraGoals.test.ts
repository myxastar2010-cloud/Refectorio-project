import { describe, expect, it } from 'vitest';
import { energyTarget } from './energy/target';
import { evaluateGuardrails } from './guardrails';
import { validateQuestionnaire, type QuestionnaireInput } from './input';

/**
 * «Помимо вашей основной цели…» (stage 3, §6; review-extra-goals.md): the extra goals are only stored. In particular
 * «Улучшить свою физическую форму» never raises activity or opens a deficit for a minor or after an eating disorder —
 * the guardrails and the energy target are exactly the same with and without them.
 */
const people: readonly QuestionnaireInput[] = [
  { ageYears: 16, sex: 'female', heightCm: 162, weightKg: 52, activity: 'kfa2', goal: 'maintain' },
  {
    ageYears: 24,
    sex: 'female',
    heightCm: 168,
    weightKg: 58,
    activity: 'kfa2',
    goal: 'maintain',
    health: ['eatingDisorderHistory'],
  },
  { ageYears: 35, sex: 'male', heightCm: 180, weightKg: 92, activity: 'kfa3', goal: 'lose' },
];

const plan = (input: QuestionnaireInput) => {
  const result = validateQuestionnaire(input);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  const decision = evaluateGuardrails(result.value);
  return { decision, energy: energyTarget(result.value, decision) };
};

describe('extra goals change no numbers', () => {
  it.each(people)('the same plan with every extra goal ticked (%#)', (person) => {
    expect(
      plan({ ...person, extraGoals: ['fitness', 'energy', 'overallHealth', 'sleep'] }),
    ).toEqual(plan(person));
  });
});
