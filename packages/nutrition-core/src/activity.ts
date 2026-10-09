import type { ActivityGroup, ExerciseFrequency, Lifestyle } from './types';

/**
 * Quiz answers → physical activity level (PAL) → activity group (КФА) of МР 2.3.1.0253-21.
 *
 * The lifestyle answer gives the base PAL of an ordinary day, sports sessions add to it; the result is mapped onto the
 * four КФА groups (1.4 / 1.6 / 1.9 / 2.2, data/mr-2021-energy.json) by the midpoints between them.
 * Sources: FAO/WHO/UNU (2004) «Human energy requirements», ch. 5 (lifestyle PAL bands 1.40–1.69 sedentary or light,
 * 1.70–1.99 active, 2.00–2.40 vigorous; one hour of moderate activity a day raises PAL by ≈0.15–0.2);
 * МР 2.3.1.0253-21 (groups I–IV). ⚠ The increments are an engineering estimate — research/stage-2-mappings.md §5.
 */
export const ACTIVITY_MAPPING = {
  lifestyleBasePal: {
    mostlySitting: 1.4,
    sometimesStanding: 1.5,
    mostlyStanding: 1.6,
    movingAllDay: 1.75,
    physicalLabour: 1.9,
  },
  /** Typical session ≈ 45–60 min of moderate-to-vigorous sport, spread over the week. */
  exercisePalIncrement: {
    none: 0,
    '1to2': 0.05,
    '3to4': 0.1,
    '5to6': 0.15,
    daily: 0.2,
  },
  /** Upper PAL limits of groups I–III: midpoints between the group PALs 1.4, 1.6, 1.9 and 2.2. */
  groupBelowPal: [
    { group: 'kfa1', below: 1.5 },
    { group: 'kfa2', below: 1.75 },
    { group: 'kfa3', below: 2.05 },
  ],
  topGroup: 'kfa4',
} as const satisfies {
  lifestyleBasePal: Record<Lifestyle, number>;
  exercisePalIncrement: Record<ExerciseFrequency, number>;
  groupBelowPal: readonly { group: ActivityGroup; below: number }[];
  topGroup: ActivityGroup;
};

export type ActivityAnswers = {
  readonly exercise: ExerciseFrequency;
  readonly lifestyle: Lifestyle;
  /**
   * Strength sessions are already counted in `exercise`; the flag does not change PAL — stage 3 uses it for protein
   * (ISSN 2017: 1.4–2.0 g/kg).
   */
  readonly strengthTraining: boolean;
};

export type ActivityEstimate = {
  /** Rounded to 0.01 (the inputs are steps of 0.05). */
  readonly pal: number;
  readonly group: ActivityGroup;
};

export function activityFromLifestyle(answers: ActivityAnswers): ActivityEstimate {
  const raw =
    ACTIVITY_MAPPING.lifestyleBasePal[answers.lifestyle] +
    ACTIVITY_MAPPING.exercisePalIncrement[answers.exercise];
  const pal = Math.round(raw * 100) / 100;
  const group =
    ACTIVITY_MAPPING.groupBelowPal.find((band) => pal < band.below)?.group ??
    ACTIVITY_MAPPING.topGroup;
  return { pal, group };
}
