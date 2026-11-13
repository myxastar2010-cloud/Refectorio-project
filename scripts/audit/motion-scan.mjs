/* global document, window, requestAnimationFrame, MutationObserver */
// Motion scan (stage 5, phase 0.4 §2): scripted scene transitions, hover waves, sheets, Kiki states, the finale's
// reveal, the quiz's dish cards and the widgets' count-up, on the team laptop's window (1536×730 @ 1.25) at 1× and 4×
// CPU, plus a reduced-motion pass. Per step: frames (fps, p95, > 33 ms), long tasks > 50 ms, layouts and style recalcs
// (CDP metrics), forced layouts inside script (CDP trace, 1× only), animated properties that are not composited
// (WAAPI keyframes + inline-style diffs), and what still moves under prefers-reduced-motion.
// Headed by default: frame timing only means something with the real GPU (see the team-laptop note in the journal).
// Needs a served build: preview_start web-preview (4180).
//   node scripts/audit/motion-scan.mjs [--url http://localhost:4180/] [--scenarios landing,menu] [--headless] [--out <dir>]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { menuStates, scriptKiki, openKiki, ask } from '../lib/menu-states.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4180/' },
    out: {
      type: 'string',
      default: path.join(
        ROOT,
        '..',
        'refectorio-workspace',
        'reports',
        'stage-5',
        'audit',
        'motion',
      ),
    },
    scenarios: { type: 'string', default: '' },
    headless: { type: 'boolean', default: false },
  },
});

const COMPOSITED = new Set([
  'transform',
  'opacity',
  'translate',
  'scale',
  'rotate',
  'filter',
  'offset',
  'composite',
  'easing',
  'computedOffset',
  'clipPath',
  'clip-path',
  'will-change',
]);

// ---------- in the page ----------
function install() {
  const m = { frames: [], long: [], styles: {}, waapi: {}, last: performance.now(), on: false };
  window.__m = m;
  const tick = (t) => {
    if (m.on) m.frames.push(t - m.last);
    m.last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      if (m.on) for (const e of list.getEntries()) m.long.push(Math.round(e.duration));
    }).observe({ type: 'longtask' });
  } catch {
    /* no long tasks here */
  }
  const parse = (text) =>
    Object.fromEntries(
      (text ?? '')
        .split(';')
        .map((d) => d.split(':'))
        .filter((p) => p.length >= 2)
        .map(([k, ...v]) => [k.trim(), v.join(':').trim()]),
    );
  new MutationObserver((records) => {
    if (!m.on) return;
    for (const r of records) {
      const before = parse(r.oldValue);
      const after = parse(r.target.getAttribute('style'));
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
        if (before[key] !== after[key]) m.styles[key] = (m.styles[key] ?? 0) + 1;
    }
  }).observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['style'],
    attributeOldValue: true,
  });
  m.sample = () => {
    for (const a of document.getAnimations()) {
      const effect = a.effect;
      if (!effect?.getKeyframes) continue;
      const timing = effect.getComputedTiming?.() ?? {};
      for (const frame of effect.getKeyframes())
        for (const key of Object.keys(frame)) {
          const entry = (m.waapi[key] ??= { count: 0, maxMs: 0 });
          entry.count += 1;
          const d = Number(timing.duration);
          if (Number.isFinite(d)) entry.maxMs = Math.max(entry.maxMs, Math.round(d));
        }
    }
  };
  m.timer = setInterval(() => m.on && m.sample(), 100);
}
function startStep() {
  const m = window.__m;
  Object.assign(m, {
    frames: [],
    long: [],
    styles: {},
    waapi: {},
    on: true,
    last: performance.now(),
  });
}
function stopStep() {
  const m = window.__m;
  m.on = false;
  const frames = m.frames.filter((f) => f > 0).sort((a, b) => a - b);
  const total = frames.reduce((s, f) => s + f, 0);
  return {
    frames: frames.length,
    fps: total > 0 ? Math.round((frames.length / total) * 1000) : null,
    p95Ms: frames.length ? Math.round(frames[Math.floor(frames.length * 0.95)] * 10) / 10 : null,
    over33: frames.filter((f) => f > 33.4).length,
    long: { count: m.long.length, maxMs: Math.max(0, ...m.long) },
    styles: m.styles,
    waapi: Object.fromEntries(
      Object.entries(m.waapi).filter(
        ([k]) => k !== 'offset' && k !== 'easing' && k !== 'composite' && k !== 'computedOffset',
      ),
    ),
  };
}

// ---------- scenarios ----------
const hash = (page, h) => page.evaluate((v) => (window.location.hash = v), h);
const sceneSettled = (page, name) =>
  page.waitForFunction(
    (expected) => {
      const el = document.querySelector('.page');
      return el?.dataset.scene === expected && !el.hasAttribute('data-busy');
    },
    name,
    { timeout: 20_000 },
  );
