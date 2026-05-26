import { HadeConfig, ResolvedHadeConfig } from './schema.js';

interface LoadConfigOptions {
    readonly clientId?: string;
    readonly configHash?: string;
}
/**
 * Resolves a (possibly pre-Phase-F) input config into a fully-merged
 * {@link ResolvedHadeConfig}. Pipeline:
 *
 *   1. migrateConfig() — silently upgrades v0 shapes to v1.0
 *   2. assertValidConfig() — throws HadeConfigValidationError on field issues
 *   3. deep-merge with DEFAULT_HADE_CONFIG
 *
 * Backward compatibility: pre-Phase-F inputs like
 * `{ defaults: { radius_meters: 1000 } }` continue to work — migration stamps
 * `$schema_version: "1.0"` and the merge fills in domains/copy/mobility/runtime
 * from defaults.
 */
declare function loadConfig(config?: HadeConfig, options?: LoadConfigOptions): ResolvedHadeConfig;
/**
 * Phase G: Resolves the effective copy bundle from the precedence chain
 *   1. global `cfg.copy.overrides` (built-ins are already in BUILTIN_COPY_KEYS
 *      inside buildOutput.ts; this merge sits ON TOP of those)
 *   2. per-vertical `cfg.domains[active].copy_overrides`
 *
 * The result is passed as `copy_keys` into `fromDecideResponse` so every output
 * payload's `copy_tokens.keys` reflects the configured strings.
 *
 * Exported separately so consumers (UI hosts, native bridges) can compute the
 * same bundle without invoking `decide()`.
 */
declare function resolveEffectiveCopy(config: ResolvedHadeConfig): Record<string, string>;

export { type LoadConfigOptions, loadConfig, resolveEffectiveCopy };
