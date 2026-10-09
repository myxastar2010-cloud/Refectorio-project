import { AGE_LIMITS } from './guardrails';
import type { ActivityGroup, ExerciseFrequency, Lifestyle } from './types';

/**
 * Quiz answers → physical activity level (PAL) → activity group (КФА) of МР 2.3.1.0253-21
 * (research/stage-2-mappings.md §5).
 *
 * Adults: the lifestyle answer gives the base PAL of an ordinary day, sports sessions add to it; the result is mapped
 * onto the four КФА groups (1.4 / 1.6 / 1.9 / 2.2, data/mr-2021-energy.json) by the midpoints between them.
 * Sources: МР 2.3.1.0253-21 (4 groups for both sexes, by the kind of work); FAO/WHO/UNU (2004) «Human energy
 * requirements», ch. 5, table 5.3 (sedentary 1.40–1.69, active 1.70–1.99, vigorous 2.00–2.40) and its example: one hour
 * of moderate-to-vigorous activity a day raises PAL by ≈0.20 — sessions per week are scaled linearly from it (⚠).
 * PAL is computed in integer hundredths, so a sum never lands on the wrong side of a threshold.
 * Minors: the lifestyle question is about work, so only sports sessions count (⚠ low confidence, §5.4).
 */
export const ACTIVITY_MAPPING = {
  lifestyleBasePal100: {
    mostlySitting: 140,
    sometimesStanding: 150,
    mostlyStanding: 160,
    // Lower edge of FAO «active»: a base without sport (FAO's 1.75 already includes an hour of exercise).
    movingAllDay: 170,
    // Lower edge of FAO «vigorous»: heavy work is better slightly overestimated than underfed.
    physicalLabour: 200,
  },
  /** FAO: an hour a day ≈ +0.20 → n sessions of ≈ 45–60 min a week ≈ 0.20 × n / 7 (middle of each answer). */
  exercisePal100: {
    none: 0,
    '1to2': 4,
    '3to4': 10,
    '5to6': 15,
    daily: 20,
  },
  /** FAO: PAL above 2.40 is hard to sustain. */
  maxPal100: 240,
  /** Upper PAL limits of groups I–III: midpoints between 1.4, 1.6, 1.9 and 2.2. */
  groupBelowPal100: [
    { group: 'kfa1', below: 150 },
    { group: 'kfa2', below: 175 },
    { group: 'kfa3', below: 205 },
  ],
  topGroup: 'kfa4',
  /** Under 18: sports sessions → group (NASEM categories, algorithm-spec.md §4.3). */
  minorGroups: {
    none: 'kfa1',
    '1to2': 'kfa2',
    '3to4': 'kfa3',
    '5to6': 'kfa3',
    daily: 'kfa4',
  },
} as const satisfies {
  lifestyleBasePal100: Record<Lifestyle, number>;
  exercisePal100: Record<ExerciseFrequency, number>;
  maxPal100: number;
  groupBelowPal100: readonly { group: ActivityGroup; below: number }[];
  topGroup: ActivityGroup;
  minorGroups: Record<ExerciseFrequency, ActivityGroup>;
};

export type ActivityAnswers = {
  readonly exercise: ExerciseFrequency;
  readonly lifestyle: Lifestyle;
  /**
   * Strength sessions are already counted in `exercise`; the flag does not change PAL — stage 3 uses it for protein
   * (ISSN 2017: 1.4–2.0 g/kg).
   */
  readonly strengthTraining: boolean;
  readonly ageYears: number;
};

export type ActivityEstimate = {
  /** Adults: the continuous estimate (stage 3 may use it instead of the group). Minors: the group's PAL. */
  readonly pal: number;
  readonly group: ActivityGroup;
};

const GROUP_PAL100: Record<ActivityGroup, number> = { kfa1: 140, kfa2: 160, kfa3: 190, kfa4: 220 };

export function activityFromLifestyle(answers: ActivityAnswers): ActivityEstimate {
  const m = ACTIVITY_MAPPING;
  if (answers.ageYears < AGE_LIMITS.minorUnderYears) {
    const group = m.minorGroups[answers.exercise];
    return { pal: GROUP_PAL100[group] / 100, group };
  }
  const pal100 = Math.min(
    m.maxPal100,
    m.lifestyleBasePal100[answers.lifestyle] + m.exercisePal100[answers.exercise],
  );
  const group = m.groupBelowPal100.find((band) => pal100 < band.below)?.group ?? m.topGroup;
  return { pal: pal100 / 100, group };
}
