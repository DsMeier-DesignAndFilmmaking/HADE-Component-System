#!/usr/bin/env node
// scripts/check-bundle-budgets.mjs
//
// Fails CI if any @hade/* package's built ESM entry point exceeds its byte
// budget when gzipped. Measures `dist/index.js` (tsup's ESM output) — the
// file a modern consumer's bundler actually ships. CJS output is checked at
// the dual-format gate (existence of `dist/index.cjs`); its bytes don't count
// against the budget since tree-shaking-aware consumers ship ESM.
//
// Run after `npm run sdk:build`. Exits non-zero on any violation.

import { readdir, stat, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PACKAGES_DIR = join(ROOT, "packages");

/**
 * Budget unit: kilobytes (1000 bytes), gzip of `dist/index.js` (tsup ESM
 * entry, sourcemaps excluded). Re-baselined for tsup + tree-shaking — these
 * numbers reflect the actual consumer ship size, not the raw-concat estimate
 * the Phase A script used.
 */
const BUDGETS_KB = {
  "@hade/core": 30,
  "@hade/react": 12,
  "@hade/tokens": 4,
  "@hade/testkit": 8,
  "@hade/copy": 8,
  "@hade/adapters-google-places": 8,
  "@hade/adapters-openai": 6,
  "@hade/adapters-upstash": 6,
  "@hade/adapters-memory": 3,
};

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function measure(packageDir) {
  const distDir = join(packageDir, "dist");
  if (!(await fileExists(distDir))) {
    return { ok: false, reason: "no-dist", kb: 0 };
  }
  const esmEntry = join(distDir, "index.js");
  const cjsEntry = join(distDir, "index.cjs");

  if (!(await fileExists(esmEntry))) {
    return { ok: false, reason: "missing-esm-entry", kb: 0 };
  }
  const cjsOk = await fileExists(cjsEntry);

  const buf = await readFile(esmEntry);
  const gz = gzipSync(buf);
  return { ok: true, kb: gz.byteLength / 1000, cjsOk };
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
    .map((e) => join(PACKAGES_DIR, e.name));

  let violations = 0;
  let missingBuilds = 0;
  let missingCjs = 0;
  const rows = [];

  for (const dir of packageDirs) {
    let pkg;
    try {
      pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    const name = pkg.name;
    const budget = BUDGETS_KB[name];
    const result = await measure(dir);
    if (!result.ok) {
      missingBuilds++;
      rows.push({
        name,
        budget: budget ?? "—",
        actual: "—",
        cjs: "—",
        status: `SKIP (${result.reason})`,
      });
      continue;
    }
    const actualKb = +result.kb.toFixed(2);
    if (!result.cjsOk) missingCjs++;
    if (budget === undefined) {
      rows.push({
        name,
        budget: "—",
        actual: `${actualKb} kB`,
        cjs: result.cjsOk ? "ok" : "MISSING",
        status: "no budget",
      });
      continue;
    }
    const over = actualKb > budget;
    if (over) violations++;
    rows.push({
      name,
      budget: `${budget} kB`,
      actual: `${actualKb} kB`,
      cjs: result.cjsOk ? "ok" : "MISSING",
      status: over ? "FAIL" : "ok",
    });
  }

  const nameW = Math.max(...rows.map((r) => r.name.length), 8);
  const budW = Math.max(...rows.map((r) => String(r.budget).length), 6);
  const actW = Math.max(...rows.map((r) => String(r.actual).length), 6);
  const cjsW = Math.max(...rows.map((r) => String(r.cjs).length), 3);

  console.log(
    `${"package".padEnd(nameW)}  ${"budget".padEnd(budW)}  ${"esm gz".padEnd(actW)}  ${"cjs".padEnd(cjsW)}  status`,
  );
  console.log(
    `${"-".repeat(nameW)}  ${"-".repeat(budW)}  ${"-".repeat(actW)}  ${"-".repeat(cjsW)}  ------`,
  );
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(nameW)}  ${String(r.budget).padEnd(budW)}  ${String(r.actual).padEnd(actW)}  ${String(r.cjs).padEnd(cjsW)}  ${r.status}`,
    );
  }

  if (missingBuilds > 0) {
    console.log(
      `\nnote: ${missingBuilds} package(s) had no dist — run 'npm run sdk:build' first.`,
    );
  }
  if (missingCjs > 0) {
    console.error(`\n${missingCjs} package(s) missing dist/index.cjs (dual-format break).`);
    process.exit(1);
  }
  if (violations > 0) {
    console.error(`\n${violations} bundle budget violation(s).`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
