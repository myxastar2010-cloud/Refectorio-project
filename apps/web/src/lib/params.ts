/**
 * Test-only modes, enabled exclusively through the address bar (ТЗ 6.7):
 *   ?seed=123      deterministic food field
 *   ?freeze=1      time stops (food and its drift)
 *   ?pose=design   food placed exactly as on the mockups (for screenshot comparison)
 */
export type TestParams = {
  readonly seed: number | null;
  readonly freeze: boolean;
  readonly designPose: boolean;
};

export function readTestParams(search: string): TestParams {
  const params = new URLSearchParams(search);
  const seedText = params.get('seed');
  const seed = seedText !== null && /^\d{1,9}$/.test(seedText) ? Number(seedText) : null;
  return {
    seed,
    freeze: params.get('freeze') === '1',
    designPose: params.get('pose') === 'design',
  };
}
