import { describe, expect, it } from 'vitest';
import { readTestParams } from './params';

const OFF = { seed: null, freeze: false, designPose: false, menuDemo: false, weekDemo: false };

describe('readTestParams', () => {
  it('reads seed, freeze and design pose', () => {
    expect(readTestParams('?seed=123&freeze=1&pose=design')).toEqual({
      ...OFF,
      seed: 123,
      freeze: true,
      designPose: true,
    });
  });

  it('reads the menu demo hooks', () => {
    expect(readTestParams('?menu=demo&demo=week')).toEqual({
      ...OFF,
      menuDemo: true,
      weekDemo: true,
    });
  });

  it('ignores anything else', () => {
    expect(readTestParams('')).toEqual(OFF);
    expect(readTestParams('?seed=abc&freeze=true&pose=x&menu=1&demo')).toEqual(OFF);
    expect(readTestParams('?seed=-1')).toEqual(OFF);
  });
});
