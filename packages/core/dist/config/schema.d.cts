/**
 * Phase F schema version. Configs without `$schema_version` are treated as v0
 * (pre-Phase-F) and silently auto-migrated by `migrateConfig` at load time.
 *
 * - Minor bumps (1.0 → 1.1) are additive only; old configs parse unchanged.
 * - Major bumps (1.x → 2.0) require an entry in `MIGRATIONS`.
 *
 * See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md §3
 */
type HadeSchemaVersion = "1.0";
interface HadeConfigDefaults {
    /** Default search radius in meters. */
    readonly radius_meters?: number;
    /** Default locale for copy resolution. */
    readonly locale?: string;
    /** Sha-style fingerprint surfaced in output.config_hash for A/B + reproducibility. */
    readonly config_hash?: string;
}
/** Optional product metadata block. Surfaced into analytics/logs as-is. */
interface HadeProductConfig {
    readonly id: string;
    readonly name: string;
    /** Default active vertical id. Must be a key in `domains`. */
    readonly domain: string;
}
/**
 * Per-vertical configuration. Built-in defaults shipped for
 * dining / social / travel / ecommerce; consumers can add any custom vertical
 * (real-estate, fitness, ticketing) without forking the SDK.
 */
interface HadeDomainConfig {
    readonly id: string;
    readonly display_name: string;
    readonly default_intents?: readonly string[];
    readonly primary_signals?: readonly string[];
    readonly default_radius_meters?: number;
    readonly category_buckets?: ReadonlyArray<readonly string[]>;
    /** References a key in `scoring.profiles`. Falls back to "balanced". */
    readonly scoring_profile?: string;
    /** Per-domain copy override keys, e.g. `{ "action.take_me_there": "Add to cart" }`. */
    readonly copy_overrides?: Readonly<Record<string, string>>;
}
/** A named scoring weight vector. Validated to sum to 1.0 ± 0.01. */
interface HadeScoringProfile {
    readonly proximity: number;
    readonly signal: number;
    readonly intent: number;
}
/** User-facing copy controls. Char caps mirror route.ts:904-907 byte-for-byte. */
interface HadeCopyConfig {
    readonly locale?: string;
    readonly tone?: "casual" | "professional" | "playful" | "luxury";
    readonly char_caps?: {
        readonly rationale?: number;
        readonly why_now?: number;
        readonly why_this?: number;
        readonly decision_frame?: number;
    };
    /** Static fallback titles surfaced when synthetic + LLM both miss. */
    readonly fallback_titles?: readonly string[];
    /**
     * Inline copy overrides applied globally (Phase G). Merges on top of the
     * built-in `BUILTIN_COPY_KEYS` table inside `buildDecisionEngineOutput`.
     * Per-vertical overrides at `domains[active].copy_overrides` win over these.
     *
     * Edge-safe: pure inline Record, no file I/O. Use `defineCopy` from
     * `@hade/copy` for richer locale bundles.
     */
    readonly overrides?: Readonly<Record<string, string>>;
    /**
     * Optional path to a locale JSON file. Resolution is intentionally deferred:
     * file I/O is host-specific (Node `fs`, Workers KV, browser fetch). When
     * consumers need filesystem-backed copy, they should load the JSON themselves
     * and pass it via `overrides` to keep `@hade/core` edge-safe.
     */
    readonly overrides_ref?: string;
}
/** Travel-pace parameters used to compute ETAs. Zero disables that mode. */
interface HadeMobilityConfig {
    readonly walking_meters_per_minute?: number;
    readonly driving_meters_per_minute?: number;
}
/** Offline / no-network policy. */
interface HadeOfflineConfig {
    readonly policy?: "static" | "cache" | "reject";
    readonly default_intent?: string;
    readonly copy_id?: string;
}
/** Runtime-only knobs (separated from `timeouts` for forward compatibility). */
interface HadeRuntimeConfig {
    readonly offline?: HadeOfflineConfig;
    /** Total per-request wall-clock budget. */
    readonly total_budget_ms?: number;
}
/**
 * Adapter metadata only — surfaced into analytics + logs and used to compute
 * config_hash. The engine NEVER uses these values to resolve adapter instances;
 * wiring is DI through `createHade({ adapters: { ... } })`.
 */
