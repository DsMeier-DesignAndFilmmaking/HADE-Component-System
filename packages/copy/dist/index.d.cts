export { enUS } from './en-US.cjs';

type CopyLocale = "en-US";
type CopyTable = Record<string, string>;
/**
 * Resolve a copy slot by ID for a given locale, with optional inline overrides
 * that win over the bundle.
 *
 * Returns the slot ID wrapped in `[...]` when neither the overrides nor the
 * bundle has a value — the bracket sentinel makes missing copy obvious in UI
 * during dev.
 */
declare function getCopy(slot: string, locale?: CopyLocale, overrides?: Readonly<Record<string, string>>): string;
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
declare function resolveCopyBundle(locale?: CopyLocale, ...overrideLayers: ReadonlyArray<Readonly<Record<string, string>> | undefined>): CopyTable;
/** Typed-config helper for custom copy bundles. Pass-through at runtime. */
declare function defineCopy<T extends CopyTable>(table: T): T;

export { type CopyLocale, type CopyTable, defineCopy, getCopy, resolveCopyBundle };
