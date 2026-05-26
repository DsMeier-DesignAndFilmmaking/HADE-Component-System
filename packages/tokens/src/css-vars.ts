// @hade/tokens/css-vars — CSS variable serializer (Phase A scaffold)
//
// Walks a ThemeTokens tree and emits `--hade-color-brand-accent: #316BFF;` etc.
// Pure function — no DOM writes. Caller decides where to put the string.

import type { ThemeTokens } from "./index.js";

/** Convert a ThemeTokens tree into a list of CSS variable declarations. */
export function themeToCSSVars(theme: ThemeTokens, prefix = "hade"): string[] {
  const lines: string[] = [];
  walk(theme as unknown as Record<string, unknown>, [prefix], lines);
  return lines;
}

function walk(node: Record<string, unknown>, path: string[], out: string[]): void {
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === "object" && "$value" in (value as object)) {
      const token = value as { $value: string };
      out.push(`--${[...path, key].join("-")}: ${token.$value};`);
    } else if (value && typeof value === "object") {
      walk(value as Record<string, unknown>, [...path, key], out);
    }
  }
}
