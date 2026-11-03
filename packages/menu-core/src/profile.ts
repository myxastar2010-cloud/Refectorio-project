/**
 * Quiz answers → what the engine needs about the person (ТЗ фаза 3 §2): day targets from nutrition-core and research/
 * R17, the safety context for the hard filter, taste and exclusions. The guardrails are evaluated again from the
 * answers and merged with the stored snapshot — the stricter of the two wins.
 */
import {
  quizAnswersV1Schema,
  toQuestionnaireInput,
  type QuizAnswersV1,
} from '@refectorio/contracts';
import {
  energyTarget,
  effectiveMacroProfile,
  evaluateGuardrails,
  fiberTargetG,
  micronutrientNorms,
  profileMacros,
  validateQuestionnaire,
  waterTargetMl,
  type AllergenCode,
  type AllergenLevel,
  type Diet,
  type DishRule,
  type ExtraGoal,
  type GuardrailDecision,
  type MacroProfile,
  type Questionnaire,
  type Regime,
} from '@refectorio/nutrition-core';
import type { FoodIndex } from './foods';
import { rule } from './rules';
import {
  createTermResolver,
  resolveAllergens,
  unmatchedWords,
  type CategoryId,
  type TermMatch,
} from './taxonomy';
import { err, ok, type DayTargets, type Result } from './types';

export type SafetyContext = {
  readonly ageYears: number;
  readonly weightKg: number;
  readonly allergens: ReadonlyMap<AllergenCode, AllergenLevel>;
  readonly diet: Diet;
  readonly pregnant: boolean;
  readonly lactating: boolean;
  readonly dishRules: ReadonlySet<DishRule>;
  readonly forbiddenRegimes: ReadonlySet<Regime>;
  readonly deemphasizeNumbers: boolean;
  /** R17 E16: main meals that may never be removed. */
  readonly minMainMeals: number;
  /** From «не ем…» and allergies typed in the quiz: hard exclusions. */
  readonly excluded: {
    readonly categories: ReadonlySet<CategoryId>;
    readonly ingredientIds: ReadonlySet<string>;
    readonly itemIds: ReadonlySet<string>;
  };
};

export type MenuProfile = {
  readonly hash: string;
  readonly questionnaire: Questionnaire;
  readonly decision: GuardrailDecision;
  readonly goal: Questionnaire['goal'];
  readonly macroProfile: MacroProfile;
  readonly macroProfileAdjusted: boolean;
  readonly targets: DayTargets;
  readonly safety: SafetyContext;
  readonly extraGoals: ReadonlySet<ExtraGoal>;
  /** pLike of the game dishes (taste-core) and the posterior summary for the other items. */
  readonly taste: {
    readonly predictions: ReadonlyMap<string, number>;
    readonly features: ReadonlyMap<string, { readonly mean: number; readonly variance: number }>;
  };
  /** Free text of dislikes and allergies that matched nothing (kept for Kiki, never guessed). */
  /** Dislike and allergy text the engine could not map exactly: Kiki asks, the UI shows it before the menu. */
  readonly unmatchedDislikes: readonly string[];
  readonly unmatchedAllergies: readonly string[];
};

export type ProfileError =
  | { readonly code: 'invalidAnswers'; readonly detail: string }
  | { readonly code: 'refused' | 'requiresAdult' | 'noIndividualEnergy' };

const STATUS_ORDER = ['allowed', 'requiresDoctor', 'limited', 'requiresAdult', 'refused'] as const;
const union = <T>(a: readonly T[], b: readonly T[]): T[] => [...new Set([...a, ...b])];

/** The stricter of two decisions: status, permissions intersected, restrictions united. */
export function mergeDecisions(a: GuardrailDecision, b: GuardrailDecision): GuardrailDecision {
  const status =
    STATUS_ORDER.indexOf(a.status) >= STATUS_ORDER.indexOf(b.status) ? a.status : b.status;
  return {
    status,
    reasons: union(a.reasons, b.reasons),
    referToDoctor: union(a.referToDoctor, b.referToDoctor),
    allowedGoals: a.allowedGoals.filter((g) => b.allowedGoals.includes(g)),
    energyDeficitAllowed: a.energyDeficitAllowed && b.energyDeficitAllowed,
    energySurplusAllowed: a.energySurplusAllowed && b.energySurplusAllowed,
    deemphasizeNumbers: a.deemphasizeNumbers || b.deemphasizeNumbers,
    forbiddenRegimes: union(a.forbiddenRegimes, b.forbiddenRegimes),
    dishRules: union(a.dishRules, b.dishRules),
    guestOnly: a.guestOnly || b.guestOnly,
    individualEnergy: a.individualEnergy && b.individualEnergy,
  };
}

