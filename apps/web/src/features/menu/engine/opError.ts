import type { MenuError } from '@refectorio/menu-core';
import { menu } from '../../../content/menu.ru';
import { MenuRequestError } from './client';

/** The engine's code for a refused operation (`eaten`, `pinned`, `stalePlan`…), or null for any other failure. */
export function opErrorCode(error: unknown): string | null {
  if (!(error instanceof MenuRequestError)) return null;
  const e = error.error as MenuError | { code: string };
  if (e.code !== 'plan' || !('error' in e)) return null;
  return (e.error as { code: string }).code;
}

/** What a refused operation on the whole plan (extend, regenerate) says to the person. */
export function planError(error: unknown): string {
  switch (opErrorCode(error)) {
    case 'stalePlan':
      return menu.errors.stale;
    case 'horizonPast':
      return menu.errors.horizonPast;
    case 'tooFarAhead':
      return menu.errors.tooFar;
    default:
      return menu.errors.generic;
  }
}
