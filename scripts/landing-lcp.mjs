/* global document */
// The landing's LCP on a phone over slow 4G, measured in the browser under real throttling (DevTools protocol: 1.6 Mbit/s,
// 150 ms, CPU 4×): Lighthouse's simulation swings by half a second with the order of tasks in its trace.
//   node scripts/landing-lcp.mjs [--url http://localhost:4180/] [--runs 3]
import { parseArgs } from 'node:util';
import { chromium, devices } from '@playwright/test';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    runs: { type: 'string', default: '3' },
  },
});

const browser = await chromium.launch();
const results = [];
for (let run = 0; run < Number(args.runs); run += 1) {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const state = { lcp: 0, element: '', shifts: 0 };
    Object.assign(globalThis, { __vitals: state });
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      state.lcp = last.renderTime || last.loadTime;
      state.element = last.element?.className || last.element?.tagName || '';
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) state.shifts += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(args.url, { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  const vitals = await page.evaluate(() => {
    const paint = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      ...globalThis.__vitals,
      fcp: paint ? Math.round(paint.startTime) : null,
      girl: document.querySelector('.hero-girl-art')?.dataset.girl,
    };
  });
  results.push({
    lcp: Math.round(vitals.lcp),
    fcp: vitals.fcp,
    cls: Math.round(vitals.shifts * 1000) / 1000,
    element: vitals.element,
    girl: vitals.girl,
  });
  await context.close();
}
await browser.close();
for (const result of results) console.log(JSON.stringify(result));
