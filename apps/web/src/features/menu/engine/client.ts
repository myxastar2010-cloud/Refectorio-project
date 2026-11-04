/**
 * The main thread's side of the menu worker: promise per request, progress callbacks, a timeout. The engine runs
 * synchronously and cannot be interrupted, so a timed-out request terminates the worker and the requests still waiting
 * go to a fresh one (review of phase 3, m13); cancel stops them all. `prefetchMenuEngine` starts the worker and loads the food data during the quiz.
 */
import type { MenuError, MenuRequest, MenuResponse, MenuStage } from '@refectorio/menu-core';

type Body = MenuRequest extends infer R ? (R extends MenuRequest ? Omit<R, 'id'> : never) : never;
type Answer = Exclude<MenuResponse, { type: 'progress' } | { type: 'error' }>;

export type MenuClientError =
  | MenuError
  | { readonly code: 'timeout' }
  | { readonly code: 'cancelled' }
  | { readonly code: 'worker' };

export class MenuRequestError extends Error {
  constructor(readonly error: MenuClientError) {
    super(error.code);
  }
}

type Pending = {
  readonly resolve: (answer: Answer) => void;
  readonly reject: (error: MenuRequestError) => void;
  readonly onProgress?: ((stage: MenuStage, share: number) => void) | undefined;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly message: MenuRequest;
};

export type MenuClient = {
  readonly request: (
    body: Body,
    options?: {
      readonly onProgress?: (stage: MenuStage, share: number) => void;
      readonly timeoutMs?: number;
    },
  ) => Promise<Answer>;
  /** Stops every pending request (they reject with `cancelled`). */
  readonly cancel: () => void;
  readonly dispose: () => void;
};

const DEFAULT_TIMEOUT_MS = 20_000;

export function createMenuClient(spawn: () => Worker): MenuClient {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const fail = (error: MenuClientError) => {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new MenuRequestError(error));
      pending.delete(id);
    }
    worker?.terminate();
    worker = null;
  };

  const expire = (id: number) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    p.reject(new MenuRequestError({ code: 'timeout' }));
    worker?.terminate();
    worker = null;
    if (pending.size === 0) return;
    const fresh = ensure();
    for (const waiting of pending.values()) fresh.postMessage(waiting.message);
  };

  const ensure = (): Worker => {
    if (worker) return worker;
    const w = spawn();
    w.onmessage = (event: MessageEvent<MenuResponse>) => {
      const message = event.data;
      const p = pending.get(message.id);
      if (!p) return;
      if (message.type === 'progress') {
        p.onProgress?.(message.stage, message.share);
        return;
      }
      clearTimeout(p.timer);
      pending.delete(message.id);
      if (message.type === 'error') p.reject(new MenuRequestError(message.error));
      else p.resolve(message);
    };
    w.onerror = () => {
      fail({ code: 'worker' });
    };
    worker = w;
    return w;
  };

  return {
    request: (body, options = {}) =>
      new Promise<Answer>((resolve, reject) => {
        const id = nextId;
        nextId += 1;
        const timer = setTimeout(() => {
          expire(id);
        }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        const message = { ...body, id } as MenuRequest;
        pending.set(id, { resolve, reject, onProgress: options.onProgress, timer, message });
        ensure().postMessage(message);
      }),
    cancel: () => {
      fail({ code: 'cancelled' });
    },
    dispose: () => {
      fail({ code: 'cancelled' });
    },
  };
}

let shared: MenuClient | null = null;

/** One worker for the site (created on first use). */
export function menuClient(): MenuClient {
  shared ??= createMenuClient(
    () =>
      new Worker(new URL('./menu.worker.ts', import.meta.url), { type: 'module', name: 'menu' }),
  );
  return shared;
}

/** The quiz calls this while the person answers: the worker is warm and the food data parsed by the finale. */
export function prefetchMenuEngine(): void {
  if (typeof Worker === 'undefined') return;
  menuClient()
    .request({ type: 'init' })
    .catch(() => {
      // The finale tries again and shows the error if there is one.
    });
}

/** Today in the person's own time zone (the engine never reads the clock). */
export function localIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