const STATES = menuStates(path.join(args.out, 'downloads'));
const SCENARIOS = {
  landing: {
    query: '',
    ready: (page) => sceneSettled(page, 'hero'),
    steps: [
      ['hero idle (food drift)', (page) => page.waitForTimeout(2500)],
      [
        'hover CTA (wave + tilt)',
        async (page) => {
          const cta = page.locator('.cta').first();
          const box = await cta.boundingBox();
          if (box) await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 4 });
          if (box)
            await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 12 });
        },
      ],
      [
        'hover feature cards',
        async (page) => {
          for (const card of (await page.locator('.feature-card').all()).slice(0, 3))
            await card.hover();
        },
      ],
      [
        'hero → discover',
        async (page) => {
          await hash(page, '#discover');
          await sceneSettled(page, 'discover');
        },
      ],
      ['discover idle', (page) => page.waitForTimeout(2000)],
      [
        'discover → about',
        async (page) => {
          await hash(page, '#about');
          await sceneSettled(page, 'about');
        },
      ],
      [
        'about → pricing',
        async (page) => {
          await hash(page, '#pricing');
          await sceneSettled(page, 'pricing');
        },
      ],
      [
        'pricing → hero',
        async (page) => {
          await hash(page, '');
          await sceneSettled(page, 'hero');
        },
      ],
    ],
  },
  quiz: {
    query: '?seed=11#quiz',
    ready: (page) =>
      page.waitForFunction(
        () => document.querySelector('section.quiz')?.dataset.screen === 'taste',
        null,
        { timeout: 20_000 },
      ),
    steps: [
      ['dish card like (fly)', (page) => page.keyboard.press('KeyD')],
      ['dish card dislike', (page) => page.keyboard.press('KeyA')],
      ['dish card skip', (page) => page.keyboard.press('KeyS')],
    ],
  },
  reveal: {
    query: '?seed=11&step=finale&reveal=demo#quiz',
    ready: (page) =>
      page.waitForFunction(
        () => document.querySelector('section.quiz')?.dataset.screen === 'finale',
        null,
        { timeout: 20_000 },
      ),
    steps: [['finale reveal (4 s)', (page) => page.waitForTimeout(4000)]],
  },
  menu: {
    query: '?menu=demo#menu',
    ready: (page) =>
      page.getByRole('heading', { name: 'Моё меню на неделю:' }).waitFor({ timeout: 30_000 }),
    steps: [
      [
        'mark eaten (widget count-up)',
        (page) =>
          page
            .getByRole('button', { name: /^Отметить «.+» съеденным$/ })
            .first()
            .click(),
      ],
      [
        'day tab',
        (page) => page.getByRole('tablist', { name: 'Дни недели' }).getByRole('tab').nth(2).click(),
      ],
      ['meal tab', (page) => page.locator('.meal-tabs .meal-tab').nth(1).click()],
      ['dish details open (sheet)', (page) => page.locator('.dish-row .dish-open').first().click()],
      ['details tab', (page) => page.getByRole('tab', { name: 'Состав' }).click()],
      ['details close', (page) => page.keyboard.press('Escape')],
      ['dish ⋯ menu', (page) => page.locator('.dish-card').nth(1).locator('.dish-more').click()],
      ['menu close', (page) => page.keyboard.press('Escape')],
      ['goal sheet', (page) => STATES.goal(page)],
      ['goal close', (page) => page.keyboard.press('Escape')],
      ['news popover', (page) => STATES.news(page)],
      ['news close', (page) => page.keyboard.press('Escape')],
    ],
  },
  kiki: {
    query: '?menu=demo#menu',
    ready: (page) =>
      page.getByRole('heading', { name: 'Моё меню на неделю:' }).waitFor({ timeout: 30_000 }),
    steps: [
      [
        'kiki open',
        async (page) => {
          await scriptKiki(page, ['hang']);
          await openKiki(page);
        },
      ],
      [
        'kiki thinking (dots, 2.5 s)',
        async (page) => {
          await ask(page, 'Что у меня сегодня на ужин?');
          await page.waitForTimeout(2500);
        },
      ],
    ],
  },
};

