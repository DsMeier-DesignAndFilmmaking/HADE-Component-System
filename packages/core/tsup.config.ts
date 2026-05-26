import { defineConfig } from "tsup";

/**
 * tsup config for @hade/core.
 *
 * Multi-entry build: one file per public sub-path export. Each entry produces
 * its own ESM + CJS + .d.ts pair, so consumers `import` exactly what they use
 * and unused sub-paths are tree-shaken at the package boundary (not just at
 * the file boundary inside index).
 *
 * `splitting: false` keeps every entry self-contained — no shared chunks under
 * `dist/_chunks/`, which would break sub-path exports in Node CJS consumers.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "createHade": "src/createHade.ts",
    "scoring/surfacedPenalty": "src/scoring/surfacedPenalty.ts",
    "scoring/confidence": "src/scoring/confidence.ts",
    "util/format": "src/util/format.ts",
    "engine/fallbackSelection": "src/engine/fallbackSelection.ts",
    "engine/buildOutput": "src/engine/buildOutput.ts",
    "explanation/explanation": "src/explanation/explanation.ts",
    "errors/index": "src/errors/HadeError.ts",
    "adapters/geo/index": "src/adapters/geo/index.ts",
    "adapters/defaults/index": "src/adapters/defaults/index.ts",
    "adapters/registry": "src/adapters/registry.ts",
    "legacy/index": "src/legacy/index.ts",
    "config/index": "src/config/loadConfig.ts",
    "config/schema": "src/config/schema.ts",
    "config/defaults": "src/config/defaults.ts",
    "config/migrations": "src/config/migrations.ts",
    "config/hash": "src/config/hash.ts",
    "config/validateConfig": "src/config/validateConfig.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: "es2022",
  tsconfig: "./tsconfig.build.json",
});
