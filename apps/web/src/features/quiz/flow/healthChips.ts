import type { HealthChipId } from '../../../content/quizSchema';

/**
 * The chips the design shows (stage 3, 4.13). The other conditions keep their ids and every rule, and appear as chips
 * only when the «+» text names them (flow/healthSynonyms.ts), like the extra allergens.
 */
export const SHOWN_HEALTH_CHIPS: readonly HealthChipId[] = [
  'diabetes',
  'hypertension',
  'hypothyroidism',
  'insulinResistance',
  'pregnancy',
];

/**
 * Hidden conditions whose miss costs most (review-health-synonyms.md B.2): somebody else's mention still shows them,
 * unticked, and a text written elsewhere in the quiz (the notes, the dislikes) offers to tick them.
 */
export const RISKY_HEALTH_CHIPS: readonly HealthChipId[] = [
  'kidneyDisease',
  'pku',
  'warfarin',
  'maoi',
  'eatingDisorder',
];
