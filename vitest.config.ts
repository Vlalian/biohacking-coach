import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws when imported outside an RSC build; under Vitest it
      // is a no-op so tests can pull in server modules that guard themselves with
      // it (the Coach adapter). See src/test/server-only.stub.ts.
      'server-only': fileURLToPath(
        new URL('./src/test/server-only.stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
