import { defineConfig } from 'vitest/config';

/**
 * Vitest config for evals-directory unit tests.
 *
 * Run via: npm run test:evals
 *
 * Note: evals/fixture.test.ts executes `node dist/cli.js`, so `npm run build`
 * must precede `npm run test:evals` for that test to pass.
 */
export default defineConfig({
  test: {
    include: ['evals/**/*.test.ts'],
  },
});
