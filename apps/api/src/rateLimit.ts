/**
 * Per-IP limits (ТЗ 07 §2): chat 20 turns / 10 min and 150 / day; vision 10 / day; search 30 / day. Fixed windows in
 * memory — one free instance, a restart forgets them (acceptable for a demo; documented in ADR 0013).
 */
export type Window = { readonly limit: number; readonly ms: number };

export const LIMITS = {
  chat: [
    { limit: 20, ms: 10 * 60_000 },
    { limit: 150, ms: 24 * 3_600_000 },
  ],
  vision: [{ limit: 10, ms: 24 * 3_600_000 }],
  search: [{ limit: 30, ms: 24 * 3_600_000 }],
} as const satisfies Record<string, readonly Window[]>;
export type Bucket = keyof typeof LIMITS;

type Counter = { start: number; count: number };

export type Limiter = {
  /** Counts one use; returns 0 when allowed, otherwise ms until the next use is allowed (nothing counted). */
  take(bucket: Bucket, ip: string): number;
  /** Drops expired counters (called now and then). */
  sweep(): void;
};

export function createLimiter(
  now: () => number = Date.now,
  limits: Readonly<Record<Bucket, readonly Window[]>> = LIMITS,
): Limiter {
  const counters = new Map<string, Counter>();
  const keyOf = (bucket: string, i: number, ip: string) => `${bucket}:${i}:${ip}`;
  return {
    take(bucket, ip) {
      const t = now();
      const windows = limits[bucket];
      let wait = 0;
      windows.forEach((w, i) => {
        const c = counters.get(keyOf(bucket, i, ip));
        if (c && t - c.start < w.ms && c.count >= w.limit)
          wait = Math.max(wait, c.start + w.ms - t);
      });
      if (wait > 0) return wait;
      windows.forEach((w, i) => {
        const key = keyOf(bucket, i, ip);
        const c = counters.get(key);
        if (!c || t - c.start >= w.ms) counters.set(key, { start: t, count: 1 });
        else c.count++;
      });
      return 0;
    },
    sweep() {
      const t = now();
      for (const [key, c] of counters) if (t - c.start > 24 * 3_600_000) counters.delete(key);
    },
  };
}
