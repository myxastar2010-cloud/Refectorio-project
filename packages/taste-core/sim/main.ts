import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import path from 'node:path';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import catalogJson from '../data/catalog.json';
import photoRuntimeJson from '../data/photo-runtime.json';
import { catalogSchema } from '../src/catalog';
import { prepareCatalog } from '../src/engine';
import { DEFAULT_PRIOR, type PriorConfig } from '../src/model';
import type { Strategy } from '../src/selection';
import {
  acceptance,
  aggregate,
  BASELINES,
  pairedDifference,
  lineChartSvg,
  markdownTable,
  sideStats,
  STRATEGY_LABELS,
} from './aggregate';
import { ARCHETYPE_SHARES, createPopulation, type NoiseLevel } from './generative';
import { simulateUser, STRATEGIES, type UserResult } from './simulate';

/**
 * The full simulation (ТЗ §9.5): `npm run sim -w @refectorio/taste-core -- --users 5000 --out <dir>`.
 * Bundled by sim/run.mjs (rolldown) and run on all CPU cores with worker threads.
 */

type Job = {
  readonly from: number;
  readonly to: number;
  readonly users: number;
  readonly seed: number;
  readonly prior: PriorConfig;
  readonly strategies: readonly Strategy[];
  readonly noise: NoiseLevel;
  /** Dishes never offered (--hide-photoless: the site's game hides dishes without a photo). */
  readonly hidden: readonly string[];
};

/** Experiments: --prior '{"sdScale":1.5,"groupScale":0,"meanScale":1}' scales the default prior. */
function priorFrom(spec: string | undefined): PriorConfig {
  if (!spec) return DEFAULT_PRIOR;
  const s = JSON.parse(spec) as {
    sdScale?: number;
    groupScale?: number;
    meanScale?: number;
    traitSd?: number;
  };
  return {
    ...DEFAULT_PRIOR,
    means: Object.fromEntries(
      Object.entries(DEFAULT_PRIOR.means).map(([k, v]) => [k, v * (s.meanScale ?? 1)]),
    ),
    sds: Object.fromEntries(
      Object.entries(DEFAULT_PRIOR.sds).map(([k, v]) => [
        k,
        k.startsWith('trait:') && s.traitSd !== undefined ? s.traitSd : v * (s.sdScale ?? 1),
      ]),
    ),
    groups: DEFAULT_PRIOR.groups.map((g) => ({ ...g, sd: g.sd * (s.groupScale ?? 1) })),
  };
}

