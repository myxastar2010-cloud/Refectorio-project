import { defineConfig } from 'vitest/config';

const nodePackage = (name: string, testTimeout?: number) => ({
  test: {
    name,
    root: `./packages/${name}`,
    include: ['src/**/*.test.ts', 'sim/**/*.test.ts', 'data/**/*.test.ts'],
    environment: 'node' as const,
    ...(testTimeout ? { testTimeout } : {}),
  },
});
/**
 * Tests that plan a whole week (generate, re-plan, a proposal's preview) take 0,3–0,7 s here but several times that
 * under CI's coverage instrumentation: the 5 s default failed a goal-change preview on 11.11. Speed has its own checks
 * (menu-core budgets, e2e), so a timeout here only guards against hangs.
 */
const PLANNING_TIMEOUT_MS = 30_000;

export default defineConfig({
  test: {
    projects: [
      nodePackage('nutrition-core'),
      nodePackage('contracts'),
      nodePackage('taste-core'),
      nodePackage('food-data'),
      nodePackage('menu-core', PLANNING_TIMEOUT_MS),
      nodePackage('kiki-core', PLANNING_TIMEOUT_MS),
      {
        // The build flag of vite.config.ts (ADR 0011): unit tests see the default build.
        define: {
          __PHOTO_HOSTING__: JSON.stringify('self'),
          __TEST_HOOKS__: 'true',
          __API_ORIGIN__: JSON.stringify(''),
        },
        test: {
          name: 'web',
          root: './apps/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'node',
          // CSS is replaced by empty strings in tests by default; tokens.test.ts reads the tokens file as text.
          css: { include: [/styles\/tokens\.css/] },
        },
      },
      {
        test: {
          name: 'api',
          root: './apps/api',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'scripts',
          root: './scripts',
          include: ['**/*.test.mjs'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/nutrition-core/src/**/*.ts',
        'packages/contracts/src/**/*.ts',
        'packages/taste-core/src/**/*.ts',
        'packages/food-data/src/**/*.ts',
        'packages/menu-core/src/**/*.ts',
        'packages/kiki-core/src/**/*.ts',
        'apps/api/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'packages/nutrition-core/src/testing.ts',
        'packages/menu-core/src/testing.ts',
        'apps/web/src/assets/generated/**',
      ],
      reporter: ['text-summary', 'html', 'json-summary'],
      // Safety-critical code: CI fails below these numbers (.claude/rules/testing.md).
      thresholds: {
        'packages/nutrition-core/src/**': { lines: 95, statements: 95, functions: 95 },
        'packages/nutrition-core/src/guardrails/**': { lines: 100, branches: 100, functions: 100 },
        // Stage 2: the quiz mappings are new safety-relevant code (ТЗ §10: 100 % branches).
        'packages/nutrition-core/src/{activity,weight,input}.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
        },
        'packages/contracts/src/**': { lines: 100, branches: 100, functions: 100 },
        // Stage 4 (ТЗ фаза 3 §10): the menu engine.
        'packages/menu-core/src/**': { lines: 90, statements: 90, functions: 90 },
      },
    },
  },
});
