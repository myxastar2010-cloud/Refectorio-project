import type { QuizAnswersV1 } from '@refectorio/contracts';
import type { Alternative, Plan, SlotRef } from '@refectorio/menu-core';
import { useCallback, useEffect, useState } from 'react';
import { menu } from '../../../content/menu.ru';
import { fill } from '../../../lib/format';
import type { Catalog } from '../data/catalog';
import { menuClient } from '../engine/client';
import { opErrorCode } from '../engine/opError';
import type { Notify } from '../notify';
import { menuStore } from '../store/store';

/** Up to this many replacements in the picker. */
const ALTERNATIVES_K = 5;

function replaceError(error: unknown): string {
  switch (opErrorCode(error)) {
    case 'eaten':
      return menu.dish.replaceEaten;
    case 'pinned':
      return menu.errors.pinned;
    case 'pastDay':
      return menu.dish.replacePast;
    case 'notAllowed':
    case 'unsafe':
      return menu.dish.replaceUnsafe;
    case 'stalePlan':
      return menu.errors.stale;
    default:
      return menu.errors.generic;
  }
}

/** The engine's ranked replacements for one slot (null while the worker thinks), or the refusal in words. */
export function useAlternatives(
  plan: Plan,
  answers: QuizAnswersV1 | null,
  slot: SlotRef | null,
): { list: readonly Alternative[] | null; error: string | null } {
  const [state, setState] = useState<{
    key: string;
    list: readonly Alternative[] | null;
    error: string | null;
  }>({ key: '', list: null, error: null });
  const key = slot
    ? `${String(plan.revision)}:${slot.date}:${slot.meal}:${String(slot.index)}`
    : '';

  useEffect(() => {
    if (!slot || !answers) return undefined;
    let alive = true;
    const { tracking } = menuStore().get();
    menuClient()
      .request({ type: 'alternatives', answers, plan, slot, k: ALTERNATIVES_K, tracking })
      .then((answer) => {
        if (alive && answer.type === 'alternatives')
          setState({ key, list: answer.alternatives, error: null });
      })
      .catch((error: unknown) => {
        if (alive) setState({ key, list: [], error: replaceError(error) });
      });
    return () => {
      alive = false;
    };
  }, [key, plan, answers, slot]);

  return state.key === key ? state : { list: null, error: null };
}

/** «Заменить» (ТЗ фаза 4 §7): the engine puts the chosen dish into the slot and re-solves the day; «Отменить» undoes. */
export function useReplace(
  plan: Plan,
  answers: QuizAnswersV1 | null,
  today: string,
  catalog: Catalog,
  notify: Notify,
) {
  const [busy, setBusy] = useState(false);
  const replace = useCallback(
    (slot: SlotRef, fromId: string, toId: string) => {
      if (!answers) return;
      const store = menuStore();
      const { tracking } = store.get();
      setBusy(true);
      menuClient()
        .request({
          type: 'apply',
          op: 'replaceItem',
          answers,
          plan,
          today,
          tracking,
          slot,
          itemId: toId,
        })
        .then((answer) => {
          if (answer.type !== 'plan') return;
          store.commitPlan(answer.plan);
          notify(
            fill(menu.dish.replaced, {
              from: catalog.get(fromId)?.nameRu ?? '',
              to: catalog.get(toId)?.nameRu ?? '',
            }),
            {
              label: menu.meals.undo,
              run: () => {
                store.undoPlan();
              },
            },
          );
        })
        .catch((error: unknown) => {
          notify(replaceError(error));
        })
        .finally(() => {
          setBusy(false);
        });
    },
    [answers, plan, today, catalog, notify],
  );
  return { busy, replace };
}
