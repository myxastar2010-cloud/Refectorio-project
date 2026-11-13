import { afterEach, describe, expect, it, vi } from 'vitest';
import { capturePass, readPass } from './pass';

const SIG = 'A'.repeat(43);

function fakeWindow(hash: string) {
  const store = new Map<string, string>();
  const replaced: string[] = [];
  vi.stubGlobal('window', {
    location: { hash, pathname: '/', search: '?seed=1' },
    history: { replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
  return { store, replaced };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('demo pass on the device (D-128)', () => {
  it('takes the pass from the link, keeps it and clears the address', () => {
    const { replaced } = fakeWindow(`#kiki-pass=jury-1.${SIG}`);
    expect(capturePass()).toBe(true);
    expect(replaced).toEqual(['/?seed=1']);
    expect(readPass()).toBe(`jury-1.${SIG}`);
  });

  it('ignores scenes and malformed passes, but still clears a pass link', () => {
    const scene = fakeWindow('#menu');
    expect(capturePass()).toBe(false);
    expect(scene.replaced).toEqual([]);
    const bad = fakeWindow('#kiki-pass=<script>');
    expect(capturePass()).toBe(false);
    expect(bad.replaced).toHaveLength(1);
    expect(readPass()).toBeNull();
    // A broken percent-escape does not throw at startup (it would blank the site).
    const broken = fakeWindow('#kiki-pass=jury-1.%E0%A4%A');
    expect(capturePass()).toBe(false);
    expect(broken.replaced).toHaveLength(1);
  });

  it('a pass edited in storage is not sent', () => {
    const { store } = fakeWindow('');
    store.set('refectorio.kiki.pass', 'jury-1.short');
    expect(readPass()).toBeNull();
  });
});
