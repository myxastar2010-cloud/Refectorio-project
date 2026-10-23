/**
 * Plain values of the content shared with code that must not load zod (the «Цены» chunk: the stage-3 performance
 * audit, F6 — importing them from schema.ts pulled zod, 25.9 KB gzip, and built the whole site schema).
 */
export const PLAN_IDS = ['free', 'premium'] as const;
export const BILLING_PERIODS = ['month', 'year'] as const;

export type PlanId = (typeof PLAN_IDS)[number];
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
