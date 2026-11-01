/* global document, requestAnimationFrame, window */
// Smoothness of part 1 on the team's laptop profile, in a real headed Chrome at a real 125 % scale: the food's frames with
// the video playing against the same page with the video off (the still only). Writes JSON, needs the built site served.
//   node scripts/girl-perf.mjs [--url http://localhost:4180/] [--out <file>] [--seconds 12]
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    out: {
      type: 'string',
      default: path.join(
        ROOT,
        '..',
        'refectorio-workspace',
        'reports',
        'stage-4',
        'girl-perf.json',
      ),
    },
    seconds: { type: 'string', default: '12' },
  },
});

/** In the page: rAF intervals and long tasks over the given time, after a settling pause. */
function record(seconds) {
  return new Promise((resolve) => {
    const intervals = [];
    const longTasks = [];
    let observer = null;
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(Math.round(entry.duration));
      });
      observer.observe({ entryTypes: ['longtask'] });
    }
    const start = performance.now();
    let last = start;
    const frame = (now) => {
      intervals.push(now - last);
      last = now;
      if (now - start < seconds * 1000) requestAnimationFrame(frame);
      else {
        observer?.disconnect();
        resolve({ intervals, longTasks });
      }
    };
    requestAnimationFrame(frame);
  });
}

function summary({ intervals, longTasks }) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const at = (share) => sorted[Math.floor(sorted.length * share)];
  const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  // A dropped frame: more than 1.5 refresh periods of the median.
  const refresh = at(0.5);
  return {
    frames: intervals.length,
    fps: Math.round(1000 / mean),
    medianMs: Math.round(refresh * 10) / 10,
    p95Ms: Math.round(at(0.95) * 10) / 10,
    p99Ms: Math.round(at(0.99) * 10) / 10,
    worstMs: Math.round(sorted.at(-1) * 10) / 10,
    droppedShare:
      Math.round((intervals.filter((v) => v > refresh * 1.5).length / intervals.length) * 1000) /
      1000,
    longTasks,
  };
}

const seconds = Number(args.seconds);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--force-device-scale-factor=1.25', '--window-size=1536,830'],
});
const report = {};
for (const [name, query, throttle] of [
  ['video', './?', 1],
  ['still', './?freeze-video=1', 1],
  ['video-4x-cpu', './?', 4],
]) {
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  await page.goto(new URL(query, args.url).href);
  await page.waitForSelector('.page[data-ready]');
  if (name === 'still') {
    await page.evaluate(() => {
      document.querySelector('.hero-girl video')?.pause();
    });
  }
  if (throttle > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => ({
    window: [window.innerWidth, window.innerHeight],
    ratio: window.devicePixelRatio,
    girl: document.querySelector('.hero-girl-art')?.dataset.girl,
    videoPaused: document.querySelector('.hero-girl video')?.paused,
    source: document.querySelector('.hero-girl video')?.currentSrc.split('/').pop(),
  }));
  const data = await page.evaluate(record, seconds);
  report[name] = { ...state, ...summary(data) };
  console.log(name.padEnd(14), JSON.stringify(report[name]));
  await context.close();
}
await browser.close();
await writeFile(args.out, `${JSON.stringify(report, null, 1)}\n`);
