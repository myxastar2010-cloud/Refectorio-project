/**
 * The site's Kiki session (ТЗ 07 §2, §5): the server's address, the warm-up ping, the menu worker as the tool runner,
 * the chat kept in this browser's database (`refectorio.chat`, wiped with «Удалить мои данные»), and «Применить» for
 * proposals. Proposed plans live in memory for this visit; after a reload a proposal is recomputed on apply.
 */
import { memorySchema, repairWire, type ChatRequest } from '@refectorio/kiki-core';
import type { Preview } from '@refectorio/kiki-core/client';
import type { Plan, PlanDiff } from '@refectorio/menu-core';
import { planKey } from '@refectorio/menu-core/hash';
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
import { readPass } from './pass';
import { chatUi } from './uiState';

/** The demo pass header when this device has one (D-128). */
const passHeader = (): Record<string, string> => {
  const pass = readPass();
  return pass ? { 'x-kiki-pass': pass } : {};
};

export const CHAT_KEY = 'refectorio.chat';
const CHAT_VERSION = 1;

/** The server: the published site → its Render origin; dev → Vite's `/api` proxy (ТЗ 07 §2). */
export const API_BASE: string =
  __API_ORIGIN__ || `${import.meta.env.BASE_URL}api`.replace('//', '/');

/** Render's free instance sleeps after 15 min without requests: wake it again when the chat opens after this. */
export const WARM_AGAIN_MS = 10 * 60_000;
let lastContactAt = Number.NEGATIVE_INFINITY;
/**
 * Wakes the free Render instance ahead of a question (fire-and-forget): on opening the chat, again when the server
 * has not been heard from for {@link WARM_AGAIN_MS} (review of phase 5, M7).
 */
export function warmKiki(): void {
  const now = performance.now();
  if (now - lastContactAt < WARM_AGAIN_MS || typeof fetch === 'undefined') return;
  lastContactAt = now;
  fetch(`${API_BASE}/health`, { mode: 'cors', credentials: 'omit' }).catch(() => {
    lastContactAt = Number.NEGATIVE_INFINITY;
  });
}

const storedSchema = z.object({
  version: z.literal(CHAT_VERSION),
  items: z.array(
    z.looseObject({ id: z.string(), kind: z.enum(['user', 'kiki', 'note', 'error']) }),
  ),
  // Checked turn by turn on restore (repairWire): one broken turn never costs the whole chat (review of phase 5, M8).
  wire: z.array(z.unknown()),
  memory: memorySchema,
  folded: z.number().int().nonnegative(),
  previews: z.record(z.string(), z.looseObject({ id: z.string(), status: z.string() })),
});

export { chatUi } from './uiState';

/** Proposed plans of this visit, by preview id. */
export type ComputedPreview = {
  readonly plan: Plan;
  readonly diff: PlanDiff | null;
  /** planKey of the menu this was computed on. */
  readonly key: string;
  /** A proposal re-run on a changed menu: its fresh operation (a goal's answers) and rule labels. */
  readonly fresh?: Pick<Preview, 'op' | 'rulesAdded' | 'rulesRemoved' | 'summaryRu'>;
};
const previewPlans = new Map<string, ComputedPreview>();
const visitPrefix = `k${Math.random().toString(36).slice(2, 6)}-`;
let prefixCounter = 0;
/**
 * A fresh prefix per tool run: the worker's own counter starts over when the worker is recreated after a time-out, so
 * ids are made unique here, in the main thread (review of phase 5, minor 4).
 */
const nextPreviewPrefix = () => `${visitPrefix}${(prefixCounter++).toString(36)}.`;
let idCounter = 0;
const newId = () => `${Date.now().toString(36)}${(idCounter++).toString(36)}`;

let session: ChatSession | null = null;
let kv: Promise<KeyValue> | null = null;
const database = () => {
  kv ??= openStore(readTestParams(window.location.search).menuDemo ? DEMO_DB_NAME : DB_NAME);
  return kv;
};

