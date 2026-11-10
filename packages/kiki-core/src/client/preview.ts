/**
 * Proposals (ТЗ 07 §7): what Kiki proposes is an operation on the plan plus its result. The chat keeps the operation
 * (small, durable) and the computed plan (for the overlay); «Применить» commits the plan when the menu is still the one
 * it was computed from, otherwise re-runs the operation on the current menu. The summary is written by code — the
 * model only retells it, numbers included.
 */
import type {
  DayTargets,
  IsoDate,
  Meal,
  Plan,
  PlanDiff,
  Rule,
  SlotRef,
} from '@refectorio/menu-core';
import { weekdayIndex } from '@refectorio/menu-core';

export type PreviewOp =
  | { readonly kind: 'rules'; readonly rules: readonly Rule[] }
  | { readonly kind: 'goal'; readonly answers: unknown }
  | { readonly kind: 'structure'; readonly structure: readonly Meal[] }
  | { readonly kind: 'replace'; readonly slot: SlotRef; readonly itemId: string };

export type DayChange = {
  readonly date: IsoDate;
  readonly weekday: string;
  readonly kcalBefore: number | null;
  readonly kcalAfter: number | null;
  readonly proteinBefore: number | null;
  readonly proteinAfter: number | null;
  readonly removed: readonly string[];
  readonly added: readonly string[];
};

export type PreviewStats = {
  readonly changedDays: number;
  readonly days: readonly DayChange[];
  readonly targets?: {
    readonly kcalBefore: number;
    readonly kcalAfter: number;
    readonly proteinBefore: number;
    readonly proteinAfter: number;
  };
};

export type Preview = {
  readonly id: string;
  readonly op: PreviewOp;
  /** Revision of the plan the preview was computed from. */
  readonly baseRevision: number;
  readonly plan: Plan;
  readonly diff: PlanDiff;
  readonly summaryRu: string;
  readonly stats: PreviewStats;
  /** Rule labels added / removed (for the overlay's «правила простыми словами»). */
  readonly rulesAdded: readonly string[];
  readonly rulesRemoved: readonly string[];
  readonly reasonRu?: string;
};

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const fmt = (n: number) => nf.format(n);
const round = (n: number | null | undefined) => (n == null ? null : Math.round(n));

export type BuildPreviewInput = {
  readonly id: string;
  readonly op: PreviewOp;
  readonly base: Plan;
  readonly plan: Plan;
  readonly diff: PlanDiff;
  readonly names: (itemId: string) => string;
  readonly reasonRu?: string;
  readonly targetsAfter?: DayTargets;
};

const MAX_LISTED_DAYS = 4;
const MAX_SUMMARY_CHARS = 700;

export function buildPreview(input: BuildPreviewInput): Preview {
  const { base, plan, diff, names } = input;
  const days: DayChange[] = diff.days.map((d) => ({
    date: d.date,
    weekday: WEEKDAYS[weekdayIndex(d.date)] ?? '',
    kcalBefore: round(d.totalsBefore?.energyKcal),
    kcalAfter: round(d.totalsAfter?.energyKcal),
    proteinBefore: round(d.totalsBefore?.proteinG),
    proteinAfter: round(d.totalsAfter?.proteinG),
    removed: [...new Set(d.meals.flatMap((m) => m.removed))].map(names),
    added: [...new Set(d.meals.flatMap((m) => m.added))].map(names),
  }));

  const before = new Map(base.rules.map((r) => [r.id, r]));
  const after = new Map(plan.rules.map((r) => [r.id, r]));
  const rulesAdded = plan.rules.filter((r) => !before.has(r.id)).map((r) => r.textRu);
  const rulesRemoved = base.rules.filter((r) => !after.has(r.id)).map((r) => r.textRu);

  const parts: string[] = [];
  if (rulesAdded.length > 0)
    parts.push(`Новые правила: ${rulesAdded.map((t) => `«${t}»`).join(', ')}.`);
  if (rulesRemoved.length > 0)
    parts.push(`Снимаются правила: ${rulesRemoved.map((t) => `«${t}»`).join(', ')}.`);

  let targets: PreviewStats['targets'];
  if (input.op.kind === 'goal' && input.targetsAfter) {
    targets = {
      kcalBefore: Math.round(base.targets.energyKcal),
      kcalAfter: Math.round(input.targetsAfter.energyKcal),
      proteinBefore: Math.round(base.targets.proteinG.target),
      proteinAfter: Math.round(input.targetsAfter.proteinG.target),
    };
    parts.push(
      `Калории в день: ${fmt(targets.kcalBefore)} → ${fmt(targets.kcalAfter)} ккал; белок: ${fmt(targets.proteinBefore)} → ${fmt(targets.proteinAfter)} г.`,
    );
  }
  if (input.op.kind === 'structure')
    parts.push(`Приёмы пищи: ${input.op.structure.map((m) => m.titleRu).join(', ')}.`);

  if (days.length === 0) parts.push('Меню от этого не изменится.');
  else {
    parts.push(`Изменятся дни: ${days.map((d) => d.weekday).join(', ')}.`);
    for (const d of days.slice(0, MAX_LISTED_DAYS)) {
      const swaps: string[] = [];
      if (d.removed.length > 0)
        swaps.push(
          `убираю ${d.removed
            .slice(0, 3)
            .map((n) => `«${n}»`)
            .join(', ')}`,
        );
      if (d.added.length > 0)
        swaps.push(
          `добавляю ${d.added
            .slice(0, 3)
            .map((n) => `«${n}»`)
            .join(', ')}`,
        );
      if (swaps.length > 0) parts.push(`${d.weekday}: ${swaps.join('; ')}.`);
    }
    if (days.length > MAX_LISTED_DAYS) parts.push('Остальное — в предпросмотре.');
  }
  let summaryRu = parts.join(' ');
  if (summaryRu.length > MAX_SUMMARY_CHARS)
    summaryRu = `${summaryRu.slice(0, MAX_SUMMARY_CHARS - 1)}…`;

  return {
    id: input.id,
    op: input.op,
    baseRevision: base.revision,
    plan,
    diff,
    summaryRu,
    stats: { changedDays: days.length, days, ...(targets ? { targets } : {}) },
    rulesAdded,
    rulesRemoved,
    ...(input.reasonRu ? { reasonRu: input.reasonRu } : {}),
  };
}
