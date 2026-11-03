import type { MenuResponse } from '@refectorio/menu-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMenuClient, localIsoDate, MenuRequestError } from './client';

class FakeWorker {
  readonly sent: { id: number; type: string }[] = [];
  terminated = 0;
  onmessage: ((event: MessageEvent<MenuResponse>) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  postMessage(message: { id: number; type: string }): void {
    this.sent.push(message);
  }
  terminate(): void {
    this.terminated += 1;
  }
  reply(message: MenuResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<MenuResponse>);
  }
}

const at = <T>(items: readonly T[], i: number): T => {
  const v = items[i];
  if (v === undefined) throw new Error(`no item ${i}`);
  return v;
};

function setup() {
  const workers: FakeWorker[] = [];
  const client = createMenuClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w as unknown as Worker;
  });
  return { workers, client };
}

const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
};

describe('menu client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('spawns lazily and resolves on the matching id, ignoring unknown ids', async () => {
    const { workers, client } = setup();
    expect(workers).toHaveLength(0);
    const first = client.request({ type: 'init' });
    const second = client.request({ type: 'init' });
    expect(workers).toHaveLength(1);
    const w = at(workers, 0);
    expect(w.sent.map((m) => m.id)).toEqual([1, 2]);
    w.reply({ id: 99, type: 'ready' });
    w.reply({ id: 2, type: 'ready' });
    await expect(second).resolves.toEqual({ id: 2, type: 'ready' });
    w.reply({ id: 1, type: 'ready' });
    await expect(first).resolves.toEqual({ id: 1, type: 'ready' });
  });

  it('forwards progress to the request that asked for it', async () => {
    const { workers, client } = setup();
    const onProgress = vi.fn();
    const p = client.request({ type: 'init' }, { onProgress });
    const w = at(workers, 0);
    w.reply({ id: 1, type: 'progress', stage: 'loading', share: 0.5 });
    w.reply({ id: 7, type: 'progress', stage: 'planning', share: 0.9 });
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith('loading', 0.5);
    w.reply({ id: 1, type: 'ready' });
    await p;
  });

  it('rejects with MenuRequestError carrying the engine error', async () => {
    const { workers, client } = setup();
    const p = client.request({ type: 'init' });
    at(workers, 0).reply({ id: 1, type: 'error', error: { code: 'internal', detail: 'boom' } });
    const error = await errorOf(p);
    expect(error).toBeInstanceOf(MenuRequestError);
    expect((error as MenuRequestError).error).toEqual({ code: 'internal', detail: 'boom' });
    expect(at(workers, 0).terminated).toBe(0);
  });

  it('times out every pending request and terminates the worker', async () => {
    const { workers, client } = setup();
    const a = errorOf(client.request({ type: 'init' }, { timeoutMs: 1000 }));
    const b = errorOf(client.request({ type: 'init' }, { timeoutMs: 5000 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(((await a) as MenuRequestError).error).toEqual({ code: 'timeout' });
    expect(((await b) as MenuRequestError).error).toEqual({ code: 'timeout' });
    expect(at(workers, 0).terminated).toBe(1);
    client.request({ type: 'init' }).catch(() => undefined);
    expect(workers).toHaveLength(2);
  });

  it('does not time out an answered request', async () => {
    const { workers, client } = setup();
    const p = client.request({ type: 'init' }, { timeoutMs: 1000 });
    at(workers, 0).reply({ id: 1, type: 'ready' });
    await p;
    await vi.advanceTimersByTimeAsync(5000);
    expect(at(workers, 0).terminated).toBe(0);
  });

  it('cancel rejects everything with cancelled and the next request gets a fresh worker', async () => {
    const { workers, client } = setup();
    const a = errorOf(client.request({ type: 'init' }));
    const b = errorOf(client.request({ type: 'init' }));
    client.cancel();
    expect(((await a) as MenuRequestError).error).toEqual({ code: 'cancelled' });
    expect(((await b) as MenuRequestError).error).toEqual({ code: 'cancelled' });
    expect(at(workers, 0).terminated).toBe(1);
    const next = client.request({ type: 'init' });
    expect(workers).toHaveLength(2);
    expect(at(workers, 1).sent[0]?.id).toBe(3);
    at(workers, 1).reply({ id: 3, type: 'ready' });
    await expect(next).resolves.toEqual({ id: 3, type: 'ready' });
  });

  it('dispose cancels pending requests', async () => {
    const { workers, client } = setup();
    const a = errorOf(client.request({ type: 'init' }));
    client.dispose();
    expect(((await a) as MenuRequestError).error).toEqual({ code: 'cancelled' });
    expect(at(workers, 0).terminated).toBe(1);
  });

  it('a worker error rejects with worker and respawns on the next request', async () => {
    const { workers, client } = setup();
    const a = errorOf(client.request({ type: 'init' }));
    at(workers, 0).onerror?.(new Event('error'));
    expect(((await a) as MenuRequestError).error).toEqual({ code: 'worker' });
    expect(at(workers, 0).terminated).toBe(1);
    client.request({ type: 'init' }).catch(() => undefined);
    expect(workers).toHaveLength(2);
  });
});

describe('localIsoDate', () => {
  it('formats the local calendar date with zero padding', () => {
    expect(localIsoDate(new Date(2026, 10, 3))).toBe('2026-11-03');
    expect(localIsoDate(new Date(2026, 0, 9, 23, 59))).toBe('2026-01-09');
  });
});
