import type { QuizAnswersV1 } from '@refectorio/contracts';
import type { Plan } from '@refectorio/menu-core';
import { useCallback, useState } from 'react';
import { menu } from '../../../content/menu.ru';
import { menuClient } from '../engine/client';
import { opErrorCode } from '../engine/opError';
import type { Notify } from '../notify';
import { menuStore } from '../store/store';

/** A fresh seed for «Перегенерировать»: the same rules, other dishes. */
const freshSeed = () => Math.floor(Math.random() * 2 ** 31);

/**
 * Whole-plan operations of the ⋯ menu (ТЗ фаза 4 §10): a new goal (`changeTargets` = regenerate with the new answers)
 * and «Перегенерировать» (a new seed, rules kept). The future re-plans, marks and past days stay; «Отменить» brings back
 * the previous plan and, for a goal, the previous answers.
 */
export function usePlanOps(plan: Plan, today: string, notify: Notify) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    (answers: QuizAnswersV1, seed: number | undefined, done: string, onDone?: () => void) => {
      const store = menuStore();
      const { tracking, answers: before } = store.get();
      setBusy(true);
      menuClient()
        .request({
          type: 'apply',
          op: 'regenerate',
          answers,
          plan,
          today,
          tracking,
          ...(seed === undefined ? {} : { seed }),
        })
        .then((answer) => {
          if (answer.type !== 'plan') return;
          store.commitPlan(answer.plan, () => ({ answers }));
          onDone?.();
          notify(done, {
            label: menu.meals.undo,
            run: () => {
              if (store.undoPlan() && before !== answers)
                store.update((data) => ({ ...data, answers: before }));
            },
          });
        })
        .catch((error: unknown) => {
          notify(
            opErrorCode(error) === 'horizonPast' ? menu.errors.horizonPast : menu.errors.generic,
          );
        })
        .finally(() => {
          setBusy(false);
        });
    },
    [plan, today, notify],
  );

  const changeGoal = useCallback(
    (answers: QuizAnswersV1, onDone?: () => void) => {
      run(answers, undefined, menu.goalSheet.applied, onDone);
    },
    [run],
  );

  const regenerate = useCallback(() => {
    const { answers } = menuStore().get();
    if (answers) run(answers, freshSeed(), menu.more.regenerated);
  }, [run]);

  return { busy, changeGoal, regenerate };
}