function runJob(job: Job): UserResult[] {
  const prepared = prepareCatalog(catalogSchema.parse(catalogJson), job.prior);
  const population = createPopulation(prepared.dishes, job.users, job.seed, job.noise);
  const hidden = new Set(
    job.hidden.flatMap((dishId) => {
      const index = prepared.indexOf.get(dishId);
      return index === undefined ? [] : [index];
    }),
  );
  const results: UserResult[] = [];
  for (let id = job.from; id < job.to; id += 1) {
    const user = population[id];
    if (!user) continue;
    for (const strategy of job.strategies) {
      results.push(simulateUser(prepared, user, strategy, job.seed, hidden));
    }
  }
  return results;
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function main() {
  const users = Number(argument('users', '5000'));
  const seed = Number(argument('seed', '20261009'));
  const out = path.resolve(argument('out', 'sim-results'));
  const prior = priorFrom(process.argv.includes('--prior') ? argument('prior', '') : undefined);
  const strategies = (
    process.argv.includes('--strategies') ? argument('strategies', '').split(',') : STRATEGIES
  ) as Strategy[];
  const threads = Math.max(1, Math.min(cpus().length - 2, 16));
  const withPhoto = new Set(Object.keys(photoRuntimeJson.photos));
  const hidden = process.argv.includes('--hide-photoless')
    ? catalogSchema
        .parse(catalogJson)
        .dishes.map((dish) => dish.id)
        .filter((dishId) => !withPhoto.has(dishId))
    : [];
  const started = performance.now();
  const chunk = Math.ceil(users / threads);
  const jobs: Job[] = Array.from({ length: threads }, (_, i) => ({
    from: i * chunk,
    to: Math.min(users, (i + 1) * chunk),
    users,
    seed,
    prior,
    strategies,
    noise: argument('noise', 'base') as NoiseLevel,
    hidden,
  })).filter((job) => job.from < job.to);
  const parts = await Promise.all(
    jobs.map(
      (job) =>
        new Promise<UserResult[]>((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), { workerData: job });
          worker.once('message', (data: UserResult[]) => {
            resolve(data);
          });
          worker.once('error', reject);
        }),
    ),
  );
  const results = parts.flat();
  const agg = aggregate(results);
  const verdict = acceptance(agg);
  const side = sideStats(results);
  const subsets = {
    noisy: aggregate(results.filter((r) => r.noisy)),
    skipHeavy: aggregate(results.filter((r) => r.skipHeavy)),
  };
  const subsetVerdicts = {
    noisy: acceptance(subsets.noisy),
    skipHeavy: acceptance(subsets.skipHeavy),
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        users,
        seed,
        archetypeShares: ARCHETYPE_SHARES,
        verdict,
        subsetVerdicts,
        agg,
        side,
        subsets,
      },
      null,
      1,
    ),
  );
  const oracle = agg.oracleAucAnswers.mean;
  writeFileSync(
    path.join(out, 'auc-true.svg'),
    lineChartSvg({
      title: `AUC на неизвестных блюдах (истинные вкусы), ${users} игроков`,
      agg,
      metric: 'aucTrue',
      yLabel: 'AUC',
      yMin: 0.5,
      yMax: 1,
    }),
  );
  writeFileSync(
    path.join(out, 'auc-answers.svg'),
    lineChartSvg({
      title: 'AUC против ответов, которые игрок дал бы (с шумом)',
      agg,
      metric: 'aucAnswers',
      yLabel: 'AUC',
      yMin: 0.5,
      yMax: 1,
      reference: { value: oracle, label: `потолок ${oracle.toFixed(3)}` },
    }),
  );
  writeFileSync(
    path.join(out, 'ndcg10.svg'),
    lineChartSvg({
      title: 'NDCG@10 предсказанных «нравится»',
      agg,
      metric: 'ndcg10',
      yLabel: 'NDCG@10',
      yMin: 0.4,
      yMax: 1,
    }),
  );
  writeFileSync(
    path.join(out, 'brier.svg'),
    lineChartSvg({
      title: 'Brier (меньше — лучше)',
      agg,
      metric: 'brier',
      yLabel: 'Brier',
      yMin: 0.12,
      yMax: 0.26,
    }),
  );
  const ks = [0, 1, 3, 5, 10, 15, 20, 30];
  const sideRows = STRATEGIES.slice()
    .reverse()
    .map((s) => {
      const v = side[s];
      return `| ${STRATEGY_LABELS[s]} | ${v.coverage10.mean.toFixed(2)} | ${v.skipsTo10.mean.toFixed(2)} | ${v.cardsTo10.mean.toFixed(2)} |`;
    });
  const margins = STRATEGIES.filter((s) => s !== 'ours')
    .filter((s) => BASELINES.includes(s))
    .map((s) => `${STRATEGY_LABELS[s]}: ${verdict.margins[s].toFixed(4)}`)
    .join('; ');
  const report = [
    `# Симуляция «10 ответов достаточно» — ${users} игроков, seed ${seed}`,
    '',
    `Время: ${((performance.now() - started) / 1000).toFixed(1)} с, потоков: ${threads}.`,
    ...(hidden.length > 0
      ? [
          '',
          `Скрыто блюд без фото (как в игре на сайте): ${hidden.length} — их не показывают, но метрики считаются и на них.`,
        ]
      : []),
    '',
    '## Приёмка (ТЗ §9.5)',
    '',
    `- AUC₁₀ = **${verdict.auc10.toFixed(3)}** (цель ≥ 0,70), AUC₃₀ = ${verdict.auc30.toFixed(3)}`,
    `- Нормированный прирост (AUC₁₀ − 0,5) / (AUC₃₀ − 0,5) = **${verdict.normalisedGain.toFixed(3)}** (цель ≥ 0,9)`,
    `- Наша стратегия лучше всех базовых с непересекающимися 95 % ДИ: **${verdict.beatsAll ? 'да' : 'нет'}** (зазор: ${margins})`,
    `- Итог: **${verdict.passed ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}**`,
    `- Шумные игроки (${subsets.noisy.ours.aucTrue[0]?.n ?? 0}): AUC₁₀ ${subsetVerdicts.noisy.auc10.toFixed(3)}, прирост ${subsetVerdicts.noisy.normalisedGain.toFixed(3)}, лучше всех: ${subsetVerdicts.noisy.beatsAll ? 'да' : 'нет'}`,
    `- Много пропусков (${subsets.skipHeavy.ours.aucTrue[0]?.n ?? 0}): AUC₁₀ ${subsetVerdicts.skipHeavy.auc10.toFixed(3)}, прирост ${subsetVerdicts.skipHeavy.normalisedGain.toFixed(3)}, лучше всех: ${subsetVerdicts.skipHeavy.beatsAll ? 'да' : 'нет'}`,
    `- Потолок (AUC истинной полезности против ответов с шумом): ${oracle.toFixed(3)}`,
    `- Парное сравнение на k = 10 (те же игроки, разница AUC «наш − базовый», 95 % ДИ; дополнительно к критерию ТЗ): ${BASELINES.map(
      (b) => {
        const d = pairedDifference(results, 'ours', b);
        return `${STRATEGY_LABELS[b]} ${d.mean.toFixed(4)} [${d.low.toFixed(4)}; ${d.high.toFixed(4)}]`;
      },
    ).join('; ')}`,
    '',
    '## AUC на неизвестных блюдах (истинные вкусы), среднее [95 % ДИ]',
    '',
    markdownTable(agg, 'aucTrue', ks),
    '',
    '## AUC против ответов игрока (с шумом)',
    '',
    markdownTable(agg, 'aucAnswers', ks),
    '',
    '## NDCG@10',
    '',
    markdownTable(agg, 'ndcg10', ks),
    '',
    '## Brier',
    '',
    markdownTable(agg, 'brier', ks),
    '',
    '## Охват и пропуски (до 10 решающих ответов)',
    '',
    '| Стратегия | типов блюд среди 10 | пропусков | карточек |',
    '|---|---|---|---|',
    ...sideRows,
    '',
  ].join('\n');
  writeFileSync(path.join(out, 'summary.md'), report);
  console.log(report.split('\n').slice(0, 14).join('\n'));
}

if (isMainThread) {
  void main();
} else {
  parentPort?.postMessage(runJob(workerData as Job));
}
