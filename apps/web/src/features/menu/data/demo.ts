/**
 * Test and demo hooks of the menu (ТЗ фаза 4 §15), inert without their parameters:
 *   ?menu=demo — a seeded plan for a fixed persona (demo/demo-answers.json) and date, in a database of its own;
 *   ?demo=week — synthetic eaten marks for the past days, never stored: every status shows (team demo only).
 */
import { quizAnswersV1Schema } from '@refectorio/contracts';
import {
  addDays,
  compareDates,
  daysBetween,
  drinking,
  markKey,
  type Plan,
  type Tracking,
} from '@refectorio/menu-core';
import demoAnswers from '../demo/demo-answers.json';
import { menuClient } from '../engine/client';
import type { MenuStore } from '../store/store';
import { DEMO_TODAY } from './today';

const DEMO_SEED = 2107;
/** The plan starts a few days before «today», so past days with a menu exist (and the previous week too). */
const DEMO_PLAN_START = addDays(DEMO_TODAY, -5);
/** The avatar of the mockup (the fig). */
const DEMO_AVATAR = 4;

export async function ensureDemoPlan(store: MenuStore): Promise<void> {
  const snapshot = await store.load();
  if (snapshot.plan) return;
  const answers = quizAnswersV1Schema.parse(demoAnswers);
  const answer = await menuClient().request({
    type: 'generate',
    answers,
    today: DEMO_PLAN_START,
    seed: DEMO_SEED,
  });
  if (answer.type !== 'plan') return;
  store.commitPlan(answer.plan, (data) => ({
    answers,
    settings: { ...data.settings, avatar: data.settings.avatar ?? DEMO_AVATAR },
  }));
}

/** Done, partial, missed — by the day's distance from today, so each week shows a mix. */
const PATTERN = ['done', 'partial', 'missed', 'done', 'partial'] as const;

export function demoWeekTracking(plan: Plan, today: string, stored: Tracking): Tracking {
  const days = { ...stored.days };
  for (const day of plan.days) {
    if (compareDates(day.date, today) >= 0 || stored.days[day.date]) continue;
    const kind = PATTERN[(daysBetween(day.date, today) - 1) % PATTERN.length] ?? 'missed';
    if (kind === 'missed') continue;
    const meals = Object.entries(day.meals);
    const eaten: Record<string, string> = {};
    meals.forEach(([mealId, items], index) => {
      if (kind === 'partial' && index > 0) return;
      for (const item of items) eaten[markKey(mealId, item.itemId)] = `${day.date}T12:00:00.000Z`;
    });
    const glasses =
      kind === 'done' ? Math.ceil(drinking(day, plan.targets).targetMl / plan.targets.glassMl) : 2;
    days[day.date] = {
      eaten,
      waterGlasses: glasses,
      waterAt: Array.from({ length: glasses }, () => `${day.date}T12:00:00.000Z`),
    };
  }
  return { ...stored, days };
}
