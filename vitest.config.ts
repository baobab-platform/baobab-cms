import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/baobab/**/*.ts'],
      exclude: ['src/baobab/**/*.test.ts', 'src/baobab/**/index.ts'],
    },
  },
});
