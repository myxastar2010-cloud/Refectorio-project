import type { Strategy } from '../src/selection';
import { summarize, type Summary } from './metrics';
import { K_VALUES, STRATEGIES, type UserResult } from './simulate';

/** Aggregation, acceptance checks (ТЗ §9.5) and the report files of the simulation. */

export type MetricName = 'aucTrue' | 'aucAnswers' | 'ndcg10' | 'brier';
export const METRICS: readonly MetricName[] = ['aucTrue', 'aucAnswers', 'ndcg10', 'brier'];

export type Aggregate = Record<Strategy, Record<MetricName, Summary[]>> & {
  readonly oracleAucAnswers: Summary;
};

export function aggregate(results: readonly UserResult[]): Aggregate {
  const out = {} as Record<Strategy, Record<MetricName, Summary[]>>;
  for (const strategy of STRATEGIES) {
    const mine = results.filter((r) => r.strategy === strategy);
    const perMetric = {} as Record<MetricName, Summary[]>;
    for (const metric of METRICS) {
      perMetric[metric] = K_VALUES.map((_, k) => summarize(mine.map((r) => r[metric][k] ?? NaN)));
    }
    out[strategy] = perMetric;
  }
  const ours = results.filter((r) => r.strategy === 'ours');
  return Object.assign(out, { oracleAucAnswers: summarize(ours.map((r) => r.oracleAucAnswers)) });
}

const kIndex = (k: number) => K_VALUES.indexOf(k as (typeof K_VALUES)[number]);

export type Acceptance = {
  readonly auc10: number;
  readonly auc30: number;
  readonly normalisedGain: number;
  readonly beatsAll: boolean;
  /** Per baseline: ours' lower CI bound minus the baseline's upper CI bound at k = 10 (> 0 = no overlap). */
  readonly margins: Readonly<Record<Strategy, number>>;
  readonly passed: boolean;
};

export const ACCEPTANCE = { minAuc10: 0.7, minNormalisedGain: 0.9 } as const;
/** The baselines of ТЗ §9.5. */
export const BASELINES: readonly Strategy[] = ['random', 'popularity', 'coverage', 'uncertainty'];

export function acceptance(agg: Aggregate): Acceptance {
  const at = (strategy: Strategy, k: number) => agg[strategy].aucTrue[kIndex(k)];
  const ours10 = at('ours', 10);
  const ours30 = at('ours', 30);
  const auc10 = ours10?.mean ?? NaN;
  const auc30 = ours30?.mean ?? NaN;
  const normalisedGain = (auc10 - 0.5) / (auc30 - 0.5);
  const margins = {} as Record<Strategy, number>;
  for (const strategy of STRATEGIES) {
    if (strategy === 'ours') continue;
    margins[strategy] = (ours10?.low ?? NaN) - (at(strategy, 10)?.high ?? NaN);
  }
  margins.ours = 0;
  const beatsAll = BASELINES.every((s) => margins[s] > 0);
  return {
    auc10,
    auc30,
    normalisedGain,
    beatsAll,
    margins,
    passed:
      auc10 >= ACCEPTANCE.minAuc10 && normalisedGain >= ACCEPTANCE.minNormalisedGain && beatsAll,
  };
}

/**
 * Paired comparison at k = 10 (the same players, both strategies): mean and 95 % CI of the per-player AUC
 * difference. Reported next to the ТЗ criterion (unpaired, non-overlapping CIs), never instead of it.
 */
export function pairedDifference(
  results: readonly UserResult[],
  a: Strategy,
  b: Strategy,
  k = 10,
): Summary {
  const index = kIndex(k);
  const byUser = new Map<number, number>();
  for (const r of results) if (r.strategy === b) byUser.set(r.userId, r.aucTrue[index] ?? NaN);
  const diffs = results
    .filter((r) => r.strategy === a)
    .map((r) => (r.aucTrue[index] ?? NaN) - (byUser.get(r.userId) ?? NaN));
  return summarize(diffs);
}

export type SideStats = Record<
  Strategy,
  { readonly coverage10: Summary; readonly skipsTo10: Summary; readonly cardsTo10: Summary }
>;

export function sideStats(results: readonly UserResult[]): SideStats {
  const out = {} as SideStats;
  for (const strategy of STRATEGIES) {
    const mine = results.filter((r) => r.strategy === strategy);
    out[strategy] = {
      coverage10: summarize(mine.map((r) => r.coverage10)),
      skipsTo10: summarize(mine.map((r) => r.skipsTo10)),
      cardsTo10: summarize(mine.map((r) => r.cardsTo10)),
    };
  }
  return out;
}

// ── Report files ─────────────────────────────────────────────────────────────────────────────

export const STRATEGY_LABELS: Readonly<Record<Strategy, string>> = {
  ours: 'наш (BALD × P(ответ) + правила)',
  lookahead: 'просмотр каталога вперёд (проверенная альтернатива)',
  uncertainty: 'неопределённость',
  coverage: 'охват типов',
  popularity: 'популярность',
  random: 'случайный',
};

/** Fixed categorical order (dataviz reference palette, validated: worst adjacent CVD ΔE 9.1). */
const SERIES_COLORS: Readonly<Record<Strategy, string>> = {
  ours: '#2a78d6',
  lookahead: '#008300',
  uncertainty: '#eb6834',
  coverage: '#1baf7a',
  popularity: '#eda100',
  random: '#e87ba4',
};

