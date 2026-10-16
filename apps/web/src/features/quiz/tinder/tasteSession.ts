import type { TasteDecision, TasteHint, TasteProfileV1 } from '@refectorio/contracts';
import {
  createTasteSession,
  prepareCatalog,
  type Catalog,
  type PreparedCatalog,
  type TasteSession,
} from '@refectorio/taste-core';
import catalogJson from '@refectorio/taste-core/data/catalog.json';
import { hasPhoto } from './photos';

/**
 * The dish catalog, prepared once per page (features, prior, near-duplicates). The JSON is validated against the
 * zod schema in the taste-core tests; here it is only typed, so the quiz chunk does not parse it again.
 */
let prepared: PreparedCatalog | null = null;
export function preparedCatalog(): PreparedCatalog {
  prepared ??= prepareCatalog(catalogJson as unknown as Catalog);
  return prepared;
}

/**
 * Dishes without a curated photo are not offered as cards (a generated placeholder is a poor first impression); the
 * profile still predicts them. When images.unsplash.com is unreachable, the curated ones show their blurhash.
 */
let hidden: ReadonlySet<string> | null = null;
function hiddenDishes(): ReadonlySet<string> {
  hidden ??= new Set(
    preparedCatalog()
      .dishes.filter((d) => !hasPhoto(d.id))
      .map((d) => d.id),
  );
  return hidden;
}

/** A game session restored from the saved decisions (deterministic replay). */
export const sessionFor = (seed: number, decisions: readonly TasteDecision[]): TasteSession =>
  createTasteSession(preparedCatalog(), seed, decisions, { hidden: hiddenDishes() });

export function tasteProfileOf(seed: number, decisions: readonly TasteDecision[]): TasteProfileV1 {
  return sessionFor(seed, decisions).profile();
}

/** Confident conclusions of the game (empty before any decisive answer). */
export function tasteHintsOf(seed: number, decisions: readonly TasteDecision[]): TasteHint[] {
  if (decisions.every((d) => d.answer === 'skip')) return [];
  return tasteProfileOf(seed, decisions).hints.map((h) => h.hint);
}
