import { DEFAULT_HADE_CONFIG } from "./defaults.js";
import { HadeConfigValidationError, assertValidConfig } from "./validateConfig.js";
import { migrateConfig } from "./migrations.js";
import type {
  HadeConfig,
  HadeDomainConfig,
  HadeScoringProfile,
  ResolvedHadeConfig,
} from "./schema.js";

export interface LoadConfigOptions {
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
export function loadConfig(config: HadeConfig = {}, options: LoadConfigOptions = {}): ResolvedHadeConfig {
  // Phase F: silently upgrade v0 (pre-Phase-F) configs before validation.
  const migrated = migrateConfig(config) as HadeConfig;
  assertValidConfig(migrated);

  const configHash =
    migrated.defaults?.config_hash ?? options.configHash ?? DEFAULT_HADE_CONFIG.config_hash;

  // ── Domains: merge built-ins with user overrides, then deep-merge each
  // matching pair so users can override a single field on a built-in vertical
  // (e.g. just `default_radius_meters` on dining) without redeclaring the rest.
  const userDomains = migrated.domains ?? {};
  const mergedDomainKeys = new Set([
    ...Object.keys(DEFAULT_HADE_CONFIG.domains),
    ...Object.keys(userDomains),
  ]);
  const resolvedDomains: Record<string, Required<HadeDomainConfig>> = {};
  for (const id of mergedDomainKeys) {
    const builtin = DEFAULT_HADE_CONFIG.domains[id];
    const override = userDomains[id];
    if (builtin && override) {
      resolvedDomains[id] = {
        ...builtin,
        ...override,
        copy_overrides: { ...builtin.copy_overrides, ...override.copy_overrides },
      };
    } else if (builtin) {
      resolvedDomains[id] = builtin;
    } else if (override) {
      // Custom user-defined vertical. Fill in any omitted fields with empty
      // values so the resolved shape stays `Required<HadeDomainConfig>`.
      resolvedDomains[id] = {
        id: override.id ?? id,
        display_name: override.display_name ?? id,
        default_intents: override.default_intents ?? [],
        primary_signals: override.primary_signals ?? [],
        default_radius_meters: override.default_radius_meters ?? 800,
        category_buckets: override.category_buckets ?? [],
        scoring_profile: override.scoring_profile ?? "balanced",
        copy_overrides: override.copy_overrides ?? {},
      };
    }
  }

  // ── Scoring profiles: merge built-in named profiles with user overrides.
  const userProfiles = migrated.scoring?.profiles ?? {};
  const mergedProfiles: Record<string, HadeScoringProfile> = {
    ...DEFAULT_HADE_CONFIG.scoring.profiles,
    ...userProfiles,
  };

  return {
    $schema_version: "1.0",
    product: migrated.product,
    defaults: {
      ...DEFAULT_HADE_CONFIG.defaults,
      ...migrated.defaults,
      config_hash: configHash,
    },
    confidence: {
      bands: {
        ...DEFAULT_HADE_CONFIG.confidence.bands,
        ...migrated.confidence?.bands,
      },
      labels: {
        ...DEFAULT_HADE_CONFIG.confidence.labels,
        ...migrated.confidence?.labels,
      },
      node: {
        ...DEFAULT_HADE_CONFIG.confidence.node,
        ...migrated.confidence?.node,
      },
      synthetic: {
        ...DEFAULT_HADE_CONFIG.confidence.synthetic,
        ...migrated.confidence?.synthetic,
      },
    },
    timeouts: {
      ...DEFAULT_HADE_CONFIG.timeouts,
      ...migrated.timeouts,
    },
    weights: {
      opportunity: {
        ...DEFAULT_HADE_CONFIG.weights.opportunity,
        ...migrated.weights?.opportunity,
      },
      confidence: {
        ...DEFAULT_HADE_CONFIG.weights.confidence,
        ...migrated.weights?.confidence,
      },
    },
    scoring: {
      surfaced_once_penalty:
        migrated.scoring?.surfaced_once_penalty ?? DEFAULT_HADE_CONFIG.scoring.surfaced_once_penalty,
      surfaced_twice_penalty:
        migrated.scoring?.surfaced_twice_penalty ?? DEFAULT_HADE_CONFIG.scoring.surfaced_twice_penalty,
      profiles: mergedProfiles,
      offline_overlay:
        migrated.scoring?.offline_overlay ?? DEFAULT_HADE_CONFIG.scoring.offline_overlay,
    },
    domains: resolvedDomains,
    active_domain: resolveActiveDomain(migrated.active_domain, resolvedDomains),
    copy: {
      locale: migrated.copy?.locale ?? DEFAULT_HADE_CONFIG.copy.locale,
      tone: migrated.copy?.tone ?? DEFAULT_HADE_CONFIG.copy.tone,
      char_caps: {
        ...DEFAULT_HADE_CONFIG.copy.char_caps,
        ...migrated.copy?.char_caps,
      },
      fallback_titles: migrated.copy?.fallback_titles ?? DEFAULT_HADE_CONFIG.copy.fallback_titles,
      // Phase G: inline copy overrides — merge with built-in defaults
      // (empty map). Vertical-specific overrides at
      // `domains[active_domain].copy_overrides` are applied later in
      // `resolveEffectiveCopy` (called from createHade) so the precedence
      // is: BUILTIN_COPY_KEYS ← copy.overrides ← domain.copy_overrides.
      overrides: {
        ...DEFAULT_HADE_CONFIG.copy.overrides,
        ...migrated.copy?.overrides,
      },
      ...(migrated.copy?.overrides_ref !== undefined
        ? { overrides_ref: migrated.copy.overrides_ref }
        : {}),
    },
    mobility: {
      ...DEFAULT_HADE_CONFIG.mobility,
      ...migrated.mobility,
    },
    runtime: {
      offline: {
        ...DEFAULT_HADE_CONFIG.runtime.offline,
        ...migrated.runtime?.offline,
      },
      total_budget_ms:
        migrated.runtime?.total_budget_ms ?? DEFAULT_HADE_CONFIG.runtime.total_budget_ms,
    },
    adapters: migrated.adapters ?? DEFAULT_HADE_CONFIG.adapters,
    metadata: migrated.metadata ?? DEFAULT_HADE_CONFIG.metadata,
    clientId: options.clientId ?? DEFAULT_HADE_CONFIG.clientId,
    config_hash: configHash,
  };
}

/**
 * Post-merge active_domain check. The schema-level validator only catches
 * mismatches when the user supplies BOTH `active_domain` AND `domains` (so it
 * can compare the two literals). When the user references an unknown vertical
 * by typo against the built-in set, the schema validator can't see it — so we
 * do the final lookup here, after merging built-ins with user overrides.
 */
function resolveActiveDomain(
  candidate: string | undefined,
  domains: Readonly<Record<string, unknown>>,
): string {
  const selected = candidate ?? DEFAULT_HADE_CONFIG.active_domain;
  if (selected in domains) return selected;
  throw new HadeConfigValidationError([
    {
      path: "active_domain",
      message: `must reference a key in "domains" (got "${selected}", available: [${Object.keys(domains).join(", ")}])`,
      value: selected,
    },
  ]);
}

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
export function resolveEffectiveCopy(config: ResolvedHadeConfig): Record<string, string> {
  const globalOverrides = config.copy.overrides;
  const activeDomain = config.domains[config.active_domain];
  const domainOverrides = activeDomain?.copy_overrides ?? {};
  return { ...globalOverrides, ...domainOverrides };
}
