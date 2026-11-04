import type { QuizAnswersV1 } from '@refectorio/contracts';
import type { Plan } from '@refectorio/menu-core';
import { menu } from '../../../content/menu.ru';
import { fill } from '../../../lib/format';
import type { Settings } from '../store/schema';

export type Notice = { readonly id: string; readonly text: string; readonly download: boolean };

/**
 * The menu's honest notes (ТЗ фаза 4 §13, decision 2), one at a time under the title: where the data lives (until
 * «Понятно»; while the browser cannot keep data — always), a health record the menu does not handle by itself, an
 * allergy text the engine could not match. Each closes with «Понятно» and stays closed.
 */
export function noticesFor(
  answers: QuizAnswersV1 | null,
  plan: Plan,
  settings: Settings,
  durable: boolean,
): Notice[] {
  const out: Notice[] = [];
  const closed = new Set(settings.dismissedNotes);
  if (!durable) out.push({ id: 'volatile', text: menu.notices.storageVolatile, download: true });
  else if (!settings.noticeSeen)
    out.push({ id: 'storage', text: menu.notices.storage, download: true });
  if (answers?.guardrails.reasons.includes('OTHER_CHRONIC') && !closed.has('health'))
    out.push({ id: 'health', text: menu.notices.health, download: false });
  const allergy = plan.notes.find((n) => n.code === 'allergyUnmatched');
  if (allergy && !closed.has('allergy'))
    out.push({
      id: 'allergy',
      text: fill(menu.notices.allergy, { text: allergy.text ?? '' }),
      download: false,
    });
  return out;
}
