/**
 * Readers of the Kiki limits' environment (D-128, cross-review of stage 5 phase 0): forgiving where a typo would
 * silently leave Kiki open, and a startup line that shows what is in force.
 */
import type { Limits } from './rateLimit';

/** The free provider's own allowance per account (APInex free: 15 requests / min). */
export const PROVIDER_PER_MIN = 15;

/** `KIKI_PUBLIC`: 0, false, off or no (any case) — only demo passes; anything else (or unset) — open to everyone. */
export function isPublicOpen(value: string | undefined): boolean {
  return !/^(0|false|off|no)$/i.test((value ?? '').trim());
}

/** `KIKI_REVOKED_PASSES`: demo-pass names, comma-separated — a leaked pass is turned off without touching the rest. */
export function revokedPasses(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Model calls per minute of the two server-wide shares, and whether together they stay below the provider's. */
export function sharesPerMin(limits: Limits): {
  readonly publicPerMin: number;
  readonly reservePerMin: number;
  readonly belowProvider: boolean;
} {
  const perMin = (bucket: 'public' | 'reserve') =>
    limits[bucket]?.find((w) => w.ms === 60_000)?.limit ?? 0;
  const publicPerMin = perMin('public');
  const reservePerMin = perMin('reserve');
  return {
    publicPerMin,
    reservePerMin,
    belowProvider: publicPerMin + reservePerMin < PROVIDER_PER_MIN,
  };
}
