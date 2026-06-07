import { defineConfig } from 'vitest/config';

// Pure-core tests: run in Node, no app plugins/PWA loaded.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
