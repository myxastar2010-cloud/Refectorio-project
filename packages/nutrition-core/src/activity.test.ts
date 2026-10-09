import { describe, expect, it } from 'vitest';
import { activityFromLifestyle } from './activity';
import { EXERCISE_FREQUENCIES, LIFESTYLES, type ExerciseFrequency, type Lifestyle } from './types';

const adult = (exercise: ExerciseFrequency, lifestyle: Lifestyle, strengthTraining = false) =>
  activityFromLifestyle({ exercise, lifestyle, strengthTraining, ageYears: 30 });

describe('activityFromLifestyle: adults', () => {
  // Worked examples, research/stage-2-mappings.md §5.5.
  it('office, no sport → PAL 1.40, group I', () => {
    expect(adult('none', 'mostlySitting')).toEqual({ pal: 1.4, group: 'kfa1' });
  });

  it('student: mostly sitting + 3–4 sessions → PAL 1.50, group II (on the threshold)', () => {
    expect(adult('3to4', 'mostlySitting', true)).toEqual({ pal: 1.5, group: 'kfa2' });
  });

  it('shop assistant: mostly standing + 1–2 sessions → PAL 1.64, group II', () => {
    expect(adult('1to2', 'mostlyStanding')).toEqual({ pal: 1.64, group: 'kfa2' });
  });

  it('physical work + daily sport → PAL 2.20, group IV', () => {
    expect(adult('daily', 'physicalLabour', true)).toEqual({ pal: 2.2, group: 'kfa4' });
  });

  it('strength training does not change the estimate', () => {
    expect(adult('1to2', 'mostlyStanding', true)).toEqual(adult('1to2', 'mostlyStanding'));
  });

  it('is monotonic in both answers and stays inside the FAO/WHO range 1.40–2.40', () => {
    for (const lifestyle of LIFESTYLES) {
      let previous = 0;
      for (const exercise of EXERCISE_FREQUENCIES) {
        const { pal } = adult(exercise, lifestyle);
        expect(pal).toBeGreaterThan(previous);
        expect(pal).toBeGreaterThanOrEqual(1.4);
        expect(pal).toBeLessThanOrEqual(2.4);
        previous = pal;
      }
    }
    for (const exercise of EXERCISE_FREQUENCIES) {
      let previous = 0;
      for (const lifestyle of LIFESTYLES) {
        const { pal } = adult(exercise, lifestyle);
        expect(pal).toBeGreaterThan(previous);
        previous = pal;
      }
    }
  });

  it('maps onto the groups at the midpoints 1.50 / 1.75 / 2.05 exactly (integer hundredths)', () => {
    expect(adult('1to2', 'mostlySitting').group).toBe('kfa1'); // 1.44
    expect(adult('none', 'sometimesStanding').group).toBe('kfa2'); // 1.50
    expect(adult('1to2', 'movingAllDay').group).toBe('kfa2'); // 1.74
    expect(adult('5to6', 'mostlyStanding').group).toBe('kfa3'); // 1.75
    expect(adult('5to6', 'sometimesStanding').group).toBe('kfa2'); // 1.65
    expect(adult('daily', 'sometimesStanding').group).toBe('kfa2'); // 1.70
    expect(adult('3to4', 'movingAllDay').group).toBe('kfa3'); // 1.80
    expect(adult('1to2', 'physicalLabour').group).toBe('kfa3'); // 2.04
    expect(adult('5to6', 'movingAllDay').group).toBe('kfa3'); // 1.85
    expect(adult('daily', 'physicalLabour').group).toBe('kfa4'); // 2.20
  });
});

describe('activityFromLifestyle: minors', () => {
  it('counts only sports sessions and reports the group PAL', () => {
    const minor = (exercise: ExerciseFrequency) =>
      activityFromLifestyle({
        exercise,
        lifestyle: 'physicalLabour',
        strengthTraining: false,
        ageYears: 15,
      });
    expect(minor('none')).toEqual({ pal: 1.4, group: 'kfa1' });
    expect(minor('1to2')).toEqual({ pal: 1.6, group: 'kfa2' });
    expect(minor('3to4').group).toBe('kfa3');
    expect(minor('5to6').group).toBe('kfa3');
    expect(minor('daily')).toEqual({ pal: 2.2, group: 'kfa4' });
  });
});
