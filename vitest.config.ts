import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The forks pool evaluates Vitest twice under Vite 8, so describe() cannot see the runner.
    pool: 'vmForks',
    include: ['tests/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
