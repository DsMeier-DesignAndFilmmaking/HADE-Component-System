import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const CORE = path.resolve(ROOT, "./packages/core/src");

export default defineConfig({
  test: {
    name: "adapters-google-places",
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
  resolve: {
    alias: {
      // Sub-paths must come BEFORE the bare entry so the longest prefix wins.
      "@hade/core/adapters/defaults": path.resolve(CORE, "./adapters/defaults/index.ts"),
      "@hade/core/adapters/geo": path.resolve(CORE, "./adapters/geo/index.ts"),
      "@hade/core/legacy": path.resolve(CORE, "./legacy/index.ts"),
      "@hade/core/errors": path.resolve(CORE, "./errors/HadeError.ts"),
      "@hade/core": path.resolve(CORE, "./index.ts"),
    },
  },
});
