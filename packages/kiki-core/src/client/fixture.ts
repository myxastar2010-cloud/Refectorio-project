/**
 * The fixed plan for tests and evals (ТЗ 07 §11): an office worker from menu-core's test answers, Tuesday 2026-11-10,
 * seed 7 — the same menu every run, so eval expectations can name days and dishes.
 */
import { foodTextSchema } from '@refectorio/food-data';
import foodText from '@refectorio/food-data/data/food-text.json';
import {
  buildMenuProfile,
  EMPTY_TRACKING,
  generate,
  type IsoDate,
  type Plan,
  type Tracking,
} from '@refectorio/menu-core';
import { quizAnswers, testFoods, type AnswersOverrides } from '@refectorio/menu-core/testing';
import { createToolEnv, previewIdFactory } from './env';
import type { ToolEnv } from './tools';

export const FIXTURE_TODAY: IsoDate = '2026-11-10';
export const FIXTURE_SEED = 7;

export type Fixture = { readonly env: ToolEnv; readonly plan: Plan; readonly answers: unknown };

export function fixtureEnv(
  options: {
    readonly overrides?: AnswersOverrides;
    readonly tracking?: Tracking;
    readonly today?: IsoDate;
    readonly plan?: Plan;
  } = {},
): Fixture {
  const foods = testFoods();
  const texts = foodTextSchema.parse(foodText);
  const answers = quizAnswers(options.overrides);
  const profile = buildMenuProfile(answers, { foods });
  if (!profile.ok) throw new Error(`fixture profile: ${profile.error.code}`);
  const today = options.today ?? FIXTURE_TODAY;
  let plan = options.plan;
  if (!plan) {
    const generated = generate({ profile: profile.value, foods, today, seed: FIXTURE_SEED });
    if (!generated.ok) throw new Error(`fixture plan: ${generated.error.code}`);
    plan = generated.value.plan;
  }
  const env = createToolEnv({
    foods,
    texts,
    profile: profile.value,
    plan,
    tracking: options.tracking ?? EMPTY_TRACKING,
    today,
    answers,
    nextPreviewId: previewIdFactory('pv-'),
  });
  return { env, plan, answers };
}
