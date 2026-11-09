import type { QuizAnswersV1 } from '@refectorio/contracts';
import {
  addMeal,
  canRemoveMeal,
  moveMeal,
  removeMeal,
  type Meal,
  type MealKind,
  type Plan,
} from '@refectorio/menu-core';
import { useCallback, useEffect, useState } from 'react';
import { menu } from '../../../content/menu.ru';
import { fill } from '../../../lib/format';
import { menuClient } from '../engine/client';
import { opErrorCode } from '../engine/opError';
import type { Notify } from '../notify';
import { menuStore } from '../store/store';

const MAIN_ORDER: readonly MealKind[] = ['breakfast', 'lunch', 'dinner'];

/** What the engine says about a failed edit, in the page's words. */
function editError(error: unknown): string {
  switch (opErrorCode(error)) {
    case 'mealHasEaten':
      return menu.errors.eaten;
    case 'structureRejected':
    case 'structure':
      return menu.meals.locked;
    case 'stalePlan':
      return menu.errors.stale;
    case 'horizonPast':
      return menu.errors.horizonPast;
    default:
      return menu.errors.generic;
  }
}

/**
 * Meal structure edits (ТЗ фаза 4 §6): add, remove and reorder through the engine's own `addMeal` / `removeMeal` /
 * `moveMeal`, then `setStructure` in the worker — today's uneaten meals and the future re-plan, history stays. Every
 * change comes with «Отменить» (the previous plan revision).
 */
export function useStructure(
  plan: Plan,
  answers: QuizAnswersV1 | null,
  today: string,
  notify: Notify,
) {
  const [minMainMeals, setMinMainMeals] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!answers) return undefined;
    let alive = true;
    menuClient()
      .request({ type: 'limits', answers })
      .then((answer) => {
        if (alive && answer.type === 'limits') setMinMainMeals(answer.minMainMeals);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [answers]);

  const apply = useCallback(
    (structure: readonly Meal[], done: string) => {
      const store = menuStore();
      const { tracking } = store.get();
      if (!answers) return;
      setBusy(true);
      menuClient()
        .request({ type: 'apply', op: 'setStructure', answers, plan, today, tracking, structure })
        .then((answer) => {
          if (answer.type !== 'plan') return;
          if (!store.commitPlanIf(plan, answer.plan)) {
            notify(menu.errors.changed);
            return;
          }
          notify(done, {
            label: menu.meals.undo,
            run: () => {
              store.undoPlan(answer.plan);
            },
          });
        })
        .catch((error: unknown) => {
          notify(editError(error));
        })
        .finally(() => {
          setBusy(false);
        });
    },
    [answers, plan, today, notify],
  );

  /** Why a meal cannot go (shown on the pill in edit mode), or null. */
  const lockOf = useCallback(
    (mealId: string): string | null =>
      minMainMeals === null || canRemoveMeal(plan.structure, mealId, minMainMeals)
        ? null
        : menu.meals.locked,
    [plan.structure, minMainMeals],
  );

  const remove = useCallback(
    (meal: Meal) => {
      if (minMainMeals === null) return;
      const next = removeMeal(plan.structure, meal.id, minMainMeals);
      if (!next.ok) {
        notify(menu.meals.locked);
        return;
      }
      apply(next.value, fill(menu.meals.removed, { meal: meal.titleRu }));
    },
    [plan.structure, minMainMeals, apply, notify],
  );

  /** The missing standard meal first (Завтрак → Обед → Ужин), then snacks; six at most. */
  const add = useCallback(() => {
    const kind = MAIN_ORDER.find((k) => !plan.structure.some((m) => m.kind === k)) ?? 'snack';
    const next = addMeal(plan.structure, kind);
    if (!next.ok) {
      notify(next.error.code === 'TOO_MANY_MEALS' ? menu.meals.full : menu.errors.generic);
      return;
    }
    const added = next.value.find((m) => !plan.structure.some((old) => old.id === m.id));
    apply(next.value, fill(menu.meals.added, { meal: added?.titleRu ?? '' }));
  }, [plan.structure, apply, notify]);

  const move = useCallback(
    (mealId: string, toIndex: number) => {
      const next = moveMeal(plan.structure, mealId, toIndex);
      if (!next.ok) {
        notify(menu.errors.generic);
        return;
      }
      apply(next.value, menu.meals.moved);
    },
    [plan.structure, apply, notify],
  );

  return { busy, lockOf, remove, add, move };
}