/** FNV-1a over a canonical JSON (sorted keys): the same inputs give the same hash on every device. */
export function stableHash(value: unknown): string {
  const canonical = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
    if (v && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
    }
    return JSON.stringify(v);
  };
  const text = canonical(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const PROTECTED_REASONS = new Set([
  'TEEN_NO_ENERGY_GOALS',
  'CHILD_FAMILY_MODE',
  'CHILD_NEEDS_ADULT',
  'PREGNANCY',
  'LACTATION',
  'DIABETES_TYPE2',
  'ED_SCREEN_POSITIVE',
  'ED_HISTORY',
  'BMI_UNDERWEIGHT',
]);

function vegFruitMinG(ageYears: number): number {
  if (ageYears >= 10) return rule('E1.vegFruitMinG');
  if (ageYears >= 6) return rule('E1.vegFruitMinGAge6to9');
  if (ageYears >= 2) return rule('E1.vegFruitMinGAge2to5');
  return 0;
}

/** Caffeine caps (R17 E11–E13): the lowest that applies. */
function caffeineCaps(q: Questionnaire): { day: number; single: number } {
  let day = rule('E11.caffeineDayMaxMg');
  let single = rule('E11.caffeineSingleMaxMg');
  if (q.pregnancy !== 'none' || q.lactation !== 'none')
    day = Math.min(day, rule('E12.caffeinePregnancyDayMaxMg'));
  if (q.ageYears < 18) {
    day = Math.min(day, rule('E13.caffeineMinorMgPerKgDay') * q.weightKg);
    single = Math.min(single, day);
  }
  return { day, single: Math.min(single, day) };
}

export type BuildProfileOptions = {
  readonly foods?: FoodIndex;
};

export function buildMenuProfile(
  answersInput: unknown,
  options: BuildProfileOptions = {},
): Result<MenuProfile, ProfileError> {
  const parsed = quizAnswersV1Schema.safeParse(answersInput);
  if (!parsed.success)
    return err({ code: 'invalidAnswers', detail: parsed.error.issues[0]?.message ?? '' });
  const answers: QuizAnswersV1 = parsed.data;
  const validated = validateQuestionnaire(toQuestionnaireInput(answers));
  if (!validated.ok)
    return err({ code: 'invalidAnswers', detail: validated.error[0]?.code ?? 'input' });
  const q = validated.value;
  const decision = mergeDecisions(evaluateGuardrails(q), {
    ...answers.guardrails,
    reasons: [...answers.guardrails.reasons],
    referToDoctor: [...answers.guardrails.referToDoctor],
    allowedGoals: [...answers.guardrails.allowedGoals],
    forbiddenRegimes: [...answers.guardrails.forbiddenRegimes],
    dishRules: [...answers.guardrails.dishRules],
  });
  if (decision.status === 'refused') return err({ code: 'refused' });
  if (decision.status === 'requiresAdult') return err({ code: 'requiresAdult' });
  const energy = energyTarget(q, decision);
  if (energy.kind === 'none') return err({ code: 'noIndividualEnergy' });
  const kcal = energy.targetKcal;
  const goal = energy.kind === 'adult' ? energy.goal : 'maintain';

  const { profile: macroProfile, adjusted } = effectiveMacroProfile(q.macroProfile, q, decision);
  const macros = profileMacros(q, kcal, goal, macroProfile);
  const fibreTarget = fiberTargetG(q.ageYears, kcal) ?? 0;
  const fibreMin = q.ageYears >= 18 ? rule('E2.fibreMinG') : fibreTarget;
  const freeShare = decision.dishRules.includes('limitAddedSugar')
    ? rule('G.limitAddedSugarFreeSugarsMaxShare')
    : rule('E3.freeSugarsMaxShare');
  const freeSugarsMaxG = q.ageYears < 2 ? 0 : (freeShare * kcal) / 4;
  // WHO (S13, S14): children's sodium and potassium scale down with their energy need; adults' 2000 kcal reference.
  const childScale = q.ageYears < 16 ? Math.min(1, kcal / 2000) : 1;
  const caps = caffeineCaps(q);
  const micros = micronutrientNorms(q);
  const { potassiumMg: potassiumNorm, ...microsWithoutPotassium } = micros;

  const targets: DayTargets = {
    energyKcal: kcal,
    proteinG: macros.proteinG,
    fatG: macros.fatG,
    carbsG: macros.carbsG,
    fibreG: { min: Math.min(fibreMin, fibreTarget), target: fibreTarget },
    freeSugarsMaxG,
    freeSugarsGoalG: q.ageYears < 2 ? 0 : (rule('E3.freeSugarsGoalShare') * kcal) / 4,
    satFatMaxG: (rule('E5.satFatMaxShare') * kcal) / 9,
    sodiumMaxMg: rule('E4.sodiumMaxMg') * childScale,
    potassiumMinMg: rule('E24.potassiumMinMg') * childScale,
    vegFruitMinG: vegFruitMinG(q.ageYears),
    waterTotalMl: waterTargetMl(q),
    glassMl: rule('E18.glassMl'),
    caffeineMaxMg: q.ageYears < rule('E13.caffeineNoneUnderAgeYears') ? 0 : caps.day,
    caffeineSingleMaxMg: q.ageYears < rule('E13.caffeineNoneUnderAgeYears') ? 0 : caps.single,
    mealProteinMinG: q.ageYears >= 18 ? rule('E15.proteinPerMealMinGPerKg') * q.weightKg : 0,
    micros: potassiumNorm
      ? { ...microsWithoutPotassium, potassiumMg: potassiumNorm }
      : microsWithoutPotassium,
  };

  const resolver = createTermResolver(
    options.foods
      ? {
          ingredients: [
            ...new Map(
              options.foods.foods.flatMap((f) => f.item.ingredients.map((i) => [i.id, i] as const)),
            ).values(),
          ],
          items: options.foods.foods.map((f) => ({ id: f.id, nameRu: f.nameRu })),
        }
      : undefined,
  );
  const categories = new Set<CategoryId>();
  const ingredientIds = new Set<string>();
  const itemIds = new Set<string>();
  const allergens = new Map(q.allergens.map((a) => [a.code, a.level] as const));
  const LEVEL = { intolerance: 0, allergy: 1, severeAllergy: 2 } as const;
  const unmatchedDislikes: string[] = [];
  const unmatchedAllergies: string[] = [];
  const texts = [
    ...(answers.dislikesText?.trim() ? [{ text: answers.dislikesText, allergy: false }] : []),
    ...answers.allergies.custom.filter((t) => t.trim()).map((text) => ({ text, allergy: true })),
  ];
  for (const { text, allergy } of texts) {
    // Only exact words exclude: a typo match («корица» → курица) would exclude the wrong food and keep the right one
    // (review of phase 3, C1). It stays unmatched — Kiki asks «вы имели в виду…?».
    const matches: Pick<TermMatch, 'start' | 'end'>[] = [];
    for (const m of resolver(text)) {
      if (m.confidence < 0.8) continue;
      matches.push(m);
      if (m.kind === 'category') categories.add(m.id as CategoryId);
      else if (m.kind === 'ingredient') ingredientIds.add(m.id);
      else itemIds.add(m.id);
    }
    for (const a of resolveAllergens(text, !allergy)) {
      matches.push(a);
      const level = allergy ? 'allergy' : 'intolerance';
      const now = allergens.get(a.code);
      if (now === undefined || LEVEL[level] > LEVEL[now]) allergens.set(a.code, level);
    }
    if (unmatchedWords(text, matches).length > 0)
      (allergy ? unmatchedAllergies : unmatchedDislikes).push(text);
  }

  const protectedMeals =
    q.ageYears < 18 ||
    decision.reasons.some((r) => PROTECTED_REASONS.has(r)) ||
    decision.forbiddenRegimes.includes('intermittentFasting');

  return ok({
    hash: stableHash({
      body: answers.body,
      goal: answers.goal,
      diet: answers.diet,
      macroProfile: answers.macroProfile,
      health: answers.health,
      allergies: answers.allergies,
      dislikesText: answers.dislikesText,
      activity: answers.activity,
      extraGoals: answers.extraGoals,
      taste: { predictions: answers.taste.predictions, features: answers.taste.features },
    }),
    questionnaire: q,
    decision,
    goal,
    macroProfile,
    macroProfileAdjusted: adjusted,
    targets,
    safety: {
      ageYears: q.ageYears,
      weightKg: q.weightKg,
      allergens,
      diet: q.diet,
      pregnant: q.pregnancy !== 'none',
      lactating: q.lactation !== 'none',
      dishRules: new Set(decision.dishRules),
      forbiddenRegimes: new Set(decision.forbiddenRegimes),
      deemphasizeNumbers: decision.deemphasizeNumbers,
      minMainMeals: protectedMeals ? rule('E16.minMainMealsProtected') : rule('E16.minMainMeals'),
      excluded: { categories, ingredientIds, itemIds },
    },
    extraGoals: new Set(answers.extraGoals ?? []),
    taste: {
      predictions: new Map(answers.taste.predictions.map((p) => [p.dishId, p.pLike])),
      features: new Map(
        answers.taste.features.map((f) => [f.id, { mean: f.mean, variance: f.variance }]),
      ),
    },
    unmatchedDislikes,
    unmatchedAllergies,
  });
}
