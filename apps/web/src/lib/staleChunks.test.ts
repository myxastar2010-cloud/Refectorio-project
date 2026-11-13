import { describe, expect, it } from 'vitest';
import {
  CHUNK_RELOAD_WINDOW_MS,
  entryOf,
  reloadIfRedeployed,
  type RedeployDeps,
} from './staleChunks';

const BASE = 'https://refectorio.onrender.com/#menu';
const page = (entry: string) =>
  `<!doctype html><head><script type="module" crossorigin src="${entry}"></script></head>`;

function deps(overrides: Partial<RedeployDeps> & { served?: string | null } = {}) {
  const store = new Map<string, string>();
  let reloads = 0;
  const d: RedeployDeps = {
    online: () => true,
    fetchIndex: () =>
      Promise.resolve(
        overrides.served === undefined ? page('/assets/index-NEW.js') : overrides.served,
      ),
    currentEntry: () => 'https://refectorio.onrender.com/assets/index-OLD.js',
    base: () => BASE,
    storage: () => ({
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    }),
    reload: () => {
      reloads++;
    },
    now: () => 1_000_000,
    ...overrides,
  };
  return { d, reloads: () => reloads, store };
}

describe('stale chunks after a deploy (D-129)', () => {
  it('reads the entry script of a page', () => {
    expect(entryOf(page('/assets/index-A.js'), BASE)).toBe(
      'https://refectorio.onrender.com/assets/index-A.js',
    );
    expect(entryOf('<script src="/x.js"></script>', BASE)).toBeNull();
  });

  it('a new version is out: reload once, and not again within a minute', async () => {
    const { d, reloads } = deps();
    expect(await reloadIfRedeployed(d)).toBe(true);
    expect(await reloadIfRedeployed(d)).toBe(false);
    expect(reloads()).toBe(1);
    const later = { ...d, now: () => 1_000_001 + CHUNK_RELOAD_WINDOW_MS };
    expect(await reloadIfRedeployed(later)).toBe(true);
  });

  it('the same version, offline, no answer or no storage: no reload', async () => {
    const same = deps({ served: page('/assets/index-OLD.js') });
    expect(await reloadIfRedeployed(same.d)).toBe(false);
    const offline = deps({ online: () => false });
    expect(await reloadIfRedeployed(offline.d)).toBe(false);
    const silent = deps({ served: null });
    expect(await reloadIfRedeployed(silent.d)).toBe(false);
    const blocked = deps({
      storage: () => {
        throw new Error('blocked');
      },
    });
    expect(await reloadIfRedeployed(blocked.d)).toBe(false);
    for (const x of [same, offline, silent, blocked]) expect(x.reloads()).toBe(0);
  });
});