let channel: BroadcastChannel | null | undefined;
/** The chat's own channel between this site's tabs (the menu store has its own). */
const chatChannel = (): BroadcastChannel | null => {
  if (channel !== undefined) return channel;
  const demo = readTestParams(window.location.search).menuDemo;
  channel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(`${CHAT_KEY}${demo ? '.demo' : ''}`);
  return channel;
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
        headers: { 'content-type': 'application/json', ...passHeader() },
        body: JSON.stringify(body),
        credentials: 'omit',
        signal,
      }).then((res) => {
        lastContactAt = performance.now();
        return res;
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
        previewPrefix: nextPreviewPrefix(),
      });
      if (answer.type !== 'kiki') return { result: { error: 'tool failed' }, previews: [] };
      const previews = answer.previews as Preview[];
      for (const p of previews)
        previewPlans.set(p.id, { plan: p.plan, diff: p.diff, key: p.baseKey });
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
      chatChannel()?.postMessage(stored);
    },
    now: () => performance.now(),
    newId,
    online: () => typeof navigator === 'undefined' || navigator.onLine,
    announce: (text) => {
      announceSoon(text);
    },
  });
  session = created;
  const restoreFrom = (value: unknown) => {
    const parsed = storedSchema.safeParse(value);
    if (!parsed.success) return;
    const { wire, folded } = repairWire(parsed.data.wire, parsed.data.folded);
    created.restore({
      ...EMPTY_CHAT,
      ...(parsed.data as unknown as Omit<ChatState, 'busy'>),
      wire,
      folded,
      busy: null,
    });
  };
  void database()
    .then((db) => db.get(CHAT_KEY))
    .then((value) => {
      // Restore only into an untouched session: a message sent while the database opened wins.
      if (created.get().items.length === 0 && !created.get().busy) restoreFrom(value);
    })
    .catch(() => {});
  // Another tab saved its chat: this one shows the same (unless it is answering right now; review minor 7).
  chatChannel()?.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!created.get().busy) restoreFrom(event.data);
  });
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

