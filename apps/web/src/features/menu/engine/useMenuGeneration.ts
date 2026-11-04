import type { QuizAnswersV1 } from '@refectorio/contracts';
import type { MenuStage, Plan } from '@refectorio/menu-core';
import { useEffect, useState } from 'react';
import { setStoredMenu } from '../../../lib/menuFlag';
import { readTestParams } from '../../../lib/params';
import { loadCatalog } from '../data/catalog';
import { AVATAR_COUNT } from '../store/schema';
import { menuStore } from '../store/store';
import { todayIso } from '../data/today';
import { menuClient, MenuRequestError, type MenuClientError } from './client';

export type MenuGeneration =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly stage: MenuStage; readonly share: number }
  | { readonly status: 'ready'; readonly plan: Plan; readonly ms: number }
  | { readonly status: 'error'; readonly error: MenuClientError };

function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}

/**
 * Makes the menu as soon as the finale mounts (ТЗ фаза 3 §9, фаза 4 §1) and keeps it in the local store. A person who
 * already has a menu gets it re-planned for the new answers (`regenerate`: past days and marks stay, ADR 0014 §6) —
 * never a second, unrelated plan. `seed` — ?seed= for tests. «Попробовать снова» remounts the finale's generation.
 */
export function useMenuGeneration(
  answers: QuizAnswersV1 | null,
  seed: number | null,
): MenuGeneration {
  const wanted = answers !== null && answers.guardrails.status !== 'refused';
  const [state, setState] = useState<MenuGeneration>(() =>
    wanted ? { status: 'running', stage: 'loading', share: 0 } : { status: 'idle' },
  );
  useEffect(() => {
    if (!answers || answers.guardrails.status === 'refused') return undefined;
    let alive = true;
    const onProgress = (stage: MenuStage, share: number) => {
      if (alive) setState({ status: 'running', stage, share });
    };
    const store = menuStore();
    void store
      .load()
      .then(({ plan, tracking }) => {
        const today = todayIso();
        const planSeed = seed ?? randomSeed();
        return menuClient().request(
          plan
            ? { type: 'apply', op: 'regenerate', answers, plan, today, tracking, seed: planSeed }
            : { type: 'generate', answers, today, seed: planSeed },
          { onProgress },
        );
      })
      .then((answer) => {
        if (!alive || answer.type !== 'plan') return;
        store.commitPlan(answer.plan, (data) => ({
          answers,
          settings: {
            ...data.settings,
            // The avatar is chosen once, with the first menu (ТЗ фаза 4 §12).
            avatar: data.settings.avatar ?? Math.floor(Math.random() * AVATAR_COUNT),
          },
        }));
        if (!readTestParams(window.location.search).menuDemo) setStoredMenu(true);
        // The page's item texts too: the reveal shows the menu complete from its first frame.
        return loadCatalog().then(() => {
          if (alive) setState({ status: 'ready', plan: answer.plan, ms: answer.ms });
        });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setState({
          status: 'error',
          error: error instanceof MenuRequestError ? error.error : { code: 'worker' },
        });
      });
    return () => {
      alive = false;
    };
  }, [answers, seed]);
  return state;
}
