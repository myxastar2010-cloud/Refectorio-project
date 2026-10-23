import { describe, expect, it } from 'vitest';
import { STEP_IDS } from './types';
import { testState, testStateNames } from './testStates';

describe('the test hook ?step=…&state=… (test builds only)', () => {
  it('opens every step in each of its known sub-states', () => {
    for (const step of STEP_IDS) {
      for (const name of testStateNames(step)) {
        const state = testState(step, name, 1);
        expect(state?.screen, `${step}:${name}`).toBe(step);
      }
    }
    expect(testState('finale', 'refused', 1)?.screen).toBe('finale');
    expect(testState('adjustments', null, 1)?.adjustments).toHaveLength(2);
    expect(testState('nonsense', null, 1)).toBeNull();
  });
});
