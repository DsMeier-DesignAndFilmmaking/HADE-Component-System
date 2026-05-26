// @hade/copy — locale string lookup
//
// Centralizes user-facing strings keyed by stable IDs. Replaces the ~40 inline
// English strings scattered across route.ts, engine.ts, deriveReasons.ts,
// supportText.ts, explanation.ts (audit Flaw #3).
//
// Phase G: `getCopy` accepts an optional `overrides` map so callers can layer
// runtime-resolved strings (e.g. from `cfg.copy.overrides` +
// `domains[active].copy_overrides`) on top of the built-in locale bundle in a
// single call. `resolveCopyBundle` exposes the same merger as a pure function
// for hosts that want the full Record upfront.
//
// `@hade/core` does NOT depend on this package (intentional — see comment at
// packages/core/src/engine/buildOutput.ts:81). Consumers wire the two together
// at their integration layer.

import { enUS } from "./en-US.js";

export type CopyLocale = "en-US";

export type CopyTable = Record<string, string>;

const BUNDLES: Record<CopyLocale, CopyTable> = {
  "en-US": enUS,
};

/**
 * Resolve a copy slot by ID for a given locale, with optional inline overrides
 * that win over the bundle.
 *
 * Returns the slot ID wrapped in `[...]` when neither the overrides nor the
 * bundle has a value — the bracket sentinel makes missing copy obvious in UI
 * during dev.
 */
export function getCopy(
  slot: string,
  locale: CopyLocale = "en-US",
  overrides?: Readonly<Record<string, string>>,
): string {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, slot)) {
    return overrides[slot] as string;
  }
  const bundle = BUNDLES[locale] ?? BUNDLES["en-US"];
  return bundle[slot] ?? `[${slot}]`;
}

/**
 * Returns the merged copy bundle for a locale, with optional override layers
 * applied in order (later layers win). Each layer is a `Record<string, string>`
 * — typical use:
 *
 *   resolveCopyBundle("en-US",
 *     cfg.copy.overrides,                            // global
 *     cfg.domains[cfg.active_domain].copy_overrides, // per-vertical
 *   );
 *
 * Pure / sync / edge-safe. Consumers can pre-compute the result once at boot
 * and pass it to UI components as a prop, avoiding per-render lookups.
 */
export function resolveCopyBundle(
  locale: CopyLocale = "en-US",
  ...overrideLayers: ReadonlyArray<Readonly<Record<string, string>> | undefined>
): CopyTable {
  const bundle = BUNDLES[locale] ?? BUNDLES["en-US"];
  const merged: CopyTable = { ...bundle };
  for (const layer of overrideLayers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      merged[key] = value;
    }
  }
  return merged;
}

/** Typed-config helper for custom copy bundles. Pass-through at runtime. */
export function defineCopy<T extends CopyTable>(table: T): T {
  return table;
}

export { enUS };
