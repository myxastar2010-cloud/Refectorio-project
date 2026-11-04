/**
 * The menu's local state (ТЗ этапа 4 §5.2): one in-memory snapshot that the page reads through `useMenu`, persisted
 * record by record to IndexedDB after each change and shared with the site's other tabs over a BroadcastChannel — the
 * higher revision wins. Nothing leaves the browser; «Удалить мои данные» wipes it all.
 */
import type { QuizAnswersV1 } from '@refectorio/contracts';
import { EMPTY_TRACKING, type Plan, type Tracking } from '@refectorio/menu-core';
import { useSyncExternalStore } from 'react';
import type { z } from 'zod';
import { readTestParams } from '../../../lib/params';
import { memoryStore, openStore, type KeyValue } from './db';
import {
  backupSchema,
  DB_NAME,
  DEFAULT_SETTINGS,
  DEMO_DB_NAME,
  KEYS,
  letterSchema,
  PLAN_HISTORY,
  planRecordSchema,
  profileSchema,
  settingsSchema,
  STORE_VERSION,
  trackingSchema,
  widgetSchema,
  type Backup,
  type Letter,
  type Settings,
  type WidgetConfig,
} from './schema';

export type MenuData = {
  readonly answers: QuizAnswersV1 | null;
  readonly plan: Plan | null;
  /** Earlier revisions, newest first (undo). */
  readonly history: readonly Plan[];
  readonly tracking: Tracking;
  readonly widgets: readonly WidgetConfig[];
  readonly letters: readonly Letter[];
  readonly settings: Settings;
};

export type MenuSnapshot = MenuData & {
  readonly status: 'loading' | 'ready';
  /** False: IndexedDB is unavailable and the data lives only until the page closes. */
  readonly durable: boolean;
  readonly rev: number;
};

const EMPTY: MenuData = {
  answers: null,
  plan: null,
  history: [],
  tracking: EMPTY_TRACKING,
  widgets: [],
  letters: [],
  settings: DEFAULT_SETTINGS,
};

type Record_ = keyof typeof KEYS;

/** Each part of the data and the record it is kept in. */
const RECORDS = {
  profile: (d: MenuData) => (d.answers ? { answers: d.answers } : null),
  plan: (d: MenuData) => (d.plan ? { current: d.plan, history: d.history } : null),
  tracking: (d: MenuData) => d.tracking,
  widgets: (d: MenuData) => d.widgets,
  letters: (d: MenuData) => d.letters,
  settings: (d: MenuData) => d.settings,
} satisfies Partial<Record<Record_, (d: MenuData) => unknown>>;

type Parsed<T> = { readonly success: true; readonly data: T } | { readonly success: false };
const parsed = <T>(result: Parsed<T>, fallback: T): T => (result.success ? result.data : fallback);

/** Reads every record; a damaged one falls back to its empty value (never the whole store). */
async function readAll(kv: KeyValue): Promise<{ data: MenuData; rev: number }> {
  const [meta, profile, plan, tracking, widgets, letters, settings] = await Promise.all(
    [
      KEYS.meta,
      KEYS.profile,
      KEYS.plan,
      KEYS.tracking,
      KEYS.widgets,
      KEYS.letters,
      KEYS.settings,
    ].map((key) => kv.get(key).catch(() => undefined)),
  );
  const planRecord = planRecordSchema.safeParse(plan);
  const rev = typeof meta === 'object' && meta && 'rev' in meta ? Number(meta.rev) || 0 : 0;
  return {
    rev,
    data: {
      answers: parsed(profileSchema.safeParse(profile), null)?.answers ?? null,
      plan: planRecord.success ? planRecord.data.current : null,
      history: planRecord.success ? planRecord.data.history : [],
      tracking: parsed(trackingSchema.safeParse(tracking), EMPTY_TRACKING),
      widgets: parsed(widgetSchema.array().safeParse(widgets), []),
      letters: parsed(letterSchema.array().safeParse(letters), []),
      // Fields a newer build added are taken from the defaults (a migration without a version bump).
      settings: settingsSchema.parse({
        ...DEFAULT_SETTINGS,
        ...parsed(settingsSchema.partial().safeParse(settings), {}),
      }),
    },
  };
}

/** A backup file checked by its format and version (a newer app's file is refused, not half-read). */
export function parseBackup(
  file: unknown,
):
  | { ok: true; backup: z.output<typeof backupSchema> }
  | { ok: false; reason: 'format' | 'version' } {
  const version = typeof file === 'object' && file && 'version' in file ? file.version : null;
  if (typeof version === 'number' && version > STORE_VERSION)
    return { ok: false, reason: 'version' };
  const result = backupSchema.safeParse(file);
  return result.success ? { ok: true, backup: result.data } : { ok: false, reason: 'format' };
}

type Listener = () => void;