/** The polite live region changes at most this often: sentences in between are joined (`.claude/rules/kiki.md`). */
export const ANNOUNCE_EVERY_MS = 1500;
let pendingSpeech = '';
let speechTimer: ReturnType<typeof setTimeout> | null = null;
let lastSpokenAt = Number.NEGATIVE_INFINITY;
function flushSpeech() {
  speechTimer = null;
  if (!pendingSpeech) return;
  lastSpokenAt = performance.now();
  announcer?.(pendingSpeech);
  pendingSpeech = '';
}
/** Queues text for the screen reader; streamed sentences are spoken in batches, never more than once a 1,5 s (minor 9). */
function announceSoon(text: string) {
  pendingSpeech = pendingSpeech ? `${pendingSpeech} ${text}` : text;
  if (speechTimer) return;
  const wait = Math.max(0, lastSpokenAt + ANNOUNCE_EVERY_MS - performance.now());
  speechTimer = setTimeout(flushSpeech, wait);
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
const keyOf = (record: PreviewRecord, plan: Plan): boolean =>
  record.baseKey ? planKey(plan) === record.baseKey : plan.revision === record.baseRevision;

/** Is the menu still the one the proposal was computed from? (By content: revisions repeat after undo or a restore.) */
export const isStale = (record: PreviewRecord): boolean => {
  const plan = menuStore().get().plan;
  return !plan || !keyOf(record, plan);
};

/**
 * The proposed plan on the current menu (ТЗ 07 §7): the computed one while the menu is unchanged, otherwise the
 * proposing call re-runs on the current plan and answers in the worker — only its own change is added, later rules,
 * meals and answers stay (review of phase 5, C1). A replacement keeps its exact slot. Null — it no longer applies.
 */
export async function previewPlan(record: PreviewRecord): Promise<ComputedPreview | null> {
  const { plan, answers, tracking } = menuStore().get();
  if (!plan || !answers) return null;
  const key = planKey(plan);
  const cached = previewPlans.get(record.id);
  if (cached && cached.key === key && (cached.fresh || keyOf(record, plan))) return cached;
  const today = chatUi.today ?? localIsoDate();
  try {
    if (record.call) {
      const answer = await menuClient().request({
        type: 'kiki',
        tool: record.call.name,
        args: record.call.args,
        answers,
        plan,
        tracking,
        today,
        previewPrefix: nextPreviewPrefix(),
      });
      const p = answer.type === 'kiki' ? (answer.previews as Preview[])[0] : undefined;
      if (!p) return null;
      const computed: ComputedPreview = {
        plan: p.plan,
        diff: p.diff,
        key,
        fresh: {
          op: p.op,
          rulesAdded: p.rulesAdded,
          rulesRemoved: p.rulesRemoved,
          summaryRu: p.summaryRu,
        },
      };
      previewPlans.set(record.id, computed);
      return computed;
    }
    const op = record.op;
    // Chats saved before 11.11 hold a whole snapshot: on a changed menu it would undo later changes — never replayed.
    if (op.kind !== 'replace') return null;
    // The dish may have moved or gone since (minor 5): replace it where it is now, or call the card stale.
    const meal = plan.days.find((d) => d.date === op.slot.date)?.meals[op.slot.meal] ?? [];
    const index = op.fromItemId
      ? meal[op.slot.index]?.itemId === op.fromItemId
        ? op.slot.index
        : meal.findIndex((i) => i.itemId === op.fromItemId)
      : op.slot.index;
    if (index < 0) return null;
    const answer = await menuClient().request({
      type: 'apply',
      answers,
      plan,
      today,
      tracking,
      op: 'replaceItem',
      slot: { ...op.slot, index },
      itemId: op.itemId,
    });
    if (answer.type !== 'plan') return null;
    const computed: ComputedPreview = { plan: answer.plan, diff: answer.diff, key };
    previewPlans.set(record.id, computed);
    return computed;
  } catch {
    return null;
  }
}

const applying = new Set<string>();

/** Sentences with calories, grams or percent — left out of a letter for someone who asked not to see numbers. */
const NUMBER_SENTENCE = /\d[\d\s\u00a0\u202f.,→-]*\s*(ккал|г|мг|мкг|%)(?![а-яё])/iu;
export function quietLetterText(text: string): string {
  return text
    .split(/(?<=[.;!?])\s+/u)
    .filter((sentence) => !NUMBER_SENTENCE.test(sentence))
    .join(' ');
}

export async function applyPreview(
  record: PreviewRecord,
  notify: Notify,
  { deemphasizeNumbers = false }: { readonly deemphasizeNumbers?: boolean } = {},
): Promise<ApplyOutcome> {
  // Once only: an applied or dismissed card never applies again; a second click while it runs is ignored.
  if (record.status !== 'pending' || applying.has(record.id)) return 'failed';
  applying.add(record.id);
  try {
    const store = menuStore();
    const { plan, answers } = store.get();
    if (!plan || !answers) return 'failed';
    const computed = await previewPlan(record);
    if (!computed) return 'failed';
    const op = computed.fresh?.op ?? record.op;
    const before = answers;
    const nextAnswers = op.kind === 'goal' ? (op.answers as typeof answers) : answers;
    const applied = computed.plan;
    const summary = computed.fresh?.summaryRu || record.summaryRu || '';
    // The receipt letter: no calories or grams for someone who asked not to see numbers (review of phase 5, M10).
    const letterText =
      (deemphasizeNumbers ? quietLetterText(summary) : summary) || kiki.preview.done;
    // Committed only if the menu is still the one it was computed on (another tab, a mark in between → recompute).
    const written = store.commitPlanIf(plan, applied, (data) => ({
      ...(op.kind === 'goal' ? { answers: nextAnswers } : {}),
      letters: [...data.letters, changeLetter(data.letters, letterText, new Date(), Math.random)],
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
  } finally {
    applying.delete(record.id);
  }
}
