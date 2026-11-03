/**
 * The engine's thresholds: every number lives in `data/rules.json` with its source and confidence (research/R17 and
 * related); the code refers to rule ids only. Loading checks that the file has exactly the ids the code knows.
 */
import { z } from 'zod';
import rulesJson from '../data/rules.json';

export const RULE_IDS = [
  'E1.vegFruitMinG',
  'E1.vegFruitMinGAge6to9',
  'E1.vegFruitMinGAge2to5',
  'E2.fibreMinG',
  'E2.fibreFloorG',
  'E3.freeSugarsMaxShare',
  'E3.freeSugarsGoalShare',
  'E4.sodiumMaxMg',
  'E5.satFatMaxShare',
  'E6.fatShareMin',
  'E6.fatShareMax',
  'E6.fatShareLimit',
  'E7.carbShareMin',
  'E7.carbShareMax',
  'E8.excludeHighMercury',
  'E9.bestFishMaxGWeek',
  'E9.goodFishMaxGWeek',
  'E9.oilyFishMaxServingsWeek',
  'E9.tunaMaxServingsWeek',
  'E9.fishServingG',
  'E10.fishTargetGWeek',
  'E11.caffeineDayMaxMg',
  'E11.caffeineSingleMaxMg',
  'E12.caffeinePregnancyDayMaxMg',
  'E13.caffeineMinorMgPerKgDay',
  'E13.caffeineNoneUnderAgeYears',
  'E14.caffeineSmallDoseMg',
  'E14.caffeineCutoffHoursSmall',
  'E14.caffeineCutoffHoursLarge',
  'E14.bedtimeHour',
  'E14.mealHour.breakfast',
  'E14.mealHour.lunch',
  'E14.mealHour.snack',
  'E14.mealHour.dinner',
  'E15.proteinPerMealMinGPerKg',
  'E16.minMainMealsProtected',
  'E16.minMainMeals',
  'E16.maxMeals',
  'E17.share.breakfast',
  'E17.share.lunch',
  'E17.share.dinner',
  'E17.share.snacks',
  'E17.shareTolerance',
  'E18.glassMl',
  'E19.repeatWindowDays',
  'E19.proteinBaseMaxPerWeekPerMeal',
  'E21.herbalTeaMaxCupsDay',
  'E22.redMeatMaxCookedGWeek',
  'E22.redMeatCookedPerRawG',
  'E23.processedMeatMaxServingsWeek',
  'E24.potassiumMinMg',
  'E25.mealWeightTolerance',
  'E25.mealWeightG.breakfast',
  'E25.mealWeightG.lunch',
  'E25.mealWeightG.dinner',
  'E25.mealWeightG.snack',
  'G.vitaminKHighUgPerPortion',
  'G.limitAddedSugarFreeSugarsMaxShare',
  'P.portionFactorMin',
  'P.portionFactorMax',
  'P.portionFactorStep',
  'P.drinkVolumeMinMl',
  'P.drinkVolumeMaxMl',
  'P.drinkVolumeStepMl',
  'P.dessertMaxPerDay',
  'P.friedMaxPerWeek',
  'P.legumesMinServingsWeek',
  'P.wholeGrainMinServingsDay',
  'P.dairyMinServingsDay',
  'P.nutsMinServingsWeek',
  'P.cuisineStreakMax',
  'P.weekdayCookMaxMin',
  'P.repeatWindowDays.salad',
  'P.repeatWindowDays.side',
  'P.repeatWindowDays.snack',
  'P.repeatWindowDays.dessert',
  'P.repeatWindowDays.component',
  'P.repeatAnyMealDays',
  'P.weekdayCookFlagMin',
  'P.sweetDrinkFreeSugarsG',
  'S.doneEnergyMinShare',
  'S.doneEnergyMaxShare',
  'S.editablePastDays',
  'S.energyToleranceShare',
  'S.energyToleranceRelaxedShare',
  'S.repeatWindowRelaxedDays',
  'P.dryLegumeToCooked',
  'P.serving.legumesG',
  'P.serving.wholeGrainG',
  'P.serving.nutsG',
  'P.serving.processedMeatG',
  'P.serving.dairyLiquidG',
  'P.serving.dairyCheeseG',
  'P.serving.dairyTvorogG',
  'P.highProteinShare',
  'P.highProteinMinG',
  'P.quickMaxMin',
  'P.spicyTrait',
  'S.flagMarginShare',
  'S.sodiumDayFlagShare',
  'X.tasteMatchMin',
  'X.vegetablesMinG',
  'X.fibreRichMinG',
  'X.lowSaltMaxMg',
  'X.wholeGrainMinG',
  'X.lightDinnerRichnessMax',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

const ruleSchema = z.object({
  id: z.enum(RULE_IDS),
  value: z.number().nonnegative(),
  unit: z.string().min(1),
  kind: z.enum(['hard', 'soft', 'check']),
  population: z.string().min(1),
  source: z.string().min(5),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type RuleRecord = z.infer<typeof ruleSchema>;

const rulesFileSchema = z.object({
  version: z.string(),
  research: z.string(),
  legend: z.string(),
  rules: z.array(ruleSchema),
});

function load(): ReadonlyMap<RuleId, RuleRecord> {
  const file = rulesFileSchema.parse(rulesJson);
  const map = new Map<RuleId, RuleRecord>();
  for (const rule of file.rules) {
    if (map.has(rule.id)) throw new Error(`rules.json: duplicate ${rule.id}`);
    map.set(rule.id, rule);
  }
  const missing = RULE_IDS.filter((id) => !map.has(id));
  if (missing.length > 0) throw new Error(`rules.json: missing ${missing.join(', ')}`);
  return map;
}

export const RULES: ReadonlyMap<RuleId, RuleRecord> = load();
export const RULES_VERSION: string = rulesFileSchema.shape.version.parse(rulesJson.version);

export function rule(id: RuleId): number {
  const found = RULES.get(id);
  if (!found) throw new Error(`unknown rule ${id}`);
  return found.value;
}
