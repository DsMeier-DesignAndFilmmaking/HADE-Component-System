import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: "core",
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
  resolve: {
    alias: {
      // Self-aliases so sub-path imports inside tests resolve to source.
      "@hade/core/adapters/defaults": path.resolve(
        __dirname,
        "./src/adapters/defaults/index.ts",
      ),
      "@hade/core/adapters/geo": path.resolve(__dirname, "./src/adapters/geo/index.ts"),
      "@hade/core/legacy": path.resolve(__dirname, "./src/legacy/index.ts"),
      "@hade/core/errors": path.resolve(__dirname, "./src/errors/HadeError.ts"),
      "@hade/core": path.resolve(__dirname, "./src/index.ts"),
    },
  },
});
