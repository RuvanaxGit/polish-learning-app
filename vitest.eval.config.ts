import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Live LLM evaluation (PAID). Kept out of vitest.config.ts so `pnpm test` and a
// bare `vitest` can never pick it up. Each stage additionally requires
// LLM_EVAL_LIVE=<stage> (tests/eval/config.ts). See tests/eval/README.md.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    name: 'eval-live',
    environment: 'node',
    include: ['tests/eval/live/**/*.live.ts'],
    fileParallelism: false,
    testTimeout: 60 * 60_000,
  },
});
