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
  canonicalJson,
  catalogView,
  extendHorizon,
  generate,
  regenerate,
  replaceItem,
  search,
  parseRules,
  setStructure,
  type FoodIndex,
  type MenuProfile,
  type MenuRequest,
  type MenuResponse,
  type OpResult,
} from '@refectorio/menu-core';
import { buildDigest, createToolEnv, executeTool, isToolName } from '@refectorio/kiki-core/client';
import { EMPTY_TRACKING } from '@refectorio/menu-core';
import { catalogSchema } from '@refectorio/taste-core';
import catalogJson from '@refectorio/taste-core/data/catalog.json';

type Post = (response: MenuResponse) => void;

let foods: FoodIndex | null = null;
const texts = foodTextSchema.parse(foodText);
const profiles = new Map<string, MenuProfile>();
/** The search index of the last plan: typing asks again every 120 ms, the plan rarely changes meanwhile. */
let searchIndex: { key: string; index: ReturnType<typeof buildSearchIndex> } | null = null;

function loadFoods(): FoodIndex {
  foods ??= buildFoodIndex({
    foodCore,
    catalog: catalogSchema.parse(catalogJson),
    foodText: texts,
  });
  return foods;
}

function profileFor(answers: unknown): ReturnType<typeof buildMenuProfile> {
  // The canonical text itself, not a 32-bit hash of it: a collision would hand back another person's profile (m19).
  const key = canonicalJson(answers);
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

/** Preview ids of Kiki's proposals: the chat's prefix + a counter of this worker. */
let previewCounter = 0;

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
    if (request.type === 'catalog') {
      post({ id, type: 'catalog', items: catalogView(loadFoods(), texts) });
      return;
    }
    if (request.type === 'search') {
      const { plan } = request;
      // The days themselves: a revision number repeats after an undo and a different edit.
      const key = JSON.stringify(plan.days.map((d) => [d.date, d.meals]));
      if (searchIndex?.key !== key)
        searchIndex = { key, index: buildSearchIndex(plan, loadFoods(), texts) };
      post({ id, type: 'search', hits: search(searchIndex.index, request.query) });
      return;
    }
    post({ id, type: 'progress', stage: 'profile', share: 0.05 });
    const profile = profileFor(request.answers);
    if (!profile.ok) {
      post({ id, type: 'error', error: { code: 'profile', error: profile.error } });
      return;
    }
    if (request.type === 'kiki' || request.type === 'digest') {
      const env = createToolEnv({
        foods: loadFoods(),
        texts,
        profile: profile.value,
        plan: request.plan,
        tracking: request.tracking ?? EMPTY_TRACKING,
        today: request.today,
        answers: request.answers,
        nextPreviewId: () =>
          `${request.type === 'kiki' ? request.previewPrefix : 'pv'}${(++previewCounter).toString(36)}`,
      });
      if (request.type === 'digest') {
        post({ id, type: 'digest', digest: buildDigest(env, request.ui ?? {}) });
        return;
      }
      const outcome = isToolName(request.tool)
        ? executeTool(env, request.tool, request.args)
        : { result: { error: `unknown tool ${request.tool}` } };
      post({ id, type: 'kiki', result: outcome.result, previews: outcome.previews ?? [] });
      return;
    }
    if (request.type === 'targets') {
      post({ id, type: 'targets', targets: profile.value.targets });
      return;
    }
    if (request.type === 'limits') {
      post({ id, type: 'limits', minMainMeals: profile.value.safety.minMainMeals });
      return;
    }
    const engine = { profile: profile.value, foods: loadFoods() };
    post({ id, type: 'progress', stage: 'planning', share: 0.1 });
    switch (request.type) {
      case 'generate': {
        // The same schema as applyRules: a message from the page is not trusted to be well-formed (m12).
        const rules = parseRules(request.rules ?? []);
        if (!rules.success) {
          const detail = rules.error.issues[0]?.message ?? '';
          post({
            id,
            type: 'error',
            error: { code: 'plan', error: { code: 'invalidRules', detail } },
          });
          return;
        }
        const result = generate({
          profile: profile.value,
          foods: engine.foods,
          today: request.today,
          seed: request.seed,
          ...(request.structure ? { structure: request.structure } : {}),
          rules: rules.data,
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
            postOp(id, extendHorizon(engine, request.plan, request.toDate, options), started, post);
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
