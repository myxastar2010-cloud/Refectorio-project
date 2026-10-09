import { describe, expect, it } from 'vitest';
import catalogJson from '../data/catalog.json';
import { catalogSchema } from '../src/catalog';
import { prepareCatalog } from '../src/engine';
import { aggregate, pairedDifference } from './aggregate';
import { calibrateTemperature, createPopulation, repeatAgreement } from './generative';
import { simulateUser } from './simulate';

/**
 * A fast fixed-seed version of the full simulation (sim/main.ts, 5000 players; results in
 * refectorio-workspace/reports/stage-2/taste-sim/): the algorithm must keep beating random questions on the same
 * players and reach the AUC level of the full run.
 */
describe('simulation smoke (fixed seed)', () => {
  const prepared = prepareCatalog(catalogSchema.parse(catalogJson));
  const users = createPopulation(prepared.dishes, 150, 7);

  it('ours beats random questions on the same players and reaches AUC ≈ 0.7 at 10 answers', () => {
    const results = users.flatMap((user) =>
      (['ours', 'random'] as const).map((s) => simulateUser(prepared, user, s, 7)),
    );
    const agg = aggregate(results);
    expect(agg.ours.aucTrue[10]?.mean).toBeGreaterThan(0.69);
    expect(pairedDifference(results, 'ours', 'random').mean).toBeGreaterThan(0);
  }, 120_000);

  it('is deterministic for a seed', () => {
    const user = users[0];
    if (!user) throw new Error('no user');
    expect(simulateUser(prepared, user, 'ours', 7)).toEqual(
      simulateUser(prepared, user, 'ours', 7),
    );
  });

  it('calibrates answer noise to the target repeat agreement (R15 §8.3)', () => {
    const user = users[1];
    if (!user) throw new Error('no user');
    const temperature = calibrateTemperature(user.utility, 0.76, 0.05);
    expect(repeatAgreement(user.utility, temperature, 0.05)).toBeCloseTo(0.76, 3);
    const mean =
      users.reduce((s, u) => s + repeatAgreement(u.utility, u.temperature, u.lapse), 0) /
      users.length;
    expect(mean).toBeGreaterThan(0.73);
    expect(mean).toBeLessThan(0.79);
  });
});
