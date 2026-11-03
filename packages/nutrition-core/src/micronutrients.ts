/**
 * Vitamin and mineral norms of МР 2.3.1.0253-21 by sex, age, pregnancy and lactation, with NASEM upper limits
 * (data/mr-2021-micronutrients.json; extraction notes: research/stage-4-food-data/mr-2021-micronutrients.md).
 * Units follow the menu data (food-data NUTRIENTS); where МР counts differently (vitamin A in retinol equivalents,
 * niacin in niacin equivalents) the comparison is an estimate — see `unitNotes`.
 */
import data from './data/mr-2021-micronutrients.json';
import type { Questionnaire } from './types';

export const MICRONUTRIENT_KEYS = [
  'calciumMg',
  'ironMg',
  'magnesiumMg',
  'zincMg',
  'phosphorusMg',
  'seleniumUg',
  'iodineUg',
  'potassiumMg',
  'vitaminAUg',
  'vitaminCMg',
  'vitaminDUg',
  'vitaminEMg',
  'vitaminKUg',
  'thiaminMg',
  'riboflavinMg',
  'niacinMg',
  'vitaminB6Mg',
  'vitaminB12Ug',
  'folateUgDfe',
] as const;
export type MicronutrientKey = (typeof MICRONUTRIENT_KEYS)[number];

export type MicronutrientNorm = {
  readonly norm: number;
  /** NASEM tolerable upper intake level for adults; `scope` says what it counts. */
  readonly ul?: number;
  readonly ulScope?: 'total' | 'supplementsOnly' | 'preformedOnly';
};

type Values = Partial<Record<string, number | null>>;
const valuesOf = (v: unknown): Values => (v && typeof v === 'object' ? v : {});

function pick(values: readonly Values[], key: MicronutrientKey): number | null {
  // Several applicable tables (pregnancy and lactation, unspecified sex): the higher norm.
  let best: number | null = null;
  for (const v of values) {
    const value = v[key];
    if (typeof value === 'number' && (best === null || value > best)) best = value;
  }
  return best;
}

type Band = { readonly fromAgeYears: number; readonly toAgeYears: number };
const inBand = <T extends Band>(bands: readonly T[], age: number): T | undefined =>
  bands.find((b) => age >= b.fromAgeYears && age < b.toAgeYears);

export function micronutrientNorms(
  q: Pick<Questionnaire, 'ageYears' | 'sex' | 'pregnancy' | 'lactation'>,
): Partial<Record<MicronutrientKey, MicronutrientNorm>> {
  const tables: Values[] = [];
  const adult = q.ageYears >= 18;
  if (adult) {
    const sexes = q.sex === 'unspecified' ? (['male', 'female'] as const) : ([q.sex] as const);
    for (const sex of sexes) {
      const band = inBand(data.adult[sex], q.ageYears);
      if (band) tables.push(valuesOf(band.values));
    }
  } else {
    const band = inBand(data.child, q.ageYears);
    if (band) {
      if (q.sex !== 'female') tables.push(valuesOf(band.male));
      if (q.sex !== 'male') tables.push(valuesOf(band.female));
    }
  }
  // МР gives absolute norms for pregnancy and lactation (table 20): they replace the adult table.
  const special: Values[] = [];
  if (q.pregnancy !== 'none') special.push(valuesOf(data.pregnancy[q.pregnancy]));
  if (q.lactation !== 'none') special.push(valuesOf(data.lactation[q.lactation]));
  const source = special.length > 0 ? special : tables;

  const limits = data.upperLimits as Record<string, unknown>;
  const out: Partial<Record<MicronutrientKey, MicronutrientNorm>> = {};
  for (const key of MICRONUTRIENT_KEYS) {
    const norm = pick(source, key);
    if (norm === null) continue;
    const limit = limits[key];
    const ulValue =
      adult && limit && typeof limit === 'object' ? (limit as { value?: unknown }).value : null;
    const scope =
      limit && typeof limit === 'object' ? (limit as { appliesTo?: unknown }).appliesTo : undefined;
    out[key] =
      typeof ulValue === 'number' &&
      (scope === 'total' || scope === 'supplementsOnly' || scope === 'preformedOnly')
        ? { norm, ul: ulValue, ulScope: scope }
        : { norm };
  }
  return out;
}

export const MICRONUTRIENT_SOURCE: string = data.source;
