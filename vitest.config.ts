import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'nutrition-core',
          root: './packages/nutrition-core',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'web',
          root: './apps/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/nutrition-core/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'packages/nutrition-core/src/testing.ts',
        'apps/web/src/assets/generated/**',
      ],
      reporter: ['text-summary', 'html', 'json-summary'],
      // Safety-critical code: CI fails below these numbers (.claude/rules/testing.md).
      thresholds: {
        'packages/nutrition-core/src/**': { lines: 95, statements: 95, functions: 95 },
        'packages/nutrition-core/src/guardrails/**': { lines: 100, branches: 100, functions: 100 },
      },
    },
  },
});
