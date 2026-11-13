/**
 * The demo pass on this device (stage 5, phase 0; D-128): the presenter's and the jury's devices open
 * `https://refectorio.onrender.com/#kiki-pass=<pass>` once; the pass is kept in localStorage and sent with every chat
 * request, so Kiki answers them from the reserved share even when the public one is used up or closed. A fragment never
 * reaches a server or a Referer; it is removed from the address at once (it is not a scene).
 */
const KEY = 'refectorio.kiki.pass';
const PREFIX = '#kiki-pass=';
const FORMAT = /^[a-z0-9-]{1,32}\.[A-Za-z0-9_-]{43}$/;

/** Takes a pass from the address (call before the scenes read the hash). True when one was taken. */
export function capturePass(): boolean {
  if (typeof window === 'undefined' || !window.location.hash.startsWith(PREFIX)) return false;
  const raw = window.location.hash.slice(PREFIX.length);
  // The address is cleared first: a broken link must not stay and break every reload.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    const pass = decodeURIComponent(raw);
    if (!FORMAT.test(pass)) return false;
    window.localStorage.setItem(KEY, pass);
    return true;
  } catch {
    return false;
  }
}

/** The kept pass, or null. */
export function readPass(): string | null {
  try {
    const pass = window.localStorage.getItem(KEY);
    return pass && FORMAT.test(pass) ? pass : null;
  } catch {
    return null;
  }
}
