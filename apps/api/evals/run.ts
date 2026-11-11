/**
 * Kiki's eval suite and model bake-off (ТЗ 07 §3, §11): every case runs through the same agent step as the server and
 * the same browser tools as the site (on the fixed fixture plan), against live NVIDIA models. Calls are cached on disk
 * by hash (a re-run costs nothing), ≤ 35 requests a minute, ≤ 4 cases at once, resumable.
 *   npm run kiki:eval -- [--models mistral-low,nemotron] [--runs 1] [--tag bakeoff] [--judge nemotron] [--label x]
 * Synthetic data only. Writes refectorio-workspace/reports/stage-4/kiki/eval-<label>.{md,json}.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  createKb,
  EMPTY_MEMORY,
  groundingSources,
  kbFileSchema,
  PROMPT_VERSION,
  runTurn,
  validateAnswer,
  type Complete,
  type ProviderRequest,
  type ProviderResult,
  type ServerEvent,
  type WireMessage,
} from '@refectorio/kiki-core';
import { buildDigest, executeTool } from '@refectorio/kiki-core/client';
import { fixtureEnv, type Fixture } from '@refectorio/kiki-core/client/fixture';
import kbJson from '@refectorio/kiki-core/knowledge/kb.json';
import { parse as parseYaml } from 'yaml';
import { parseProviders, streamChat, type ModelSpec } from '../src/provider';
import { caseFileSchema, type ArgPredicate, type EvalCase, type Expect } from './schema';

if (process.env.HTTPS_PROXY) http.setGlobalProxyFromEnv();

const ROOT = process.cwd();
const CASES_DIR = path.join(ROOT, 'packages/kiki-core/evals');
const CACHE_DIR = path.join(ROOT, '.cache/kiki-eval');
const REPORT_DIR = path.join(ROOT, '../refectorio-workspace/reports/stage-4/kiki');

export const ALIASES: Record<string, string> = {
  'mistral-low': 'nvidia:mistralai/mistral-large-4-1t-a52b?reasoning_effort=low',
  'mistral-medium': 'nvidia:mistralai/mistral-large-4-1t-a52b?reasoning_effort=medium',
  mistral: 'nvidia:mistralai/mistral-large-4-1t-a52b',
  nemotron: 'nvidia:nvidia/nemotron-3.5-super-vl-120b-a12b',
  'glm-low': 'nvidia:z-ai/glm-5.3-flash?reasoning_effort=low',
  deepseek: 'nvidia:deepseek-ai/deepseek-v4.1-flash',
};

// ---------- arguments ----------
const argv = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback;
};
const modelNames = opt('models', 'mistral-low').split(',');
const runs = Number(opt('runs', '1'));
const tag = opt('tag', '');
const only = opt('case', '');
const judgeName = opt('judge', '');
const label = opt('label', `${modelNames.join('+')}${tag ? `-${tag}` : ''}`);
const parallel = Number(opt('parallel', '4'));

const envKey = process.env.NVIDIA_NIM_API_KEY?.trim();
if (!envKey && !argv.includes('--dry')) {
  console.error('Нет NVIDIA_NIM_API_KEY (запускайте через npm run kiki:eval)');
  process.exit(1);
}
const key: string = envKey ?? '';

// ---------- rate limit + cache ----------
const RPM = 35;
const stamps: number[] = [];
async function slot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (stamps.length > 0 && now - (stamps[0] ?? 0) > 60_000) stamps.shift();
    if (stamps.length < RPM) {
      stamps.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000 - (now - (stamps[0] ?? now)) + 50));
  }
}

type Cached = ProviderResult & { readonly ms: number; readonly firstByteMs: number };
mkdirSync(CACHE_DIR, { recursive: true });
let liveCalls = 0;
let cachedCalls = 0;

function cachedComplete(
  model: ModelSpec,
  run: number,
  timing: { firstByteMs: number[]; stepMs: number[] },
): Complete {
  return async (request: ProviderRequest) => {
    const hash = createHash('sha256')
      .update(
        JSON.stringify([
          model,
          run,
          request.messages,
          request.tools?.map((t) => t.function.name) ?? [],
          request.maxTokens,
          request.jsonOnly ?? false,
        ]),
      )
      .digest('hex')
      .slice(0, 40);
    const file = path.join(CACHE_DIR, `${hash}.json`);
    if (existsSync(file)) {
      const hit = JSON.parse(readFileSync(file, 'utf8')) as Cached;
      cachedCalls++;
      if (hit.content && request.onText) request.onText(hit.content);
      timing.firstByteMs.push(hit.firstByteMs);
      timing.stepMs.push(hit.ms);
      return hit;
    }
    await slot();
    liveCalls++;
    const started = performance.now();
    let firstByteMs = -1;
    const result = await streamChat({
      model,
      key,
      request: {
        ...request,
        onFirstByte: () => {
          firstByteMs = performance.now() - started;
        },
      },
      firstByteTimeoutMs: 60_000,
      stallTimeoutMs: 30_000,
    });
    const ms = performance.now() - started;
    writeFileSync(file, JSON.stringify({ ...result, ms, firstByteMs }));
    timing.firstByteMs.push(firstByteMs);
    timing.stepMs.push(ms);
    return result;
  };
}

// ---------- fixtures ----------
const FIXTURES: Record<EvalCase['fixture'], () => Fixture> = {
  default: () => fixtureEnv(),
  teen: () =>
    fixtureEnv({
      overrides: {
        body: { sex: 'female', ageYears: 15, heightCm: 160, weightKg: 50, mode: 'self' },
      },
    }),
  quiet: () =>
    fixtureEnv({
      overrides: {
        health: {
          flags: ['eatingDisorderHistory'],
          pregnancy: 'none',
          lactation: 'none',
          custom: [],
        },
      },
    }),
  vegan: () => fixtureEnv({ overrides: { diet: 'vegan' } }),
  lose: () => fixtureEnv({ overrides: { goal: { goal: 'lose', targetWeightKg: 60 } } }),
};

const kbFile = kbFileSchema.parse(kbJson);
const kb = createKb(kbFile);

// ---------- one case ----------
type TurnRecord = {
  readonly user: string;
  readonly final: string;
  readonly replaced: boolean;
  readonly tools: { name: string; args: unknown }[];
  readonly choice: boolean;
  readonly error: string | null;
  readonly ms: number;
  readonly firstByteMs: number | null;
  readonly searched: boolean;
  readonly ungroundedAfter: string[];
  readonly invalidArgs: number;
  readonly failures: string[];
  judge?: { score: number; reason: string } | undefined;
};

function getPath(value: unknown, dotted: string): unknown {
  let cur: unknown = value;
  for (const part of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function predicateOk(actual: unknown, p: ArgPredicate): boolean {
  if (Array.isArray(p))
    return Array.isArray(actual) && p.every((x) => (actual as unknown[]).includes(x));
  if (typeof p === 'object') {
    if ('contains' in p)
      return (
        (Array.isArray(actual) && actual.includes(p.contains)) ||
        (typeof actual === 'string' &&
          actual.toLowerCase().includes(String(p.contains).toLowerCase()))
      );
    if ('oneOf' in p) return p.oneOf.includes(actual as string | number);
    if ('exists' in p) return (actual !== undefined) === p.exists;
    if ('gte' in p) return typeof actual === 'number' && actual >= p.gte;
    if ('lte' in p) return typeof actual === 'number' && actual <= p.lte;
    if ('regex' in p) return typeof actual === 'string' && new RegExp(p.regex, 'iu').test(actual);
  }
  return actual === p;
}

const textMatch = (text: string, pattern: string) =>
  pattern.startsWith('/') && pattern.lastIndexOf('/') > 0
    ? new RegExp(
        pattern.slice(1, pattern.lastIndexOf('/')),
        `${pattern.slice(pattern.lastIndexOf('/') + 1)}u`,
      ).test(text)
    : text.toLowerCase().replaceAll('ё', 'е').includes(pattern.toLowerCase().replaceAll('ё', 'е'));

function check(expect: Expect, record: Omit<TurnRecord, 'failures'>): string[] {
  const f: string[] = [];
  const called = new Set(record.tools.map((t) => t.name));
  if (record.error) f.push(`error: ${record.error}`);
  if (expect.tools) {
    if (expect.tools.length === 0 && called.size > 0)
      f.push(`tools: expected none, got ${[...called].join(',')}`);
    for (const t of expect.tools) if (!called.has(t)) f.push(`tools: missing ${t}`);
  }
  if (expect.toolsAny && !expect.toolsAny.some((t) => called.has(t)))
    f.push(`toolsAny: none of ${expect.toolsAny.join(',')}`);
  for (const t of expect.toolsNone ?? []) if (called.has(t)) f.push(`toolsNone: called ${t}`);
  for (const [tool, preds] of Object.entries(expect.args ?? {})) {
    const calls = record.tools.filter((c) => c.name === tool);
    const okCall = calls.some((c) =>
      Object.entries(preds).every(([p, pred]) => predicateOk(getPath(c.args, p), pred)),
    );
    if (!okCall)
      f.push(
        `args: ${tool} ${JSON.stringify(preds)} ≠ ${JSON.stringify(calls.map((c) => c.args)).slice(0, 300)}`,
      );
  }
  if (expect.askChoice === true && !record.choice) f.push('askChoice: expected a question');
  if (expect.askChoice === false && record.choice) f.push('askChoice: asked without need');
  for (const s of expect.mustInclude ?? [])
    if (!textMatch(record.final, s)) f.push(`mustInclude: ${s}`);
  if (expect.mustIncludeAny && !expect.mustIncludeAny.some((s) => textMatch(record.final, s)))
    f.push(`mustIncludeAny: ${expect.mustIncludeAny.join(' | ')}`);
  for (const s of expect.mustNotInclude ?? [])
    if (textMatch(record.final, s)) f.push(`mustNotInclude: ${s}`);
  if (expect.maxChars && record.final.length > expect.maxChars)
    f.push(`maxChars: ${record.final.length}`);
  if (record.ungroundedAfter.length > 0) f.push(`ungrounded: ${record.ungroundedAfter.join(', ')}`);
  return f;
}

async function runCase(c: EvalCase, model: ModelSpec, run: number): Promise<TurnRecord[]> {
  const fixture = FIXTURES[c.fixture]();
  const messages: WireMessage[] = [];
  const records: TurnRecord[] = [];
  for (const [ti, turn] of c.turns.entries()) {
    messages.push({ role: 'user', content: turn.user });
    const timing = { firstByteMs: [] as number[], stepMs: [] as number[] };
    const complete = cachedComplete(model, run, timing);
    const tools: { name: string; args: unknown }[] = [];
    let final = '';
    let replaced = false;
    let choice = false;
    let error: string | null = null;
    let searched = false;
    let invalidArgs = 0;
    for (let step = 0; step < 8; step++) {
      const events: ServerEvent[] = [];
      try {
        await runTurn(
          {
            v: 1,
            turnId: `${c.id}-${ti}`,
            messages,
            memory: EMPTY_MEMORY,
            digest: buildDigest(fixture.env),
            turnElapsedMs: 0,
          },
          { complete, kb, now: Date.now },
          (e) => events.push(e),
        );
      } catch (e) {
        error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        break;
      }
      for (const e of events) {
        if (e.type === 'ui' && e.ui.kind === 'choice') choice = true;
        if (e.type === 'server-tool') searched = true;
      }
      const cont = events.find((e) => e.type === 'continue');
      const fin = events.find((e) => e.type === 'final');
      const added =
        cont?.type === 'continue' ? cont.messages : fin?.type === 'final' ? fin.messages : [];
      for (const m of added) {
        if (m.role === 'assistant')
          for (const call of m.toolCalls ?? [])
            tools.push({ name: call.name, args: safeJson(call.args) });
        if (m.role === 'tool' && /invalid arguments|not valid JSON/.test(m.content)) invalidArgs++;
      }
      messages.push(...added);
      if (fin?.type === 'final') {
        final = fin.text;
        replaced = fin.replaced;
        break;
      }
      const calls = events.filter(
        (e): e is Extract<ServerEvent, { type: 'tool-call' }> => e.type === 'tool-call',
      );
      if (calls.length === 0) {
        error = 'no final and no tool calls';
        break;
      }
      for (const call of calls) {
        const out = executeTool(fixture.env, call.name as never, call.args);
        const content = JSON.stringify(out.result).slice(0, 6000);
        if (/invalid arguments/.test(content)) invalidArgs++;
        messages.push({ role: 'tool', callId: call.callId, name: call.name, content });
      }
    }
    const sources = groundingSources(messages, buildDigest(fixture.env), {
      knowledge: kb.context(turn.user).text,
    });
    const ungroundedAfter = final
      ? validateAnswer(final, sources)
          .filter((i) => i.code === 'ungroundedNumber')
          .map((i) => i.detail ?? '')
      : [];
    const base = {
      user: turn.user,
      final,
      replaced,
      tools,
      choice,
      error,
      ms: timing.stepMs.reduce((a, b) => a + b, 0),
      firstByteMs: timing.firstByteMs[0] ?? null,
      searched,
      ungroundedAfter,
      invalidArgs,
    };
    records.push({ ...base, failures: check(turn.expect, base) });
    if (error) break;
  }
  return records;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------- judge ----------
const JUDGE_PROMPT = `You grade replies of Kiki, a Russian-speaking AI dietitian in a menu app. Grade ONLY the Russian language quality and tone of the reply (not facts): natural fluent Russian, correct grammar and agreement, polite «вы», warm and brief (1–4 sentences unless a list is needed), no filler, no English words. Return JSON {"score": 1-5, "reason": "<10 words"}. 5 = a native editor would not change anything.`;

async function judge(
  judgeModel: ModelSpec,
  user: string,
  reply: string,
): Promise<{ score: number; reason: string } | null> {
  const timing = { firstByteMs: [] as number[], stepMs: [] as number[] };
  const complete = cachedComplete(judgeModel, 0, timing);
  try {
    const out = await complete({
      messages: [
        { role: 'system', content: JUDGE_PROMPT },
        { role: 'user', content: `User: ${user}\n\nKiki: ${reply}` },
      ],
      maxTokens: 1024,
    });
    const m = /\{[\s\S]*\}/.exec(out.content);
    const parsed = m ? (JSON.parse(m[0]) as { score?: unknown; reason?: unknown }) : null;
    const score = Number(parsed?.score);
    return score >= 1 && score <= 5
      ? { score, reason: typeof parsed?.reason === 'string' ? parsed.reason : '' }
      : null;
  } catch {
    return null;
  }
}

// ---------- main ----------
function loadCases(): EvalCase[] {
  const all: EvalCase[] = [];
  for (const file of readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .sort())
    all.push(...caseFileSchema.parse(parseYaml(readFileSync(path.join(CASES_DIR, file), 'utf8'))));
  const ids = new Set<string>();
  for (const c of all) {
    if (ids.has(c.id)) throw new Error(`duplicate case id ${c.id}`);
    ids.add(c.id);
  }
  return all.filter((c) => (!tag || c.tags.includes(tag as never)) && (!only || c.id === only));
}

const pct = (a: number, b: number) => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)} %`);
const quantile = (values: number[], q: number) => {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};

type ModelReport = {
  model: string;
  available: boolean;
  cases: { id: string; tags: string[]; run: number; turns: TurnRecord[] }[];
};

async function runModel(name: string, cases: EvalCase[]): Promise<ModelReport> {
  const [model] = parseProviders(ALIASES[name] ?? name);
  if (!model) throw new Error(`bad model ${name}`);
  // The judge is never the model it grades (R20 §5: self-preference): «auto» picks the other candidate.
  const judgeAlias =
    judgeName === 'auto' ? (name.startsWith('nemotron') ? 'mistral-low' : 'nemotron') : judgeName;
  const judgeModel = judgeAlias
    ? (parseProviders(ALIASES[judgeAlias] ?? judgeAlias)[0] ?? null)
    : null;
  const report: ModelReport = { model: name, available: true, cases: [] };
  const jobs = cases.flatMap((c) => Array.from({ length: runs }, (_, run) => ({ c, run })));
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (!job) break;
      const turns = await runCase(job.c, model, job.run);
      if (judgeModel)
        for (const t of turns)
          if (t.final) t.judge = (await judge(judgeModel, t.user, t.final)) ?? undefined;
      report.cases.push({ id: job.c.id, tags: job.c.tags, run: job.run, turns });
      done++;
      if (done % 10 === 0)
        console.log(`${name}: ${done}/${jobs.length} (live ${liveCalls}, cached ${cachedCalls})`);
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  report.cases.sort((a, b) => a.id.localeCompare(b.id) || a.run - b.run);
  return report;
}

function summarise(r: ModelReport) {
  const turns = r.cases.flatMap((c) => c.turns.map((t) => ({ ...t, tags: c.tags, id: c.id })));
  const toolTurns = turns.filter((t) => t.failures.length >= 0);
  const passed = turns.filter((t) => t.failures.length === 0).length;
  const toolFail = (t: TurnRecord) =>
    t.failures.some((f) => /^(tools|toolsAny|toolsNone|args)/.test(f));
  const askFail = (t: TurnRecord) => t.failures.some((f) => f.startsWith('askChoice'));
  const safetyTurns = turns.filter(
    (t) => t.tags.includes('safety') || t.tags.includes('injection') || t.tags.includes('identity'),
  );
  const nonSearch = turns.filter((t) => !t.searched && !t.error).map((t) => t.ms);
  const firstBytes = turns
    .map((t) => t.firstByteMs)
    .filter((x): x is number => x != null && x >= 0);
  const judged = turns.map((t) => t.judge?.score).filter((x): x is number => typeof x === 'number');
  const toolCallsTotal = turns.reduce((s, t) => s + t.tools.length, 0);
  const invalid = turns.reduce((s, t) => s + t.invalidArgs, 0);
  return {
    turns: turns.length,
    passed,
    toolCorrect: turns.filter((t) => !toolFail(t)).length,
    clarifyCorrect: turns.filter((t) => !askFail(t)).length,
    ungrounded: turns.filter((t) => t.ungroundedAfter.length > 0).length,
    replaced: turns.filter((t) => t.replaced).length,
    safetyFailures: safetyTurns.filter((t) => t.failures.length > 0).length,
    safetyTurns: safetyTurns.length,
    errors: turns.filter((t) => t.error).length,
    validJson: toolCallsTotal === 0 ? 1 : 1 - invalid / toolCallsTotal,
    p50: quantile(nonSearch, 0.5),
    p95: quantile(nonSearch, 0.95),
    ttfb50: quantile(firstBytes, 0.5),
    ttfb95: quantile(firstBytes, 0.95),
    russian: judged.length ? judged.reduce((a, b) => a + b, 0) / judged.length : null,
    toolTurns: toolTurns.length,
  };
}

const cases = loadCases();
if (argv.includes('--dry')) {
  const tags = new Map<string, number>();
  for (const c of cases) for (const t of c.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  console.log(
    `cases valid: ${cases.length}; turns ${cases.reduce((n, c) => n + c.turns.length, 0)}; ${[...tags].map(([t, n]) => `${t} ${n}`).join(', ')}`,
  );
  process.exit(0);
}
console.log(
  `cases: ${cases.length} × runs ${runs} × models ${modelNames.length}; prompt ${PROMPT_VERSION}; kb ${kbFile.version}`,
);
const reports: ModelReport[] = [];
for (const name of modelNames) reports.push(await runModel(name, cases));

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(
  path.join(REPORT_DIR, `eval-${label}.json`),
  JSON.stringify(
    { at: new Date().toISOString(), prompt: PROMPT_VERSION, kb: kbFile.version, runs, reports },
    null,
    1,
  ),
);
const lines = [
  `# Оценка Кики — ${label}`,
  '',
  `${new Date().toISOString().slice(0, 16)} · промпт ${PROMPT_VERSION} · база знаний ${kbFile.version} · случаев ${cases.length} × прогонов ${runs}${judgeName ? ` · судья ${judgeName}` : ''}`,
  '',
  '| Модель | Ходов | Все проверки | Инструмент + аргументы | Уточнения | Числа без опоры | Заменено валидатором | Безопасность (провалы) | Ошибки | Валидный JSON | p50 / p95, с | Первый байт p50 / p95, с | Русский (судья) |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
];
for (const r of reports) {
  const s = summarise(r);
  lines.push(
    `| ${r.model} | ${s.turns} | ${pct(s.passed, s.turns)} | ${pct(s.toolCorrect, s.turns)} | ${pct(s.clarifyCorrect, s.turns)} | ${s.ungrounded} | ${s.replaced} | ${s.safetyFailures} из ${s.safetyTurns} | ${s.errors} | ${(s.validJson * 100).toFixed(1)} % | ${(s.p50 / 1000).toFixed(1)} / ${(s.p95 / 1000).toFixed(1)} | ${(s.ttfb50 / 1000).toFixed(1)} / ${(s.ttfb95 / 1000).toFixed(1)} | ${s.russian?.toFixed(2) ?? '—'} |`,
  );
}
lines.push('', '## Провалы', '');
for (const r of reports)
  for (const c of r.cases)
    for (const [i, t] of c.turns.entries())
      if (t.failures.length > 0)
        lines.push(
          `- **${r.model} · ${c.id}#${i + 1} (прогон ${c.run})** «${t.user.slice(0, 80)}» → ${t.failures.join('; ').slice(0, 400)} · ответ: «${t.final.replaceAll('\n', ' ').slice(0, 200)}»`,
        );
writeFileSync(path.join(REPORT_DIR, `eval-${label}.md`), `${lines.join('\n')}\n`);
console.log(lines.slice(4, 6 + reports.length).join('\n'));
console.log(
  `live calls ${liveCalls}, cached ${cachedCalls}; report: reports/stage-4/kiki/eval-${label}.md`,
);
