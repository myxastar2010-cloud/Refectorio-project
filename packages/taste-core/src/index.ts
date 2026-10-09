/**
 * @refectorio/taste-core — the dish taste catalog and Bayesian adaptive taste elicitation for the game
 * «Выберите блюдо». Pure TypeScript, deterministic with a seed, no UI (research/R15, ADR 0008).
 */
export * from './catalog';
export {
  applyAnswer,
  createTasteSession,
  initialState,
  nextCard,
  prepareCatalog,
  type PreparedCatalog,
  type TasteSession,
  type TasteState,
} from './engine';
export { buildFeatureSpace, encode, type FeatureSpace, type SparseVector } from './features';
export {
  DEFAULT_PRIOR,
  latent,
  likeProbability,
  priorPosterior,
  update,
  type Posterior,
  type PriorConfig,
} from './model';
export { buildProfile, ENGINE_VERSION, HINT_RULES, HINTS, tasteHints } from './profile';
export { createRandom, hashUnit, type Random } from './random';
export { candidates, score, selectNext, SELECTION, type Strategy } from './selection';
export { PRIOR_SKIP_BELIEF, SKIP_MODEL, skipProbability, updateSkipBelief } from './skip';
export { bald, predictiveProbability, sigmoid } from './stats';
export {
  PHOTO_PROVIDERS,
  photoManifestSchema,
  photoSchema,
  type DishPhoto,
  type PhotoManifest,
} from './photos';