interface HadeAdapterMetadata {
    readonly id: string;
    readonly notes?: string;
}
interface HadeAdaptersMetadata {
    readonly venue?: HadeAdapterMetadata;
    readonly llm?: HadeAdapterMetadata;
    readonly cache?: HadeAdapterMetadata;
    readonly geo?: HadeAdapterMetadata;
}
interface HadeConfidenceBandConfig {
    /** Base high-confidence bar before per-call confidence_threshold shifting. */
    readonly high?: number;
    /** Base medium-confidence bar before per-call confidence_threshold shifting. */
    readonly medium?: number;
    /** Multiplier applied to confidence_threshold for the high bar. */
    readonly threshold_high_multiplier?: number;
    /** Multiplier applied to confidence_threshold for the medium bar. */
    readonly threshold_medium_multiplier?: number;
}
interface HadeConfidenceLabelConfig {
    readonly strong_pick?: number;
    readonly good_fit?: number;
}
interface HadeNodeConfidenceConfig {
    readonly default_score?: number;
    readonly min_score?: number;
    readonly max_score?: number;
    readonly signal_count_full_strength?: number;
    readonly signal_strength_min?: number;
    readonly signal_strength_max?: number;
    readonly agreement_min?: number;
    readonly agreement_max?: number;
    readonly trust_score?: number;
    readonly recency_default_score?: number;
    readonly recency_fresh_ms?: number;
    readonly recency_recent_ms?: number;
    readonly recency_day_ms?: number;
    readonly recency_fresh_score?: number;
    readonly recency_recent_score?: number;
    readonly recency_day_score?: number;
    readonly recency_stale_score?: number;
}
interface HadeSyntheticConfidenceConfig {
    readonly default_score?: number;
    readonly min_score?: number;
    readonly max_score?: number;
    readonly base_score?: number;
    readonly score_weight?: number;
}
interface HadeConfidenceConfig {
    readonly bands?: HadeConfidenceBandConfig;
    readonly labels?: HadeConfidenceLabelConfig;
    readonly node?: HadeNodeConfidenceConfig;
    readonly synthetic?: HadeSyntheticConfidenceConfig;
}
interface HadeTimeoutConfig {
    /** Default deadline for adapter calls orchestrated by createHade.decide(). */
    readonly adapter_ms?: number;
    /** Default deadline for built-in geo lookup adapters. */
    readonly geo_ms?: number;
}
interface HadeOpportunityWeightConfig {
    readonly proximity?: number;
    readonly signal?: number;
    readonly intent?: number;
}
interface HadeConfidenceWeightConfig {
    readonly signal_strength?: number;
    readonly agreement?: number;
    readonly trust?: number;
    readonly recency?: number;
}
interface HadeWeightConfig {
    readonly opportunity?: HadeOpportunityWeightConfig;
    readonly confidence?: HadeConfidenceWeightConfig;
}
interface HadeScoringConfig {
    readonly surfaced_once_penalty?: number;
    readonly surfaced_twice_penalty?: number;
    /**
     * Named weight vectors selectable per-domain via `HadeDomainConfig.scoring_profile`.
     * Built-in defaults: `balanced`, `intent_heavy`, `signal_heavy`, `rating_heavy`.
     */
    readonly profiles?: Readonly<Record<string, HadeScoringProfile>>;
    /** Optional weights overlay applied when serving from the offline cache. */
    readonly offline_overlay?: HadeScoringProfile;
}
/**
 * Inline config the caller passes to createHade. All nested groups are optional;
 * loadConfig merges them with DEFAULT_HADE_CONFIG.
 *
 * Phase F additions are all optional → existing Phase C/D/E configs parse
 * unchanged. Configs lacking `$schema_version` are treated as v0 and silently
 * migrated by `migrateConfig` before validation.
 */
