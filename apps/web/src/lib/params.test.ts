import { describe, expect, it } from 'vitest';
import { readTestParams } from './params';

describe('readTestParams', () => {
  it('reads seed, freeze and design pose', () => {
    expect(readTestParams('?seed=123&freeze=1&pose=design')).toEqual({
      seed: 123,
      freeze: true,
      designPose: true,
    });
  });

  it('ignores anything else', () => {
    expect(readTestParams('')).toEqual({ seed: null, freeze: false, designPose: false });
    expect(readTestParams('?seed=abc&freeze=true&pose=x')).toEqual({
      seed: null,
      freeze: false,
      designPose: false,
    });
    expect(readTestParams('?seed=-1')).toEqual({ seed: null, freeze: false, designPose: false });
  });
});
