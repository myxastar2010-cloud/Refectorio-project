import type { QuizAnswersV1 } from '@refectorio/contracts';
import type { MenuStage, Plan } from '@refectorio/menu-core';
import { useEffect, useState } from 'react';
import { localIsoDate, menuClient, MenuRequestError, type MenuClientError } from './client';

export type MenuGeneration =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly stage: MenuStage; readonly share: number }
  | { readonly status: 'ready'; readonly plan: Plan; readonly ms: number }
  | { readonly status: 'error'; readonly error: MenuClientError };

/** The last generated plan (phase 4 takes it into the local store and the menu page). */
let lastPlan: Plan | null = null;
export const latestPlan = (): Plan | null => lastPlan;

function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}

/**
 * Starts the menu generation as soon as the finale mounts (ТЗ фаза 3 §9, фаза 4 §1). `seed` — ?seed= for tests;
 * otherwise a fresh random seed per plan.
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
    menuClient()
      .request(
        { type: 'generate', answers, today: localIsoDate(), seed: seed ?? randomSeed() },
        {
          onProgress: (stage, share) => {
            if (alive) setState({ status: 'running', stage, share });
          },
        },
      )
      .then((answer) => {
        if (!alive || answer.type !== 'plan') return;
        lastPlan = answer.plan;
        setState({ status: 'ready', plan: answer.plan, ms: answer.ms });
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
