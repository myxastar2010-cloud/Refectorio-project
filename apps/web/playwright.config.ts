import { defineConfig, devices } from '@playwright/test';

// E2E_PORT: another port when 4173 is busy with an older preview (it would be reused and test a stale build).
const PORT = Number(process.env.E2E_PORT ?? 4173);
const DESKTOP = { width: 1920, height: 1080 };

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A test that fails "sometimes" is a bug — fix the cause instead of retrying.
  retries: 0,
  // Every page renders a full-screen animated scene without a GPU: more parallel browsers only starve each other
  // (and the computer the tests run on is usually busy with other work too).
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  webServer: {
    // A test build (--mode test, dist-test): the same site plus the ?step= hook (features/quiz/flow/testStates.ts).
    command: `npm run build:test && npm run preview:test -- --port ${String(PORT)}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: DESKTOP,
        // CI only: the runner's own Chrome when Playwright's download service is down (ci.yml sets PW_CHANNEL).
        ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: DESKTOP } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: DESKTOP } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
});
