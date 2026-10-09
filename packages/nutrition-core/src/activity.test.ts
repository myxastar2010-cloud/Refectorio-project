import { describe, expect, it } from 'vitest';
import { activityFromLifestyle } from './activity';
import { EXERCISE_FREQUENCIES, LIFESTYLES, type ExerciseFrequency, type Lifestyle } from './types';

const estimate = (exercise: ExerciseFrequency, lifestyle: Lifestyle, strengthTraining = false) =>
  activityFromLifestyle({ exercise, lifestyle, strengthTraining });

describe('activityFromLifestyle', () => {
  // Worked examples (research/stage-2-mappings.md §5).
  it('office worker without sport → PAL 1.40, group I', () => {
    expect(estimate('none', 'mostlySitting')).toEqual({ pal: 1.4, group: 'kfa1' });
  });

  it('office worker with sport 3–4 times a week → PAL 1.50, group II', () => {
    expect(estimate('3to4', 'mostlySitting', true)).toEqual({ pal: 1.5, group: 'kfa2' });
  });

  it('on the move all day plus sport 5–6 times → PAL 1.90, group III', () => {
    expect(estimate('5to6', 'movingAllDay')).toEqual({ pal: 1.9, group: 'kfa3' });
  });

  it('physical labour plus daily sport → PAL 2.10, group IV', () => {
    expect(estimate('daily', 'physicalLabour', true)).toEqual({ pal: 2.1, group: 'kfa4' });
  });

  it('strength training does not change the PAL estimate', () => {
    expect(estimate('1to2', 'mostlyStanding', true)).toEqual(estimate('1to2', 'mostlyStanding'));
  });

  it('is monotonic in both answers and stays inside the FAO/WHO range 1.4–2.4', () => {
    for (const lifestyle of LIFESTYLES) {
      let previous = 0;
      for (const exercise of EXERCISE_FREQUENCIES) {
        const { pal } = estimate(exercise, lifestyle);
        expect(pal).toBeGreaterThan(previous);
        expect(pal).toBeGreaterThanOrEqual(1.4);
        expect(pal).toBeLessThanOrEqual(2.4);
        previous = pal;
      }
    }
    for (const exercise of EXERCISE_FREQUENCIES) {
      let previous = 0;
      for (const lifestyle of LIFESTYLES) {
        const { pal } = estimate(exercise, lifestyle);
        expect(pal).toBeGreaterThan(previous);
        previous = pal;
      }
    }
  });

  it('maps PAL onto the groups at the midpoints 1.5 / 1.75 / 2.05', () => {
    expect(estimate('1to2', 'mostlySitting').group).toBe('kfa1'); // 1.45
    expect(estimate('3to4', 'mostlyStanding').group).toBe('kfa2'); // 1.70
    expect(estimate('none', 'movingAllDay').group).toBe('kfa3'); // 1.75
    expect(estimate('3to4', 'physicalLabour').group).toBe('kfa3'); // 2.00
    expect(estimate('5to6', 'physicalLabour').group).toBe('kfa4'); // 2.05
  });
});
