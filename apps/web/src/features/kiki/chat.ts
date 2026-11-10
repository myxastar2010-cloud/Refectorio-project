/**
 * The site's Kiki session (ТЗ 07 §2, §5): the server's address, the warm-up ping, the menu worker as the tool runner,
 * the chat kept in this browser's database (`refectorio.chat`, wiped with «Удалить мои данные»), and «Применить» for
 * proposals. Proposed plans live in memory for this visit; after a reload a proposal is recomputed on apply.
 */
import { memorySchema, wireMessageSchema, type ChatRequest } from '@refectorio/kiki-core';
import type { Preview } from '@refectorio/kiki-core/client';
import type { Plan, PlanDiff } from '@refectorio/menu-core';
import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { kiki } from '../../content/kiki.ru';
import { menu } from '../../content/menu.ru';
import { readTestParams } from '../../lib/params';
import { localIsoDate, menuClient } from '../menu/engine/client';
import { changeLetter } from '../menu/news/letters';
import type { Notify } from '../menu/notify';
import { openStore, type KeyValue } from '../menu/store/db';
import { DB_NAME, DEMO_DB_NAME } from '../menu/store/schema';
import { menuStore } from '../menu/store/store';
import {
  createChatSession,
  EMPTY_CHAT,
  type ChatSession,
  type ChatState,
  type PreviewRecord,
  type ToolRun,
} from './session';
import { chatUi } from './uiState';

export const CHAT_KEY = 'refectorio.chat';
const CHAT_VERSION = 1;

/** The server: the published site → its Render origin; dev → Vite's `/api` proxy (ТЗ 07 §2). */
export const API_BASE: string =
  import.meta.env.VITE_API_ORIGIN ?? `${import.meta.env.BASE_URL}api`.replace('//', '/');

let warmed = false;
/** Wakes the free Render instance ahead of the first question (fire-and-forget, once per visit). */
export function warmKiki(): void {
  if (warmed || typeof fetch === 'undefined') return;
  warmed = true;
  fetch(`${API_BASE}/health`, { mode: 'cors', credentials: 'omit' }).catch(() => {
    warmed = false;
  });
}

const storedSchema = z.object({
  version: z.literal(CHAT_VERSION),
  items: z.array(
    z.looseObject({ id: z.string(), kind: z.enum(['user', 'kiki', 'note', 'error']) }),
  ),
  wire: z.array(wireMessageSchema),
  memory: memorySchema,
  folded: z.number().int().nonnegative(),
  previews: z.record(z.string(), z.looseObject({ id: z.string(), status: z.string() })),
});

export { chatUi } from './uiState';

/** Proposed plans of this visit, by preview id. */
export type ComputedPreview = { readonly plan: Plan; readonly diff: PlanDiff | null };
const previewPlans = new Map<string, ComputedPreview>();
const previewPrefix = `k${Math.random().toString(36).slice(2, 6)}-`;
let idCounter = 0;
const newId = () => `${Date.now().toString(36)}${(idCounter++).toString(36)}`;

let session: ChatSession | null = null;
let kv: Promise<KeyValue> | null = null;
const database = () => {
  kv ??= openStore(readTestParams(window.location.search).menuDemo ? DEMO_DB_NAME : DB_NAME);
  return kv;
};

function snapshotForTools() {
  const { plan, answers, tracking } = menuStore().get();
  return { plan, answers, tracking, today: chatUi.today ?? localIsoDate() };
}

