import { defineConfig } from 'vitest/config';

const nodePackage = (name: string) => ({
  test: {
    name,
    root: `./packages/${name}`,
    include: ['src/**/*.test.ts', 'sim/**/*.test.ts', 'data/**/*.test.ts'],
    environment: 'node' as const,
  },
});

export default defineConfig({
  test: {
    projects: [
      nodePackage('nutrition-core'),
      nodePackage('contracts'),
      nodePackage('taste-core'),
      {
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
        'apps/web/src/**/*.{ts,tsx}',
      ],
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
        // Stage 2: the quiz mappings are new safety-relevant code (ТЗ §10: 100 % branches).
        'packages/nutrition-core/src/{activity,weight,input}.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
        },
        'packages/contracts/src/**': { lines: 100, branches: 100, functions: 100 },
      },
    },
  },
});
