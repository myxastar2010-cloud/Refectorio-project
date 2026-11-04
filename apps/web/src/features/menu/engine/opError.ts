import type { MenuError } from '@refectorio/menu-core';
import { MenuRequestError } from './client';

/** The engine's code for a refused operation (`eaten`, `pinned`, `stalePlan`…), or null for any other failure. */
export function opErrorCode(error: unknown): string | null {
  if (!(error instanceof MenuRequestError)) return null;
  const e = error.error as MenuError | { code: string };
  if (e.code !== 'plan' || !('error' in e)) return null;
  return (e.error as { code: string }).code;
}
