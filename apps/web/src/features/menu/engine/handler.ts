/**
 * The menu worker's request handler (menu-core protocol): loads the food data once, keeps the person's engine profile
 * by answers, runs the engine and reports progress. A plain function of (request → responses), so tests run it
 * without a Worker.
 */
import { foodTextSchema } from '@refectorio/food-data';
import foodCore from '@refectorio/food-data/data/food-core.json';
import foodText from '@refectorio/food-data/data/food-text.json';
import {
  alternatives,
  applyRules,
  buildFoodIndex,
  buildMenuProfile,
  buildSearchIndex,
  extendHorizon,
  generate,
  regenerate,
  replaceItem,
  search,
  setStructure,
  stableHash,
  type FoodIndex,
  type MenuProfile,
  type MenuRequest,
  type MenuResponse,
  type OpResult,
} from '@refectorio/menu-core';
import { catalogSchema } from '@refectorio/taste-core';
import catalogJson from '@refectorio/taste-core/data/catalog.json';

type Post = (response: MenuResponse) => void;

let foods: FoodIndex | null = null;
const texts = foodTextSchema.parse(foodText);
const profiles = new Map<string, MenuProfile>();

function loadFoods(): FoodIndex {
  foods ??= buildFoodIndex({
    foodCore,
    catalog: catalogSchema.parse(catalogJson),
    foodText: texts,
  });
  return foods;
}

function profileFor(answers: unknown): ReturnType<typeof buildMenuProfile> {
  const key = stableHash(answers);
  const known = profiles.get(key);
  if (known) return { ok: true, value: known };
  const built = buildMenuProfile(answers, { foods: loadFoods() });
  if (built.ok) {
    if (profiles.size > 4) profiles.clear();
    profiles.set(key, built.value);
  }
  return built;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

function postOp(id: number, result: OpResult, started: number, post: Post): void {
  if (result.ok)
    post({
      id,
      type: 'plan',
      plan: result.value.plan,
      diff: result.value.diff,
      ms: now() - started,
    });
  else post({ id, type: 'error', error: { code: 'plan', error: result.error } });
}

export function handle(request: MenuRequest, post: Post): void {
  const { id } = request;
  const started = now();
  try {
    if (request.type === 'init') {
      post({ id, type: 'progress', stage: 'loading', share: 0 });
      loadFoods();
      post({ id, type: 'ready' });
      return;
    }
    if (request.type === 'search') {
      const index = buildSearchIndex(request.plan, loadFoods(), texts);
      post({ id, type: 'search', hits: search(index, request.query) });
      return;
    }
    post({ id, type: 'progress', stage: 'profile', share: 0.05 });
    const profile = profileFor(request.answers);
    if (!profile.ok) {
      post({ id, type: 'error', error: { code: 'profile', error: profile.error } });
      return;
    }
    const engine = { profile: profile.value, foods: loadFoods() };
    post({ id, type: 'progress', stage: 'planning', share: 0.1 });
    switch (request.type) {
      case 'generate': {
        const result = generate({
          profile: profile.value,
          foods: engine.foods,
          today: request.today,
          seed: request.seed,
          ...(request.structure ? { structure: request.structure } : {}),
          ...(request.rules ? { rules: request.rules } : {}),
        });
        if (result.ok)
          post({ id, type: 'plan', plan: result.value.plan, diff: null, ms: now() - started });
        else post({ id, type: 'error', error: { code: 'plan', error: result.error } });
        return;
      }
      case 'alternatives': {
        const result = alternatives(
          engine,
          request.plan,
          request.slot,
          request.k,
          request.tracking,
        );
        if (result.ok) post({ id, type: 'alternatives', alternatives: result.value });
        else post({ id, type: 'error', error: { code: 'plan', error: result.error } });
        return;
      }
      case 'apply': {
        const options = {
          today: request.today,
          ...(request.tracking ? { tracking: request.tracking } : {}),
          ...(request.seed !== undefined ? { seed: request.seed } : {}),
        };
        switch (request.op) {
          case 'regenerate':
            postOp(id, regenerate(engine, request.plan, options), started, post);
            return;
          case 'setStructure':
            postOp(
              id,
              setStructure(engine, request.plan, request.structure, options),
              started,
              post,
            );
            return;
          case 'applyRules':
            postOp(id, applyRules(engine, request.plan, request.rules, options), started, post);
            return;
          case 'extendHorizon':
            postOp(id, extendHorizon(engine, request.plan, request.toDate), started, post);
            return;
          case 'replaceItem':
            postOp(
              id,
              replaceItem(engine, request.plan, request.slot, request.itemId, options),
              started,
              post,
            );
            return;
        }
      }
    }
  } catch (error) {
    post({
      id,
      type: 'error',
      error: { code: 'internal', detail: error instanceof Error ? error.message : String(error) },
    });
  }
}
