/* global document, getComputedStyle, window, SVGElement */
// Layout scan of every scene and state × the devices matrix (stage 5, phase 0.4 §1): page scroll sideways, text that
// overflows or is cut, overlapping text and controls, controls off the window or covered by another layer, small tap
// targets, text under the flying food, layout shift and console errors. Writes compact JSON rows
// {route, device, kind, selector, rect, detail} and downscaled screenshots for reviewers.
// Needs a served build: preview_start web-preview (4180) or `npm run preview`.
//   node scripts/audit/layout-scan.mjs [--url http://localhost:4180/] [--routes hero,menu:base] [--windows laptop-1536]
//                                      [--jobs 4] [--out <dir>]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { WINDOWS, menuStates } from '../lib/menu-states.mjs';

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
        'layout',
      ),
    },
    routes: { type: 'string', default: '' },
    windows: { type: 'string', default: '' },
    jobs: { type: 'string', default: '4' },
    shots: { type: 'string', default: 'laptop-1536,phone-390' },
  },
});

const FOREIGN = /kaspersky-labs\.com/i;
const SHOT_KINDS = new Set([
  'page-hscroll',
  'overlap',
  'off-viewport',
  'clipped-text',
  'text-overflow',
]);

// ---------- routes: the landing's scenes, the quiz's steps, the menu app's states ----------
const sceneReady = (name) => async (page) => {
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector('.page');
      return (
        el?.hasAttribute('data-ready') &&
        el.dataset.scene === expected &&
        !el.hasAttribute('data-busy')
      );
    },
    name,
    { timeout: 30_000 },
  );
};
const quizReady = (screen) => async (page) => {
  await page.waitForFunction(
    (expected) => document.querySelector('section.quiz')?.dataset.screen === expected,
    screen,
    { timeout: 30_000 },
  );
};
const LANDING = [
  ['hero', '?freeze=1&seed=3', sceneReady('hero')],
  ['discover', '?freeze=1&seed=3#discover', sceneReady('discover')],
  ['about', '?freeze=1&seed=3#about', sceneReady('about')],
  ['pricing', '?freeze=1&seed=3#pricing', sceneReady('pricing')],
  ['quiz-taste', '?seed=11#quiz', quizReady('taste')],
  ...['body', 'goal', 'extraGoals', 'allergens', 'adjustments', 'notes'].map((step) => [
    `quiz-${step}`,
    `?seed=11&step=${step}#quiz`,
    quizReady(step),
  ]),
  ['quiz-finale', '?seed=11&step=finale&demo#quiz', quizReady('finale')],
  ['quiz-reveal', '?seed=11&step=finale&reveal=demo#quiz', quizReady('finale')],
].map(([name, query, ready]) => ({ name, query, ready, run: null }));

const MENU_STATES = menuStates(path.join(args.out, 'downloads'));
const menuReady = async (page) => {
  await page.getByRole('heading', { name: 'Моё меню на неделю:' }).waitFor({ timeout: 30_000 });
};
const MENU = Object.entries(MENU_STATES)
  .filter(([name]) => name !== 'downloads')
  .map(([name, run]) => ({
    name: `menu:${name}`,
    query: '?menu=demo#menu',
    ready: menuReady,
    run,
  }));

