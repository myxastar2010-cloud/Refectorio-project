import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const DESKTOP = { width: 1920, height: 1080 };

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A test that fails "sometimes" is a bug — fix the cause instead of retrying.
  retries: 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: DESKTOP } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: DESKTOP } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: DESKTOP } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
});