export type MenuStore = {
  get(): MenuSnapshot;
  subscribe(listener: Listener): () => void;
  /** Loads once (later calls return the same promise). */
  load(): Promise<MenuSnapshot>;
  update(change: (data: MenuData) => MenuData): MenuSnapshot;
  /** A new plan: the current one goes to the undo history. */
  commitPlan(plan: Plan, extra?: (data: MenuData) => Partial<MenuData>): MenuSnapshot;
  /** Back to the previous revision (false — nothing to undo). */
  undoPlan(): boolean;
  backup(): Backup;
  restore(file: unknown): { ok: true } | { ok: false; reason: 'format' | 'version' };
  wipe(): Promise<void>;
};

export function createMenuStore(open: () => Promise<KeyValue>, channelName: string): MenuStore {
  let kv: KeyValue | null = null;
  let snapshot: MenuSnapshot = { ...EMPTY, status: 'loading', durable: true, rev: 0 };
  let loading: Promise<MenuSnapshot> | null = null;
  const listeners = new Set<Listener>();
  const channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName);
  let writing = Promise.resolve();

  const emit = (next: MenuSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  /** Writes the records that changed (by reference) and tells the other tabs. */
  const persist = (before: MenuData, after: MenuData, rev: number) => {
    const entries: Record<string, unknown> = { [KEYS.meta]: { version: STORE_VERSION, rev } };
    for (const [name, pick] of Object.entries(RECORDS) as [
      keyof typeof RECORDS,
      (d: MenuData) => unknown,
    ][]) {
      const value = pick(after);
      if (value !== pick(before)) entries[KEYS[name]] = value;
    }
    const store = kv;
    if (!store) return;
    writing = writing
      .then(() => store.set(entries))
      .catch(() => {
        // A failed write keeps the page working on its memory copy; the next change tries again.
      })
      .then(() => {
        channel?.postMessage({ rev });
      });
  };

  const api: MenuStore = {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load() {
      loading ??= (async () => {
        kv = await open().catch(() => memoryStore());
        const { data, rev } = await readAll(kv);
        emit({ ...data, status: 'ready', durable: kv.durable, rev });
        return snapshot;
      })();
      return loading;
    },
    update(change) {
      const before: MenuData = snapshot;
      const after = change(before);
      if (after === before) return snapshot;
      const rev = snapshot.rev + 1;
      emit({ ...snapshot, ...after, rev });
      persist(before, after, rev);
      return snapshot;
    },
    commitPlan(plan, extra) {
      return api.update((data) => ({
        ...data,
        plan,
        history: data.plan ? [data.plan, ...data.history].slice(0, PLAN_HISTORY) : data.history,
        ...extra?.(data),
      }));
    },
    undoPlan() {
      const [previous, ...rest] = snapshot.history;
      if (!previous) return false;
      api.update((data) => ({ ...data, plan: previous, history: rest }));
      return true;
    },
    backup() {
      const s = snapshot;
      return {
        format: 'refectorio.backup',
        version: STORE_VERSION,
        exportedAt: new Date().toISOString(),
        data: {
          profile: { answers: s.answers as QuizAnswersV1 },
          plan: { current: s.plan as Plan, history: [...s.history] },
          tracking: s.tracking,
          widgets: [...s.widgets],
          letters: [...s.letters],
          settings: s.settings,
        },
      } as unknown as Backup;
    },
    restore(file) {
      const result = parseBackup(file);
      if (!result.ok) return result;
      const { data } = result.backup;
      api.update(() => ({
        answers: data.profile.answers,
        plan: data.plan.current,
        history: data.plan.history,
        tracking: data.tracking,
        widgets: data.widgets,
        letters: data.letters,
        settings: data.settings,
      }));
      return { ok: true };
    },
    async wipe() {
      await writing;
      await kv?.clear();
      const rev = snapshot.rev + 1;
      emit({ ...EMPTY, status: 'ready', durable: snapshot.durable, rev });
      channel?.postMessage({ rev, wiped: true });
    },
  };

  // Another tab changed the data: a higher revision replaces ours (ТЗ §5.2).
  channel?.addEventListener('message', (event: MessageEvent<{ rev?: number }>) => {
    const rev = Number(event.data.rev);
    if (!kv || !(rev > snapshot.rev)) return;
    const store = kv;
    void readAll(store).then(({ data }) => {
      if (rev > snapshot.rev) emit({ ...data, status: 'ready', durable: store.durable, rev });
    });
  });

  return api;
}

let shared: MenuStore | null = null;

/** The site's store (`?menu=demo` — a separate database for the seeded demo plan). */
export function menuStore(): MenuStore {
  const demo = readTestParams(window.location.search).menuDemo;
  shared ??= createMenuStore(
    () => openStore(demo ? DEMO_DB_NAME : DB_NAME),
    demo ? 'refectorio.menu.demo' : 'refectorio.menu',
  );
  return shared;
}

export function useMenu<T>(select: (snapshot: MenuSnapshot) => T): T {
  const store = menuStore();
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => select(store.get()),
  );
}
