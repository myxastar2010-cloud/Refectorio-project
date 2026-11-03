/**
 * @refectorio/food-data — the menu's food data (ADR 0015): roles, meal types, allergens, portions, nutrients per
 * portion (USDA SR Legacy with cooking losses), ingredients and texts. Built by scripts from sources only; the
 * browser loads two chunks (food-core, food-text).
 */
export * from './nutrients';
export * from './retention';
export * from './schema';
export * from './sources';
export {
  checkPortion,
  computeRecipe,
  COVERAGE_MIN,
  FAT_KCAL_PER_G,
  WATER_ID,
  type Computed,
  type IngredientRecord,
  type Recipe,
  type RecipeIngredient,
  type RetentionTable,
} from './compute';
export { ingredientAllergens, ingredientAnimal, ingredientTraces } from './allergens';
export { assemble, fishMercury, type AssembleInput, type AssembleOutput } from './assemble';
export { decodeFoodCore, type FoodItem } from './decode';
