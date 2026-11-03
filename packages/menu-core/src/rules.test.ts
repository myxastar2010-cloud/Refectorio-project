import { describe, expect, it } from 'vitest';
import rulesJson from '../data/rules.json';
import { RULE_IDS, RULES, RULES_VERSION, rule } from './rules';

describe('rules.json', () => {
  it('has exactly the ids the code knows, once each', () => {
    const ids = rulesJson.rules.map((r) => r.id).sort();
    expect(ids).toEqual([...RULE_IDS].sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(RULES.size).toBe(RULE_IDS.length);
  });

  it('gives every rule a source, a unit and a confidence', () => {
    for (const record of RULES.values()) {
      expect(record.source.length).toBeGreaterThanOrEqual(5);
      expect(record.unit.length).toBeGreaterThan(0);
      expect(['high', 'medium', 'low']).toContain(record.confidence);
      expect(['hard', 'soft', 'check']).toContain(record.kind);
    }
  });

  it('exposes a version', () => {
    expect(RULES_VERSION.length).toBeGreaterThan(0);
  });
});

describe('rule', () => {
  it('returns a finite non-negative number for every id', () => {
    for (const id of RULE_IDS) {
      const value = rule(id);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns the R17 E17 meal shares', () => {
    expect(rule('E17.share.breakfast')).toBeCloseTo(0.25);
    expect(rule('E17.share.lunch')).toBeCloseTo(0.35);
    expect(rule('E17.share.dinner')).toBeCloseTo(0.25);
    expect(rule('E17.share.snacks')).toBeCloseTo(0.15);
  });

  it('throws for an unknown id', () => {
    // @ts-expect-error an id the code does not know
    expect(() => rule('nope')).toThrow();
  });
});
