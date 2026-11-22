import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.test.ts'],
    // Fuseau de la machine de test, modifiable (TEST_TZ) pour vérifier qu'on n'en dépend pas.
    env: { TZ: process.env.TEST_TZ ?? 'UTC' },
  },
});