interface HadeConfig {
    readonly $schema_version?: HadeSchemaVersion;
    readonly product?: HadeProductConfig;
    readonly defaults?: HadeConfigDefaults;
    readonly confidence?: HadeConfidenceConfig;
    readonly timeouts?: HadeTimeoutConfig;
    readonly weights?: HadeWeightConfig;
    readonly scoring?: HadeScoringConfig;
    /** Open vertical map. Built-in defaults: dining, social, travel, ecommerce. */
    readonly domains?: Readonly<Record<string, HadeDomainConfig>>;
    /** Active vertical id. Must be a key in `domains`. Defaults to `"dining"`. */
    readonly active_domain?: string;
    readonly copy?: HadeCopyConfig;
    readonly mobility?: HadeMobilityConfig;
    readonly runtime?: HadeRuntimeConfig;
    /** Adapter wiring metadata only — engine never uses these to resolve instances. */
    readonly adapters?: HadeAdaptersMetadata;
    /**
     * Free-form metadata block. Surfaced into analytics + logs as-is; never used
     * to resolve adapters.
     */
    readonly metadata?: Readonly<Record<string, unknown>>;
}
interface ResolvedHadeConfig {
    readonly $schema_version: HadeSchemaVersion;
    readonly product?: HadeProductConfig;
    readonly defaults: Required<HadeConfigDefaults>;
    readonly confidence: {
        readonly bands: Required<HadeConfidenceBandConfig>;
        readonly labels: Required<HadeConfidenceLabelConfig>;
        readonly node: Required<HadeNodeConfidenceConfig>;
        readonly synthetic: Required<HadeSyntheticConfidenceConfig>;
    };
    readonly timeouts: Required<HadeTimeoutConfig>;
    readonly weights: {
        readonly opportunity: Required<HadeOpportunityWeightConfig>;
        readonly confidence: Required<HadeConfidenceWeightConfig>;
    };
    readonly scoring: {
        readonly surfaced_once_penalty: number;
        readonly surfaced_twice_penalty: number;
        readonly profiles: Readonly<Record<string, HadeScoringProfile>>;
        readonly offline_overlay: HadeScoringProfile;
    };
    readonly domains: Readonly<Record<string, Required<HadeDomainConfig>>>;
    readonly active_domain: string;
    readonly copy: {
        readonly locale: string;
        readonly tone: NonNullable<HadeCopyConfig["tone"]>;
        readonly char_caps: Required<NonNullable<HadeCopyConfig["char_caps"]>>;
        readonly fallback_titles: readonly string[];
        readonly overrides: Readonly<Record<string, string>>;
        readonly overrides_ref?: string;
    };
    readonly mobility: Required<HadeMobilityConfig>;
    readonly runtime: {
        readonly offline: Required<HadeOfflineConfig>;
        readonly total_budget_ms: number;
    };
    readonly adapters: HadeAdaptersMetadata;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly clientId: string;
    readonly config_hash: string;
}

export type { HadeAdapterMetadata, HadeAdaptersMetadata, HadeConfidenceBandConfig, HadeConfidenceConfig, HadeConfidenceLabelConfig, HadeConfidenceWeightConfig, HadeConfig, HadeConfigDefaults, HadeCopyConfig, HadeDomainConfig, HadeMobilityConfig, HadeNodeConfidenceConfig, HadeOfflineConfig, HadeOpportunityWeightConfig, HadeProductConfig, HadeRuntimeConfig, HadeSchemaVersion, HadeScoringConfig, HadeScoringProfile, HadeSyntheticConfidenceConfig, HadeTimeoutConfig, HadeWeightConfig, ResolvedHadeConfig };
