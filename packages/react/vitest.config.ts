import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

/**
 * @hade/react vitest config.
 *
 * Needs jsdom for @testing-library/react. Uses esbuild's built-in JSX
 * support — no @vitejs/plugin-react needed since we're only running tests
 * (not dev-mode Fast Refresh).
 *
 * Aliases @hade/core and @hade/testkit to TypeScript source so test failures
 * point at the real source line, not the compiled dist file.
 */
export default defineConfig({
  test: {
    name: "react",
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@hade/core": path.resolve(ROOT, "./packages/core/src/index.ts"),
      "@hade/testkit": path.resolve(ROOT, "./packages/testkit/src/index.ts"),
    },
  },
});
