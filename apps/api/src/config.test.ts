import { describe, expect, it } from 'vitest';
import { isPublicOpen, PROVIDER_PER_MIN, revokedPasses, sharesPerMin } from './config';
import { LIMITS, withShares } from './rateLimit';

describe('Kiki limits from the environment (D-128)', () => {
  it('KIKI_PUBLIC closes on 0 / false / off / no, any case and spacing; open otherwise', () => {
    for (const value of ['0', 'false', 'OFF', ' no '])
      expect(isPublicOpen(value), value).toBe(false);
    for (const value of [undefined, '', '1', 'true', 'on', 'yes'])
      expect(isPublicOpen(value), String(value)).toBe(true);
  });

  it('revoked pass names: comma-separated, trimmed, lowercase', () => {
    expect([...revokedPasses(' Jury-1, jury-2 ,,')]).toEqual(['jury-1', 'jury-2']);
    expect(revokedPasses(undefined).size).toBe(0);
  });

  it('the default shares stay below the provider allowance; a raised share is reported', () => {
    expect(sharesPerMin(LIMITS)).toEqual({
      publicPerMin: 8,
      reservePerMin: 4,
      belowProvider: true,
    });
    const raised = withShares(LIMITS, { publicPerMin: PROVIDER_PER_MIN });
    expect(sharesPerMin(raised).belowProvider).toBe(false);
  });
});
