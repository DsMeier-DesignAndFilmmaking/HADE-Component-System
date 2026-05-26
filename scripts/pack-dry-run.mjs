#!/usr/bin/env node
// scripts/pack-dry-run.mjs
//
// Phase 8 (M3) — pre-publish hygiene gate.
//
// Runs `npm pack --dry-run` in every non-private @hade/* package and asserts:
//   1. dist/index.js + dist/index.cjs + dist/index.d.ts are in the tarball
//   2. README.md is in the tarball
//   3. NOTHING matching `__tests__/`, `.tsbuildinfo`, `*.test.*`, `*.spec.*`
//      leaks into the tarball
//
// Exits non-zero on any violation. Designed for CI; safe to run locally too.

import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PACKAGES_DIR = join(ROOT, "packages");
const NPM_CACHE_DIR = join(tmpdir(), "hade-npm-pack-cache");

const REQUIRED_FILES = [
  /(^|\/)dist\/index\.js$/,
  /(^|\/)dist\/index\.cjs$/,
  /(^|\/)dist\/index\.d\.ts$/,
  /(^|\/)README\.md$/,
];

const FORBIDDEN_FILES = [
  /__tests__/,
  /\.tsbuildinfo$/,
  /\.test\.(j|t)sx?$/,
  /\.spec\.(j|t)sx?$/,
];

function listTarballFiles(packageDir) {
  // `npm pack --dry-run --json` returns a structured manifest including
  // every file path. Way more reliable than parsing the human-readable
  // `npm notice` output.
  const json = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: NPM_CACHE_DIR,
    },
  });
  const payload = JSON.parse(json);
  // npm returns an array with a single object per package.
  const entry = Array.isArray(payload) ? payload[0] : payload;
  return entry.files.map((f) => f.path);
}

async function main() {
  const entries = await readdir(PACKAGES_DIR, { withFileTypes: true });
  const packageDirs = entries.filter((e) => e.isDirectory()).map((e) => join(PACKAGES_DIR, e.name));

  let failures = 0;
  const rows = [];

  for (const dir of packageDirs) {
    let pkg;
    try {
      pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (pkg.private === true) {
      rows.push({ name: pkg.name, status: "skipped (private)", detail: "" });
      continue;
    }

    let files;
    try {
      files = listTarballFiles(dir);
    } catch (e) {
      failures++;
      rows.push({ name: pkg.name, status: "PACK FAILED", detail: String(e.message ?? e) });
      continue;
    }

    const issues = [];
    for (const req of REQUIRED_FILES) {
      if (!files.some((f) => req.test(f))) {
        issues.push(`missing required: ${req}`);
      }
    }
    for (const forbid of FORBIDDEN_FILES) {
      const leaked = files.filter((f) => forbid.test(f));
      if (leaked.length > 0) {
        issues.push(`leaked ${leaked.length} file(s) matching ${forbid}: ${leaked.slice(0, 3).join(", ")}${leaked.length > 3 ? "…" : ""}`);
      }
    }

    if (issues.length > 0) {
      failures++;
      rows.push({ name: pkg.name, status: "FAIL", detail: issues.join("; ") });
    } else {
      rows.push({ name: pkg.name, status: "ok", detail: `${files.length} files` });
    }
  }

  const nameW = Math.max(...rows.map((r) => r.name.length), 8);
  const statusW = Math.max(...rows.map((r) => r.status.length), 6);
  console.log(`${"package".padEnd(nameW)}  ${"status".padEnd(statusW)}  detail`);
  console.log(`${"-".repeat(nameW)}  ${"-".repeat(statusW)}  ------`);
  for (const r of rows) {
    console.log(`${r.name.padEnd(nameW)}  ${r.status.padEnd(statusW)}  ${r.detail}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} package(s) failed the pack-dry-run gate.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
