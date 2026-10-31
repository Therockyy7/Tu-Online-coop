import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared/src', import.meta.url)),
    },
  },
  test: {
    include: ['shared/tests/**/*.test.ts', 'server/tests/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
