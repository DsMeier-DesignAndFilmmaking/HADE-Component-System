#!/usr/bin/env node
// scripts/audit-package-purity.mjs
//
// Phase 9 — unforgiving boundary guard. Walks packages/**/src/**/*.{ts,tsx}
// and rejects any import line that reaches into apps/ or uses the demo's
// "@/" alias.
//
// ESLint covers the same patterns but can be silenced with
// "// eslint-disable-next-line". This script is regex grep — no escape hatch.
//
// Exits non-zero on first hit with file:line: <offending import>.
// Wired into `sdk:ci` after `sdk:audit:core-purity`.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PACKAGES_DIR = join(ROOT, "packages");

// Match `import ... from "X"` and `import "X"` and `export ... from "X"` and
// `require("X")`. Capture the module specifier in group 1.
const IMPORT_RE =
  /^\s*(?:import\s+[\s\S]*?from\s+|import\s+|export\s+[\s\S]*?from\s+|require\(\s*)["']([^"']+)["']/m;

const FORBIDDEN_PATTERNS = [
  { name: "@/ demo alias", test: (s) => s.startsWith("@/") || s === "@" },
  { name: "apps/ relative path", test: (s) => /\/apps\//.test(s) || s.startsWith("apps/") },
  { name: "apps/demo absolute", test: (s) => s.includes("apps/demo") },
];

async function* walkTsFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules + dist + __tests__ (tests are allowed to set up
      // arbitrary fixtures; only ship-path code is audited).
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "__tests__"
      ) {
        continue;
      }
      yield* walkTsFiles(full);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

async function checkFile(file) {
  const text = await readFile(file, "utf8");
  const lines = text.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments cheaply (handles // and most block comments).
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    const match = IMPORT_RE.exec(line);
    if (!match) continue;
    const spec = match[1];
    for (const forbid of FORBIDDEN_PATTERNS) {
      if (forbid.test(spec)) {
        hits.push({ line: i + 1, spec, reason: forbid.name });
      }
    }
  }
  return hits;
}

async function main() {
  let entries;
  try {
    entries = await readdir(PACKAGES_DIR, { withFileTypes: true });
  } catch {
    console.error(`error: packages directory not found at ${PACKAGES_DIR}`);
    process.exit(1);
  }
  const packageDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => join(PACKAGES_DIR, e.name, "src"));

  let totalHits = 0;
  let totalFiles = 0;

  for (const srcDir of packageDirs) {
    try {
      await stat(srcDir);
    } catch {
      continue;
    }
    for await (const file of walkTsFiles(srcDir)) {
      totalFiles++;
      const hits = await checkFile(file);
      for (const hit of hits) {
        totalHits++;
        const rel = relative(ROOT, file);
        console.error(
          `❌ ${rel}:${hit.line}: forbidden import (${hit.reason}) — ${hit.spec}`,
        );
      }
    }
  }

  if (totalHits > 0) {
    console.error(
      `\n${totalHits} forbidden import(s) across ${totalFiles} scanned files. Packages must NOT depend on apps/.`,
    );
    process.exit(1);
  }
  console.log(`✅ Package purity audit passed (${totalFiles} files scanned, no apps/ leaks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
