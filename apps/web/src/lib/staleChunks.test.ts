import { describe, expect, it } from 'vitest';
import { CHUNK_RELOAD_WINDOW_MS, shouldReloadForChunk, watchStaleChunks } from './staleChunks';

function fakeWindow(online = true, storage = true) {
  const store = new Map<string, string>();
  let handler: (() => void) | null = null;
  let reloads = 0;
  const win = {
    addEventListener: (_type: string, fn: () => void) => {
      handler = fn;
    },
    sessionStorage: {
      getItem: (k: string) => {
        if (!storage) throw new Error('blocked');
        return store.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (!storage) throw new Error('blocked');
        store.set(k, v);
      },
    },
    navigator: { onLine: online },
    location: {
      reload: () => {
        reloads++;
      },
    },
  } as unknown as Parameters<typeof watchStaleChunks>[0];
  return { win, fire: () => handler?.(), reloads: () => reloads };
}

describe('stale chunks after a deploy (D-129)', () => {
  it('reloads once, online, outside the window', () => {
    expect(shouldReloadForChunk(1000, null, true)).toBe(true);
    expect(shouldReloadForChunk(1000, null, false)).toBe(false);
    expect(shouldReloadForChunk(1000 + CHUNK_RELOAD_WINDOW_MS, 1000, true)).toBe(false);
    expect(shouldReloadForChunk(1001 + CHUNK_RELOAD_WINDOW_MS, 1000, true)).toBe(true);
  });

  it('a second failure within a minute does not loop', () => {
    let t = 5_000;
    const w = fakeWindow();
    watchStaleChunks(w.win, () => t);
    w.fire();
    expect(w.reloads()).toBe(1);
    t += 10_000;
    w.fire();
    expect(w.reloads()).toBe(1);
  });

  it('offline or without session storage: no reload', () => {
    const offline = fakeWindow(false);
    watchStaleChunks(offline.win);
    offline.fire();
    expect(offline.reloads()).toBe(0);
    const blocked = fakeWindow(true, false);
    watchStaleChunks(blocked.win);
    blocked.fire();
    expect(blocked.reloads()).toBe(0);
  });
});