// ---------- the scan, in the page ----------
function scanPage({ touch }) {
  const rows = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const doc = document.documentElement;
  const round = (b) => [b.left, b.top, b.width, b.height].map((v) => Math.round(v));
  const label = (el) => {
    const own = (node) => {
      const cls =
        typeof node.className === 'string' ? node.className.trim().split(/\s+/).slice(0, 2) : [];
      return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${cls.length && cls[0] ? `.${cls.join('.')}` : ''}`;
    };
    const parent = el.parentElement?.closest('[class]');
    return `${parent && parent !== document.body ? `${own(parent)} > ` : ''}${own(el)}`;
  };
  const text = (el) =>
    (el.getAttribute('aria-label') ?? el.textContent ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
  const push = (kind, el, detail, box) =>
    rows.push({
      kind,
      selector: el ? label(el) : 'html',
      rect: box ? round(box) : el ? round(el.getBoundingClientRect()) : null,
      detail,
    });

  const shown = (el) =>
    el.checkVisibility?.({
      opacityProperty: true,
      visibilityProperty: true,
      contentVisibilityAuto: true,
    }) ?? true;
  const decorative = (el) => el.closest('[aria-hidden="true"], [inert], .food-layer') !== null;
  const INTERACTIVE =
    'a[href], button, input, select, textarea, summary, [role="button"], [role="tab"], [role="link"], [role="menuitem"], [role="menuitemradio"], [role="option"], [role="radio"], [role="checkbox"], [role="switch"], [role="slider"], [role="spinbutton"], [tabindex]:not([tabindex="-1"])';
  const directText = (el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  const inkBox = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const boxes = [...range.getClientRects()].filter((b) => b.width > 0 && b.height > 0);
    if (!boxes.length) return el.getBoundingClientRect();
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    const right = Math.max(...boxes.map((b) => b.right));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };
  const inView = (b) => b.right > 0 && b.bottom > 0 && b.left < vw && b.top < vh;
  const scrollsX = (el) => {
    const ox = getComputedStyle(el).overflowX;
    return (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  };
  const clippedByAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.clipPath !== 'none')
        return p;
    }
    return null;
  };
  const layered = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === 'fixed' || pos === 'sticky') return p;
    }
    return null;
  };

  // 1. The page scrolls sideways — and who pushes it.
  if (doc.scrollWidth > doc.clientWidth + 1) {
    push('page-hscroll', null, `${doc.scrollWidth} > ${doc.clientWidth}`);
    let n = 0;
    for (const el of document.body.querySelectorAll('*')) {
      if (n >= 5) break;
      if (el instanceof SVGElement && el.ownerSVGElement) continue;
      const b = el.getBoundingClientRect();
      if (b.right > doc.clientWidth + 1 && b.width > 0 && !clippedByAncestor(el)) {
        push('hscroll-cause', el, `right ${Math.round(b.right)}`);
        n += 1;
      }
    }
  }

  const elements = [...document.body.querySelectorAll('*')].filter((el) => {
    if (el instanceof SVGElement || !shown(el) || decorative(el)) return false;
    const b = el.getBoundingClientRect();
    return b.width * b.height > 4;
  });
  const interactive = elements.filter((el) => el.matches(INTERACTIVE));
  const textLeaves = elements.filter((el) => directText(el));

  // 2–3. Text that overflows its box or is cut / ellipsized.
  for (const el of textLeaves) {
    const cs = getComputedStyle(el);
    if (cs.display === 'inline' || cs.display === 'contents') continue;
    const overX = el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0;
    const overY = el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0;
    const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
    if (cs.overflowX === 'visible' && overX)
      push('text-overflow', el, `x ${el.scrollWidth}/${el.clientWidth} «${text(el)}»`);
    else if (
      cs.overflowY === 'visible' &&
      overY &&
      cs.height !== 'auto' &&
      !/^\d+px$/.test(cs.maxHeight) &&
      Number.parseFloat(cs.height) > 0
    ) {
      // A fixed-height box whose text runs below it.
      if (el.scrollHeight - el.clientHeight > 4)
        push('text-overflow', el, `y ${el.scrollHeight}/${el.clientHeight} «${text(el)}»`);
    } else if (
      (overX && cs.overflowX !== 'visible') ||
      (overY &&
        cs.overflowY !== 'visible' &&
        !scrollsX(el) &&
        cs.overflowY !== 'auto' &&
        cs.overflowY !== 'scroll')
    ) {
      const ellipsis = cs.textOverflow === 'ellipsis' || clamp;
      push(ellipsis ? 'ellipsis' : 'clipped-text', el, `${overX ? 'x' : 'y'} «${text(el)}»`);
    }
  }

  // 4. Overlapping text and controls (ink boxes for text).
  const boxes = [...new Set([...interactive, ...textLeaves])]
    .map((el) => ({ el, b: el.matches(INTERACTIVE) ? el.getBoundingClientRect() : inkBox(el) }))
    .filter(({ b }) => b.width > 1 && b.height > 1 && inView(b));
  let overlaps = 0;
  for (let i = 0; i < boxes.length && overlaps < 25; i += 1) {
    for (let j = i + 1; j < boxes.length && overlaps < 25; j += 1) {
      const a = boxes[i];
      const c = boxes[j];
      if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
      const aHit = a.el.matches(INTERACTIVE);
      const cHit = c.el.matches(INTERACTIVE);
      if (!aHit && !cHit && a.el.parentElement === c.el.parentElement) continue;
      const w = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left);
      const h = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
      if (w <= 1 || h <= 1) continue;
      const smaller = Math.min(a.b.width * a.b.height, c.b.width * c.b.height);
      if (w * h < 0.15 * smaller) continue;
      // Text under a stretched hit area (a whole card is one button) is that pattern, not a collision.
      if (aHit !== cHit && w * h >= 0.95 * (aHit ? c.b.width * c.b.height : a.b.width * a.b.height))
        continue;
      // A layer above (sheet, header, popover) over page content is reported as covering, not as an overlap.
      const la = layered(a.el);
      const lc = layered(c.el);
      const kind = la !== lc ? 'covered-by-layer' : 'overlap';
      push(
        kind,
        a.el,
        `with ${label(c.el)} «${text(c.el)}» ${Math.round(w)}×${Math.round(h)}`,
        a.b,
      );
      overlaps += 1;
    }
  }

  // 5–7. Controls off the window, covered at their centre, too small to tap.
  for (const el of interactive) {
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    const clip = clippedByAncestor(el);
    let scrollerX = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement)
      if (scrollsX(p)) scrollerX = true;
    const outX = b.left < -1 || b.right > vw + 1;
    const fixed = layered(el) && getComputedStyle(layered(el)).position === 'fixed';
    let scrollerY = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1)
        scrollerY = true;
    }
    const outY = fixed && !scrollerY && (b.top < -1 || b.bottom > vh + 1);
    if ((outX && !scrollerX && !clip) || outY) push('off-viewport', el, `«${text(el)}»`);
    if (!inView(b)) continue;
    const cx = Math.min(vw - 1, Math.max(0, b.left + b.width / 2));
    const cy = Math.min(vh - 1, Math.max(0, b.top + b.height / 2));
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== el && !el.contains(top) && !top.contains(el) && !decorative(top))
      push('covered', el, `by ${label(top)} «${text(el)}»`);
    const small = Math.min(b.width, b.height);
    const inlineLink = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
    if (!inlineLink && ((touch && small < 44) || (!touch && small < 24)))
      push('tap-small', el, `${Math.round(b.width)}×${Math.round(b.height)} «${text(el)}»`);
  }

  // 8. Text and controls under the flying food (the food is decorative, but a dish over a word reads as a bug).
  const food = [...document.querySelectorAll('.food-plane > *')]
    .map((el) => el.getBoundingClientRect())
    .filter((b) => b.width > 0 && inView(b));
  let under = 0;
  for (const { el, b } of boxes) {
    if (under >= 10) break;
    const hit = food.find((f) => {
      const w = Math.min(f.right, b.right) - Math.max(f.left, b.left);
      const h = Math.min(f.bottom, b.bottom) - Math.max(f.top, b.top);
      return w > 4 && h > 4 && w * h > 0.2 * b.width * b.height;
    });
    if (hit) {
      push('under-food', el, `«${text(el)}»`, b);
      under += 1;
    }
  }

  // 9. Spacing: the distinct gaps and paddings in use (px), for the reviewer's rhythm check.
  const spacing = new Map();
  for (const el of elements) {
    const cs = getComputedStyle(el);
    for (const v of [cs.paddingTop, cs.paddingLeft, cs.rowGap, cs.columnGap]) {
      const px = Number.parseFloat(v);
      if (Number.isFinite(px) && px > 0)
        spacing.set(Math.round(px * 2) / 2, (spacing.get(Math.round(px * 2) / 2) ?? 0) + 1);
    }
  }
  return {
    rows,
    spacing: [...spacing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
    cls: Math.round((window.__cls ?? 0) * 1000) / 1000,
  };
}

// ---------- runner ----------
const wantedRoutes = new Set(args.routes.split(',').filter(Boolean));
const wantedWindows = new Set(args.windows.split(',').filter(Boolean));
const shotWindows = new Set(args.shots.split(',').filter(Boolean));
const routes = [...LANDING, ...MENU].filter((r) => !wantedRoutes.size || wantedRoutes.has(r.name));
const windows = WINDOWS.filter(([name]) => !wantedWindows.size || wantedWindows.has(name));
const jobs = windows.flatMap((w) => routes.map((r) => ({ route: r, window: w })));

await mkdir(path.join(args.out, 'shots'), { recursive: true });
const browser = await chromium.launch();
const allRows = [];
const runs = [];

async function runJob({ route, window: [device, width, height, touch] }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    hasTouch: touch,
    isMobile: touch && width < 768,
  });
  await context.addInitScript(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (!entry.hadRecentInput) window.__cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* no layout-shift entries in this browser */
    }
  });
  // A local preview has no Kiki server: its health check answers 502. States that need Kiki script their own.
  await context.route('**/api/health', (r) => r.fulfill({ json: { ok: true } }));
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !FOREIGN.test(m.text()) && !FOREIGN.test(m.location().url))
      errors.push(`${m.text().slice(0, 120)} @ ${m.location().url.slice(0, 90)}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
  let failed = null;
  let result = { rows: [], spacing: [], cls: null };
  try {
    await page.goto(new URL(route.query, args.url).href);
    await route.ready(page);
    await page.waitForTimeout(500);
    if (route.run) await route.run(page, touch);
    await page.waitForTimeout(700);
  } catch (error) {
    failed = String(error).split('\n')[0].slice(0, 200);
  }
  try {
    result = await page.evaluate(scanPage, { touch });
  } catch (error) {
    failed ??= `scan: ${String(error).slice(0, 160)}`;
  }
  for (const row of result.rows) allRows.push({ route: route.name, device, ...row });
  for (const e of errors)
    allRows.push({
      route: route.name,
      device,
      kind: 'console-error',
      selector: null,
      rect: null,
      detail: e,
    });
  if (result.cls !== null && result.cls > 0.05)
    allRows.push({
      route: route.name,
      device,
      kind: 'cls',
      selector: null,
      rect: null,
      detail: String(result.cls),
    });
  const worthShot = shotWindows.has(device) || result.rows.some((r) => SHOT_KINDS.has(r.kind));
  let file = null;
  if (worthShot) {
    file = `${route.name.replace(':', '-')}--${device}.jpg`;
    try {
      await sharp(await page.screenshot())
        .resize({ width: Math.min(1280, width), withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(path.join(args.out, 'shots', file));
    } catch {
      file = null;
    }
  }
  runs.push({
    route: route.name,
    device,
    failed,
    cls: result.cls,
    rows: result.rows.length,
    errors: errors.length,
    shot: file,
    spacing: device === 'laptop-1536' ? result.spacing : undefined,
  });
  await context.close();
}

const queue = [...jobs];
const workers = Array.from({ length: Math.max(1, Number(args.jobs)) }, async () => {
  while (queue.length) await runJob(queue.shift());
});
await Promise.all(workers);
await browser.close();

const byKind = {};
for (const r of allRows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
const byRoute = {};
for (const r of allRows) {
  const key = `${r.route} · ${r.kind}`;
  byRoute[key] = (byRoute[key] ?? 0) + 1;
}
await writeFile(path.join(args.out, 'rows.json'), JSON.stringify(allRows));
await writeFile(path.join(args.out, 'runs.json'), JSON.stringify(runs, null, 1));
await writeFile(
  path.join(args.out, 'summary.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      runs: runs.length,
      failed: runs.filter((r) => r.failed).map((r) => `${r.route} ${r.device}: ${r.failed}`),
      byKind,
      byRoute,
    },
    null,
    1,
  ),
);
console.log(
  `runs ${runs.length} · failed ${runs.filter((r) => r.failed).length} · rows ${allRows.length}`,
);
console.log(JSON.stringify(byKind));
