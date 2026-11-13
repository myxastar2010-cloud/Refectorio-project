/**
 * A deploy replaced the hashed files while this tab stayed open: a lazy chunk (the menu, the quiz, «Цены»…) then
 * answers 404 and the old page cannot go on. Vite reports it as `vite:preloadError`; the page reloads once to fetch the
 * new index (stage-5 code audit, P1 raised to P0; D-129). Offline, without session storage (a reload could loop) or a
 * second failure within a minute — no reload: the scenes' own fallbacks (a note, the landing) take over.
 */
const KEY = 'refectorio.chunkReloadAt';
export const CHUNK_RELOAD_WINDOW_MS = 60_000;

export function shouldReloadForChunk(
  nowMs: number,
  lastAtMs: number | null,
  online: boolean,
): boolean {
  return online && (lastAtMs === null || nowMs - lastAtMs > CHUNK_RELOAD_WINDOW_MS);
}

type ReloadWindow = Pick<Window, 'addEventListener' | 'sessionStorage' | 'navigator' | 'location'>;

export function watchStaleChunks(win: ReloadWindow = window, now: () => number = Date.now): void {
  win.addEventListener('vite:preloadError', () => {
    try {
      const raw = win.sessionStorage.getItem(KEY);
      const last = raw === null ? null : Number(raw);
      const t = now();
      if (!shouldReloadForChunk(t, Number.isFinite(last) ? last : null, win.navigator.onLine))
        return;
      win.sessionStorage.setItem(KEY, String(t));
    } catch {
      return;
    }
    win.location.reload();
  });
}