const f3 = (value: number) => (Number.isFinite(value) ? value.toFixed(3) : '—');
const ci = (s: Summary | undefined) => (s ? `${f3(s.mean)} [${f3(s.low)}; ${f3(s.high)}]` : '—');

export function markdownTable(agg: Aggregate, metric: MetricName, ks: readonly number[]): string {
  const header = `| Стратегия | ${ks.map((k) => `k = ${k}`).join(' | ')} |`;
  const rule = `|---|${ks.map(() => '---').join('|')}|`;
  const rows = STRATEGIES.slice()
    .reverse()
    .map(
      (strategy) =>
        `| ${STRATEGY_LABELS[strategy]} | ${ks.map((k) => ci(agg[strategy][metric][kIndex(k)])).join(' | ')} |`,
    );
  return [header, rule, ...rows].join('\n');
}

/**
 * A static line chart (SVG) of a metric over k for every strategy: thin 2 px lines, recessive grid, direct labels at
 * the line ends plus a legend (identity never by colour alone), optional dashed reference line.
 */
export function lineChartSvg(input: {
  readonly title: string;
  readonly agg: Aggregate;
  readonly metric: MetricName;
  readonly yLabel: string;
  readonly yMin: number;
  readonly yMax: number;
  readonly reference?: { readonly value: number; readonly label: string };
}): string {
  const width = 860;
  const height = 480;
  const pad = { left: 64, right: 200, top: 56, bottom: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const kMax = K_VALUES[K_VALUES.length - 1] ?? 30;
  const x = (k: number) => pad.left + (k / kMax) * plotW;
  const y = (v: number) =>
    pad.top +
    plotH -
    ((Math.min(Math.max(v, input.yMin), input.yMax) - input.yMin) / (input.yMax - input.yMin)) *
      plotH;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">`,
    `<rect width="${width}" height="${height}" fill="#fcfcfb"/>`,
    `<text x="${pad.left}" y="28" font-size="17" font-weight="600" fill="#0b0b0b">${input.title}</text>`,
  );
  const ticks = 5;
  for (let t = 0; t <= ticks; t += 1) {
    const value = input.yMin + ((input.yMax - input.yMin) * t) / ticks;
    parts.push(
      `<line x1="${pad.left}" x2="${pad.left + plotW}" y1="${y(value)}" y2="${y(value)}" stroke="#e4e3df" stroke-width="1"/>`,
      `<text x="${pad.left - 8}" y="${y(value) + 4}" font-size="12" text-anchor="end" fill="#52514e">${value.toFixed(2)}</text>`,
    );
  }
  for (const k of [0, 5, 10, 15, 20, 25, 30]) {
    parts.push(
      `<text x="${x(k)}" y="${pad.top + plotH + 20}" font-size="12" text-anchor="middle" fill="#52514e">${k}</text>`,
    );
  }
  parts.push(
    `<line x1="${x(10)}" x2="${x(10)}" y1="${pad.top}" y2="${pad.top + plotH}" stroke="#a8a7a1" stroke-width="1" stroke-dasharray="3 4"/>`,
    `<text x="${x(10) + 6}" y="${pad.top + 14}" font-size="12" fill="#52514e">10 ответов</text>`,
    `<text x="${pad.left + plotW / 2}" y="${height - 14}" font-size="13" text-anchor="middle" fill="#52514e">решающих ответов (k)</text>`,
    `<text x="18" y="${pad.top + plotH / 2}" font-size="13" text-anchor="middle" fill="#52514e" transform="rotate(-90 18 ${pad.top + plotH / 2})">${input.yLabel}</text>`,
  );
  if (input.reference) {
    const ry = y(input.reference.value);
    parts.push(
      `<line x1="${pad.left}" x2="${pad.left + plotW}" y1="${ry}" y2="${ry}" stroke="#52514e" stroke-width="1.5" stroke-dasharray="6 5"/>`,
      `<text x="${pad.left + plotW + 8}" y="${ry + 4}" font-size="12" fill="#52514e">${input.reference.label}</text>`,
    );
  }
  // End labels, nudged apart so they never collide.
  const ends = STRATEGIES.map((strategy) => {
    const series = input.agg[strategy][input.metric];
    return { strategy, y: y(series[series.length - 1]?.mean ?? input.yMin) };
  }).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i += 1) {
    const previous = ends[i - 1];
    const current = ends[i];
    if (previous && current && current.y - previous.y < 16) current.y = previous.y + 16;
  }
  for (const strategy of STRATEGIES) {
    const series = input.agg[strategy][input.metric];
    const points = K_VALUES.map(
      (k, i) => `${x(k).toFixed(1)},${y(series[i]?.mean ?? NaN).toFixed(1)}`,
    );
    const emphasis = strategy === 'ours' ? 2.5 : 2;
    parts.push(
      `<polyline points="${points.join(' ')}" fill="none" stroke="${SERIES_COLORS[strategy]}" stroke-width="${emphasis}" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
    const end = ends.find((e) => e.strategy === strategy);
    const last = series[series.length - 1];
    if (end && last) {
      parts.push(
        `<circle cx="${x(kMax)}" cy="${y(last.mean)}" r="4" fill="${SERIES_COLORS[strategy]}" stroke="#fcfcfb" stroke-width="2"/>`,
        `<text x="${x(kMax) + 10}" y="${end.y + 4}" font-size="12" fill="#0b0b0b">${STRATEGY_LABELS[strategy]}</text>`,
      );
    }
  }
  parts.push('</svg>');
  return parts.join('\n');
}
