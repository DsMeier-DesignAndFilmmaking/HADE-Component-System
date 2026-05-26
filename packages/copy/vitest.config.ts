import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "copy",
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
});
