import { defineConfig } from 'vitest/config';

/**
 * Vitest config for evals-directory unit tests.
 *
 * Run via: npm run test:evals
 *
 * Note: evals/fixture.test.ts executes `node dist/cli.js`. The pretest:evals
 * npm script runs the build automatically before tests start.
 */
export default defineConfig({
  test: {
    include: ['evals/**/*.test.ts'],
  },
});