// ---------- trace: layouts forced inside script ----------
function forcedLayouts(events) {
  const js = new Map();
  const layouts = [];
  const open = new Map();
  for (const e of events) {
    const isJs = [
      'FunctionCall',
      'EvaluateScript',
      'FireAnimationFrame',
      'TimerFire',
      'EventDispatch',
      'v8.callFunction',
    ].includes(e.name);
    if (e.name === 'Layout' || e.name === 'UpdateLayoutTree') {
      if (e.ph === 'X')
        layouts.push({
          tid: e.tid,
          ts: e.ts,
          end: e.ts + (e.dur ?? 0),
          name: e.name,
          dur: e.dur ?? 0,
        });
      else if (e.ph === 'B') open.set(`${e.tid}:${e.name}`, e.ts);
      else if (e.ph === 'E' && open.has(`${e.tid}:${e.name}`)) {
        const ts = open.get(`${e.tid}:${e.name}`);
        layouts.push({ tid: e.tid, ts, end: e.ts, name: e.name, dur: e.ts - ts });
      }
    } else if (isJs && e.ph === 'X') {
      if (!js.has(e.tid)) js.set(e.tid, []);
      js.get(e.tid).push([e.ts, e.ts + (e.dur ?? 0)]);
    }
  }
  const forced = layouts.filter((l) =>
    (js.get(l.tid) ?? []).some(([a, b]) => l.ts >= a && l.end <= b),
  );
  return {
    layouts: layouts.filter((l) => l.name === 'Layout').length,
    forced: forced.filter((l) => l.name === 'Layout').length,
    forcedStyle: forced.filter((l) => l.name === 'UpdateLayoutTree').length,
    forcedMs: Math.round(forced.reduce((s, l) => s + l.dur, 0) / 1000),
  };
}

async function runScenario(browser, name, scenario, { rate, reduced, trace }) {
  const context = await browser.newContext({
    viewport: { width: 1536, height: 730 },
    deviceScaleFactor: 1.25,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  await context.route('**/api/health', (r) => r.fulfill({ json: { ok: true } }));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const result = { scenario: name, rate, reduced, steps: [] };
  try {
    await page.goto(new URL(scenario.query, args.url).href);
    await scenario.ready(page);
    await page.waitForTimeout(1200);
    await page.evaluate(install);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const chunks = [];
    if (trace) {
      cdp.on('Tracing.dataCollected', (e) => chunks.push(...e.value));
      await cdp.send('Tracing.start', {
        categories: 'devtools.timeline,disabled-by-default-devtools.timeline',
        transferMode: 'ReportEvents',
      });
    }
    for (const [label, action] of scenario.steps) {
      const before = Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]),
      );
      await page.evaluate(startStep);
      let error;
      try {
        await action(page);
      } catch (e) {
        error = String(e.message).split(/\r?\n/)[0].slice(0, 140);
      }
      await page.waitForTimeout(1100);
      const step = await page.evaluate(stopStep);
      const after = Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]),
      );
      const nonComposited = [
        ...new Set([...Object.keys(step.styles), ...Object.keys(step.waapi)]),
      ].filter((k) => !COMPOSITED.has(k) && !k.startsWith('--'));
      result.steps.push({
        label,
        ...step,
        layouts: Math.round(after.LayoutCount - before.LayoutCount),
        recalcs: Math.round(after.RecalcStyleCount - before.RecalcStyleCount),
        layoutMs: Math.round((after.LayoutDuration - before.LayoutDuration) * 1000),
        nonComposited,
        ...(reduced && {
          movesUnderReduced:
            Object.keys(step.waapi).some((k) =>
              ['transform', 'translate', 'scale', 'rotate'].includes(k),
            ) ||
            Object.keys(step.styles).some((k) =>
              ['transform', 'translate', 'scale', 'rotate'].includes(k),
            ),
        }),
        ...(error && { error }),
      });
    }
    if (trace) {
      const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      await done;
      result.trace = forcedLayouts(chunks);
    }
  } catch (e) {
    result.error = String(e.message).split(/\r?\n/)[0].slice(0, 200);
  }
  await context.close();
  return result;
}

await mkdir(args.out, { recursive: true });
const browser = await chromium.launch({
  headless: args.headless,
  args: ['--window-size=1560,860'],
});
const wanted = new Set(args.scenarios.split(',').filter(Boolean));
const results = [];
for (const [name, scenario] of Object.entries(SCENARIOS)) {
  if (wanted.size && !wanted.has(name)) continue;
  results.push(
    await runScenario(browser, name, scenario, { rate: 1, reduced: false, trace: true }),
  );
  results.push(
    await runScenario(browser, name, scenario, { rate: 4, reduced: false, trace: false }),
  );
  results.push(
    await runScenario(browser, name, scenario, { rate: 1, reduced: true, trace: false }),
  );
}
await browser.close();
await writeFile(
  path.join(args.out, 'motion.json'),
  JSON.stringify({ at: new Date().toISOString(), headless: args.headless, results }, null, 1),
);
for (const r of results) {
  const tag = `${r.scenario} ×${r.rate}${r.reduced ? ' reduced' : ''}`;
  if (r.error) console.log(`${tag}: ERROR ${r.error}`);
  const bad = r.steps.filter(
    (s) =>
      s.over33 > 2 || s.long.count > 0 || s.nonComposited.length || s.movesUnderReduced || s.error,
  );
  console.log(
    `${tag}: ${r.steps.length} steps, flagged ${bad.length}${r.trace ? ` · forced layouts ${r.trace.forced} (${r.trace.forcedMs} ms)` : ''}`,
  );
}
