import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Repo root is two levels up from apps/demo/.
const ROOT = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react()],
  test: {
    name: "demo",
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/.claude/**"],
    setupFiles: ["./src/lib/hade/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Alias @hade/core sub-paths to TS source for fast iteration (no rebuild
      // between source edits and re-runs). Resolved from repo root so the
      // paths stay sane regardless of where vitest is invoked from.
      "@hade/core/adapters/defaults": path.resolve(
        ROOT,
        "./packages/core/src/adapters/defaults/index.ts",
      ),
      "@hade/core/adapters/geo": path.resolve(
        ROOT,
        "./packages/core/src/adapters/geo/index.ts",
      ),
      "@hade/core/legacy": path.resolve(ROOT, "./packages/core/src/legacy/index.ts"),
      "@hade/core/errors": path.resolve(ROOT, "./packages/core/src/errors/HadeError.ts"),
      "@hade/core": path.resolve(ROOT, "./packages/core/src/index.ts"),
      // server-only throws outside server context; stub it for tests.
      "server-only": path.resolve(__dirname, "./src/__mocks__/server-only.ts"),
    },
  },
});
