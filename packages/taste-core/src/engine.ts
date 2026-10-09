import {
  DECISIVE_ANSWERS_REQUIRED,
  decisiveCount,
  type TasteAnswer,
  type TasteDecision,
  type TasteProfileV1,
} from '@refectorio/contracts';
import type { Catalog, Dish } from './catalog';
import { buildFeatureSpace, encode, type FeatureSpace, type SparseVector } from './features';
import {
  clonePosterior,
  DEFAULT_PRIOR,
  priorPosterior,
  update,
  type Posterior,
  type PriorConfig,
} from './model';
import { buildProfile } from './profile';
import { nearDuplicateLists, selectNext, type Strategy } from './selection';
import { PRIOR_SKIP_BELIEF, updateSkipBelief, type SkipBelief } from './skip';

/** Everything that depends only on the catalog: built once and shared by every session. */
export type PreparedCatalog = {
  readonly catalog: Catalog;
  readonly dishes: readonly Dish[];
  readonly space: FeatureSpace;
  readonly vectors: readonly SparseVector[];
  readonly nearDuplicates: readonly (readonly number[])[];
  readonly indexOf: ReadonlyMap<string, number>;
  readonly prior: Posterior;
};

export function prepareCatalog(
  catalog: Catalog,
  prior: PriorConfig = DEFAULT_PRIOR,
): PreparedCatalog {
  const dishes = catalog.dishes;
  const space = buildFeatureSpace(dishes);
  const vectors = dishes.map((dish) => encode(dish, space));
  return {
    catalog,
    dishes,
    space,
    vectors,
    nearDuplicates: nearDuplicateLists(vectors, space),
    indexOf: new Map(dishes.map((dish, index) => [dish.id, index])),
    prior: priorPosterior(space, prior),
  };
}

/** The learning state after some answers (pure data: cloned for lookahead, rebuilt by replay for undo). */
export type TasteState = {
  readonly posterior: Posterior;
  readonly skipBelief: SkipBelief;
  readonly shown: readonly number[];
  readonly decisions: readonly TasteDecision[];
  readonly skipStreak: number;
};

export function initialState(prepared: PreparedCatalog): TasteState {
  return {
    posterior: clonePosterior(prepared.prior),
    skipBelief: PRIOR_SKIP_BELIEF,
    shown: [],
    decisions: [],
    skipStreak: 0,
  };
}

/** Applies one answer to a copy of the state. */
export function applyAnswer(
  prepared: PreparedCatalog,
  state: TasteState,
  dishIndex: number,
  answer: TasteAnswer,
): TasteState {
  const dish = prepared.dishes[dishIndex];
  const vector = prepared.vectors[dishIndex];
  if (!dish || !vector) return state;
  let posterior = state.posterior;
  if (answer !== 'skip') {
    posterior = clonePosterior(state.posterior);
    update(posterior, vector, answer === 'like');
  }
  return {
    posterior,
    skipBelief: updateSkipBelief(state.skipBelief, dish.traits.familiarityRu, answer === 'skip'),
    shown: [...state.shown, dishIndex],
    decisions: [...state.decisions, { dishId: dish.id, answer }],
    skipStreak: answer === 'skip' ? state.skipStreak + 1 : 0,
  };
}

export function nextCard(
  prepared: PreparedCatalog,
  state: TasteState,
  seed: number,
  strategy: Strategy = 'ours',
  exclude?: ReadonlySet<number>,
): number | null {
  return selectNext(
    {
      ...(exclude ? { exclude } : {}),
      dishes: prepared.dishes,
      vectors: prepared.vectors,
      nearDuplicates: prepared.nearDuplicates,
      posterior: state.posterior,
      skipBelief: state.skipBelief,
      shown: state.shown,
      skipStreak: state.skipStreak,
      seed,
    },
    strategy,
  );
}

export type TasteSession = {
  /** The card to show now (null: enough answers or the catalog is exhausted). */
  readonly current: () => Dish | null;
  /** The card that would follow each possible answer to the current one (preloading). */
  readonly peek: (answer: TasteAnswer) => Dish | null;
  readonly answer: (answer: TasteAnswer) => void;
  /** Undoes the last decision; returns it (the card flies back). */
  readonly undo: () => TasteDecision | null;
  readonly decisions: () => readonly TasteDecision[];
  readonly decisiveCount: () => number;
  readonly skipStreak: () => number;
  /** Enough decisive answers. */
  readonly complete: () => boolean;
  /** No cards left before enough answers (a very picky player): the quiz lets them continue. */
  readonly exhausted: () => boolean;
  readonly profile: () => TasteProfileV1;
  readonly posterior: () => Posterior;
  readonly prepared: PreparedCatalog;
};

/**
 * A game session. Deterministic: the seed and the decisions define everything, so a saved draft is restored by
 * replaying its decisions (`createTasteSession(prepared, seed, saved)`).
 */
export function createTasteSession(
  prepared: PreparedCatalog,
  seed: number,
  saved: readonly TasteDecision[] = [],
): TasteSession {
  let state = initialState(prepared);
  const replay = (decisions: readonly TasteDecision[]) => {
    let next = initialState(prepared);
    for (const decision of decisions) {
      const index = prepared.indexOf.get(decision.dishId);
      // A dish removed from a newer catalog: the rest of the saved answers still count.
      if (index === undefined) continue;
      next = applyAnswer(prepared, next, index, decision.answer);
    }
    return next;
  };
  state = replay(saved);

  let cached: { readonly state: TasteState; readonly index: number | null } | null = null;
  const currentIndex = () => {
    if (cached?.state !== state) {
      const done = decisiveCount(state.decisions) >= DECISIVE_ANSWERS_REQUIRED;
      cached = { state, index: done ? null : nextCard(prepared, state, seed) };
    }
    return cached.index;
  };
  const dishAt = (index: number | null) =>
    index === null ? null : (prepared.dishes[index] ?? null);

  return {
    prepared,
    current: () => dishAt(currentIndex()),
    peek: (answer) => {
      const index = currentIndex();
      if (index === null) return null;
      const after = applyAnswer(prepared, state, index, answer);
      if (decisiveCount(after.decisions) >= DECISIVE_ANSWERS_REQUIRED) return null;
      return dishAt(nextCard(prepared, after, seed));
    },
    answer: (answer) => {
      const index = currentIndex();
      if (index === null) return;
      state = applyAnswer(prepared, state, index, answer);
    },
    undo: () => {
      const last = state.decisions.at(-1);
      if (!last) return null;
      state = replay(state.decisions.slice(0, -1));
      return last;
    },
    decisions: () => state.decisions,
    decisiveCount: () => decisiveCount(state.decisions),
    skipStreak: () => state.skipStreak,
    complete: () => decisiveCount(state.decisions) >= DECISIVE_ANSWERS_REQUIRED,
    exhausted: () =>
      decisiveCount(state.decisions) < DECISIVE_ANSWERS_REQUIRED && currentIndex() === null,
    profile: () =>
      buildProfile({
        catalogVersion: prepared.catalog.version,
        seed,
        dishes: prepared.dishes,
        vectors: prepared.vectors,
        space: prepared.space,
        posterior: state.posterior,
        decisions: state.decisions,
      }),
    posterior: () => state.posterior,
  };
}