export function chatSession(): ChatSession {
  if (session) return session;
  const created = createChatSession({
    post: (body: ChatRequest, signal: AbortSignal) =>
      fetch(`${API_BASE}/kiki/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
        signal,
      }),
    runTool: async (name, args): Promise<ToolRun> => {
      const { plan, answers, tracking, today } = snapshotForTools();
      if (!plan || !answers)
        return { result: { error: 'no menu on this device yet' }, previews: [] };
      const answer = await menuClient().request({
        type: 'kiki',
        tool: name,
        args,
        answers,
        plan,
        tracking,
        today,
        previewPrefix,
      });
      if (answer.type !== 'kiki') return { result: { error: 'tool failed' }, previews: [] };
      const previews = answer.previews as Preview[];
      for (const p of previews) previewPlans.set(p.id, { plan: p.plan, diff: p.diff });
      return { result: answer.result, previews };
    },
    digest: async () => {
      const { plan, answers, tracking, today } = snapshotForTools();
      if (!plan || !answers) return '';
      const answer = await menuClient().request({
        type: 'digest',
        answers,
        plan,
        tracking,
        today,
        ui: chatUi,
      });
      return answer.type === 'digest' ? answer.digest : '';
    },
    persist: (state) => {
      const stored = {
        version: CHAT_VERSION,
        items: state.items,
        wire: state.wire,
        memory: state.memory,
        folded: state.folded,
        previews: state.previews,
      };
      void database()
        .then((db) => db.set({ [CHAT_KEY]: stored }))
        .catch(() => {
          // Storage refused: the chat lives for this visit only (the notice already says so).
        });
    },
    now: () => performance.now(),
    newId,
    online: () => typeof navigator === 'undefined' || navigator.onLine,
    announce: (text) => {
      announcer?.(text);
    },
  });
  session = created;
  void database()
    .then((db) => db.get(CHAT_KEY))
    .then((value) => {
      const parsed = storedSchema.safeParse(value);
      // Restore only into an untouched session: a message sent while the database opened wins.
      if (parsed.success && created.get().items.length === 0 && !created.get().busy)
        created.restore({
          ...EMPTY_CHAT,
          ...(parsed.data as unknown as Omit<ChatState, 'busy'>),
          busy: null,
        });
    })
    .catch(() => {});
  // «Удалить мои данные» clears the database; the chat in memory follows.
  menuStore().subscribe(() => {
    if (!menuStore().get().plan && created.get().items.length > 0) created.clear();
  });
  return created;
}

let announcer: ((text: string) => void) | null = null;
export function setAnnouncer(fn: ((text: string) => void) | null): void {
  announcer = fn;
}

export function useChat(): ChatState {
  const s = chatSession();
  return useSyncExternalStore(
    (listener) => s.subscribe(listener),
    () => s.get(),
    () => s.get(),
  );
}

export type ApplyOutcome = 'applied' | 'failed';

/**
 * «Применить» (ТЗ 07 §7): the computed plan when the menu is still the one it was computed from; otherwise the same
 * operation re-runs on the current menu. A goal also brings its answers. «Отменить» in the toast undoes it.
 */
/** Is the menu still the one the proposal was computed from? */
export const isStale = (record: PreviewRecord): boolean =>
  menuStore().get().plan?.revision !== record.baseRevision;

/**
 * The proposed plan on the current menu: the computed one while the menu is unchanged (this visit), otherwise the same
 * operation re-runs in the worker (nothing is committed). Null — the operation no longer works on this menu.
 */
export async function previewPlan(record: PreviewRecord): Promise<ComputedPreview | null> {
  const { plan, answers, tracking } = menuStore().get();
  if (!plan || !answers) return null;
  const cached = previewPlans.get(record.id);
  if (cached && plan.revision === record.baseRevision) return cached;
  const op = record.op;
  const base = {
    type: 'apply' as const,
    answers: op.kind === 'goal' ? op.answers : answers,
    plan,
    today: chatUi.today ?? localIsoDate(),
    tracking,
  };
  try {
    const answer = await menuClient().request(
      op.kind === 'rules'
        ? { ...base, op: 'applyRules', rules: op.rules }
        : op.kind === 'structure'
          ? { ...base, op: 'setStructure', structure: op.structure }
          : op.kind === 'replace'
            ? { ...base, op: 'replaceItem', slot: op.slot, itemId: op.itemId }
            : { ...base, op: 'regenerate' },
    );
    if (answer.type !== 'plan') return null;
    const computed = { plan: answer.plan, diff: answer.diff };
    previewPlans.set(record.id, computed);
    return computed;
  } catch {
    return null;
  }
}

export async function applyPreview(record: PreviewRecord, notify: Notify): Promise<ApplyOutcome> {
  const store = menuStore();
  const { plan, answers } = store.get();
  if (!plan || !answers) return 'failed';
  const op = record.op;
  const nextAnswers = op.kind === 'goal' ? (op.answers as typeof answers) : answers;
  if (isStale(record)) previewPlans.delete(record.id);
  const next = (await previewPlan(record))?.plan;
  if (!next) return 'failed';
  const before = answers;
  const applied = next;
  const written = store.commitPlanIf(plan, applied, (data) => ({
    ...(op.kind === 'goal' ? { answers: nextAnswers } : {}),
    letters: [
      ...data.letters,
      changeLetter(data.letters, record.summaryRu || kiki.preview.done, new Date(), Math.random),
    ],
  }));
  if (!written) return 'failed';
  previewPlans.delete(record.id);
  notify(kiki.preview.done, {
    label: menu.meals.undo,
    run: () => {
      if (store.undoPlan(applied) && op.kind === 'goal')
        store.update((data) => ({ ...data, answers: before }));
    },
  });
  return 'applied';
}
