import { defineConfig } from "vitest/config";

/**
 * Root vitest config — projects aggregator.
 *
 * Each project owns its own `vitest.config.ts` (environment, aliases,
 * setup files). `npm test` at root runs all projects.
 *
 * Filter a single project:
 *   npx vitest --project demo
 *   npx vitest --project core
 *   npx vitest --project react
 */
export default defineConfig({
  test: {
    projects: [
      "./apps/demo",
      "./packages/core",
      "./packages/react",
      "./packages/testkit",
      "./packages/copy",
      "./packages/adapters-google-places",
      "./packages/adapters-openai",
      "./packages/adapters-upstash",
      "./packages/adapters-memory",
    ],
  },
});
