/**
 * A deploy replaced the hashed files while this tab stayed open: a lazy chunk (the menu, the quiz, «Цены»…) then
 * answers 404 and the old page cannot go on (stage-5 code audit, P1 raised to P0; D-129). When a chunk fails on a path
 * the person took, the page asks whether a new version is out: it fetches its own index without the cache and compares
 * the entry script with the one running. Another entry — a deploy: reload once (at most once a minute). The same
 * entry, offline or no answer — the network is at fault: no reload, the scene's own note says so. Background
 * prefetches never reload the page (cross-review of phase 0: a flaky hall Wi-Fi must not reload mid-quiz).
 */
const KEY = 'refectorio.chunkReloadAt';
export const CHUNK_RELOAD_WINDOW_MS = 60_000;

/** The first module script's `src` in an HTML page, resolved against `base`; null when there is none. */
export function entryOf(html: string, base: string): string | null {
  const match = /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/i.exec(html);
  if (!match?.[1]) return null;
  try {
    return new URL(match[1], base).href;
  } catch {
    return null;
  }
}

export type RedeployDeps = {
  readonly online: () => boolean;
  /** This page's own index, fetched past the cache; null on any failure. */
  readonly fetchIndex: () => Promise<string | null>;
  readonly currentEntry: () => string | null;
  readonly base: () => string;
  readonly storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  readonly reload: () => void;
  readonly now: () => number;
};

const browserDeps: RedeployDeps = {
  online: () => navigator.onLine,
  fetchIndex: () =>
    fetch(import.meta.env.BASE_URL, { cache: 'no-store', credentials: 'omit' })
      .then((res) => (res.ok ? res.text() : null))
      .catch(() => null),
  currentEntry: () =>
    document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? null,
  base: () => window.location.href,
  storage: () => window.sessionStorage,
  reload: () => {
    window.location.reload();
  },
  now: Date.now,
};

/** True when the page is being reloaded for a new version. */
export async function reloadIfRedeployed(deps: RedeployDeps = browserDeps): Promise<boolean> {
  try {
    if (!deps.online()) return false;
    const last = deps.storage().getItem(KEY);
    if (last !== null && deps.now() - Number(last) <= CHUNK_RELOAD_WINDOW_MS) return false;
    const running = deps.currentEntry();
    const html = await deps.fetchIndex();
    const served = html === null ? null : entryOf(html, deps.base());
    if (running === null || served === null || served === running) return false;
    // Without the mark a reload could loop: no storage — no reload.
    deps.storage().setItem(KEY, String(deps.now()));
  } catch {
    return false;
  }
  deps.reload();
  return true;
}
