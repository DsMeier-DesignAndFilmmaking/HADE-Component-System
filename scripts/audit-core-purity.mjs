#!/usr/bin/env node
/**
 * Fails CI if packages/core/src contains React, Next.js, or DOM API references.
 * Complements eslint.sdk.config.mjs (import boundaries).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "packages", "core", "src");

const FORBIDDEN_PATTERNS = [
  { name: "react", re: /from\s+["']react["']|from\s+["']react-dom["']/ },
  { name: "next", re: /from\s+["']next(\/|["'])|["']use client["']|["']use server["']|server-only/ },
  {
    name: "dom",
    re: /\b(window|document|localStorage|sessionStorage|navigator\.|HTMLElement|requestAnimationFrame)\b/,
  },
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) files.push(p);
  }
  return files;
}

const violations = [];

for (const file of walk(ROOT)) {
  const text = readFileSync(file, "utf8");
  const rel = file.replace(join(import.meta.dirname, "..") + "/", "");
  for (const { name, re } of FORBIDDEN_PATTERNS) {
    if (re.test(text)) violations.push({ file: rel, rule: name });
  }
}

if (violations.length > 0) {
  console.error("❌ @hade/core purity audit failed:\n");
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
  }
  process.exit(1);
}

console.log("✅ @hade/core purity audit passed (no React / Next / DOM in packages/core/src)");
