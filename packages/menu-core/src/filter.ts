/**
 * The hard filter (ТЗ фаза 3 §3.1): what never goes on this person's menu, whatever the taste, targets or requests.
 * Allergens (traces too for a severe allergy; R07: an intolerance excludes like an allergy), diet, guardrail dish
 * rules, pregnancy and lactation (R17 E8, E9, E21, E27), minors (E13, E27), the person's own exclusions. Never relaxed.
 */
import type { AllergenCode } from '@refectorio/nutrition-core';
import type { MenuFood } from './foods';
import type { SafetyContext } from './profile';
import { rule } from './rules';

export const HARD_REASONS = [
  'allergen',
  'allergenTrace',
  'allergenServing',
  'diet',
  'pregnancy',
  'alcohol',
  'minorCaffeine',
  'highMercury',
  'tyramine',
  'excludedByPerson',
  'trackedSeparately',
] as const;
export type HardReason = (typeof HARD_REASONS)[number];

export type Verdict =
  | {
      readonly ok: true;
      /** Serving add-ons to leave out (nuts on porridge for a nut allergy). */
      readonly servedWithout: readonly AllergenCode[];
      /** `stableVitaminK`: the solver keeps this item at its standard portion. */
      readonly fixedPortion: boolean;
    }
  | { readonly ok: false; readonly reasons: readonly HardReason[] };

/** R17 §9, E21: in pregnancy these are excluded (NHS); cured fish and meat, mould cheese only heated — ours are not. */
const PREGNANCY_FLAGS = [
  'rawFish',
  'rawEgg',
  'unpasteurised',
  'curedFish',
  'curedMeat',
  'mouldCheese',
  'liver',
  'alcohol',
] as const;

function dietAllows(food: MenuFood, diet: SafetyContext['diet']): boolean {
  const f = food.item.flags;
  const eggs = food.categories.has('eggs') || food.item.allergens.includes('EGG');
  const dairy = food.categories.has('dairy') || food.item.allergens.includes('MILK');
  const pork = food.categories.has('pork') || food.features.proteins.includes('pork');
  const gelatin = food.features.extras?.includes('gelatin') === true;
  switch (diet) {
    case 'omnivore':
      return true;
    case 'pescatarian':
      return f.has('pescatarian');
    case 'vegetarianLactoOvo':
      return f.has('vegetarian');
    case 'vegetarianLacto':
      return f.has('vegetarian') && !eggs;
    case 'vegetarianOvo':
      return f.has('vegetarian') && !dairy;
    // Strict Lent days are vegan; the engine does not model the church calendar (D-082).
    case 'vegan':
    case 'lentLay':
      return f.has('vegan');
    case 'halal':
      return !pork && !gelatin && !f.has('alcohol');
    case 'kosher':
      return (
        !pork &&
        !gelatin &&
        !food.categories.has('seafood') &&
        !(food.categories.has('meat') && dairy)
      );
  }
}

export function checkFood(food: MenuFood, safety: SafetyContext): Verdict {
  const reasons = new Set<HardReason>();
  const item = food.item;
  const servedWithout: AllergenCode[] = [];
  for (const [code, level] of safety.allergens) {
    if (item.allergens.includes(code)) reasons.add('allergen');
    if (level === 'severeAllergy') {
      if (item.traces.includes(code)) reasons.add('allergenTrace');
      if (item.servingAllergens.includes(code)) reasons.add('allergenServing');
    } else if (item.servingAllergens.includes(code) && !item.allergens.includes(code)) {
      servedWithout.push(code);
    }
  }
  if (!dietAllows(food, safety.diet)) reasons.add('diet');
  if (food.item.fishMercury === 'avoid' && rule('E8.excludeHighMercury') === 1)
    reasons.add('highMercury');
  if (safety.pregnant && PREGNANCY_FLAGS.some((flag) => item.flags.has(flag)))
    reasons.add('pregnancy');
  if ((safety.lactating || safety.ageYears < 18) && item.flags.has('alcohol'))
    reasons.add('alcohol');
  if (
    safety.ageYears < rule('E13.caffeineNoneUnderAgeYears') &&
    food.role === 'drink' &&
    food.caffeineMg >= 1
  )
    reasons.add('minorCaffeine');
  if (
    safety.dishRules.has('excludeHighTyramine') &&
    (food.categories.has('highTyramine') ||
      item.flags.has('curedMeat') ||
      item.flags.has('mouldCheese'))
  )
    reasons.add('tyramine');
  const ex = safety.excluded;
  if (
    ex.itemIds.has(food.id) ||
    [...ex.categories].some((c) => food.categories.has(c)) ||
    item.ingredients.some((i) => ex.ingredientIds.has(i.id))
  )
    reasons.add('excludedByPerson');
  if (food.trackedSeparately) reasons.add('trackedSeparately');
  if (reasons.size > 0) return { ok: false, reasons: [...reasons] };
  // Unknown is not zero (ADR 0015): an item without vitamin K data keeps its standard portion on warfarin too.
  const vitaminK = item.perPortion.vitaminKUg;
  return {
    ok: true,
    servedWithout: [...new Set(servedWithout)].sort(),
    fixedPortion:
      safety.dishRules.has('stableVitaminK') &&
      (vitaminK === null || vitaminK >= rule('G.vitaminKHighUgPerPortion')),
  };
}
