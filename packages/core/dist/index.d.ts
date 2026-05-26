import { b as DecisionEngineOutput } from './DecisionEngineOutput-RR3Y_eDj.js';
export { A as ActionKind, a as ActionToken, C as ConfidenceBand, D as DECISION_ENGINE_OUTPUT_VERSION, c as DecisionEngineOutputVersion, d as DecisionSource, L as LayoutDensity, e as LayoutSlot, f as LayoutSurface, U as UxEscalationStep, g as UxNextAction, h as UxSuggestedSheet } from './DecisionEngineOutput-RR3Y_eDj.js';
export { BuildOutputOptions, DecideResponseLike, HadeDecisionLike, buildDecisionEngineOutput, confidenceBand, confidenceLabelId, fromDecideResponse, fromHadeDecision, normalizeDecisionSource } from './engine/buildOutput.js';
export { SURFACED_ONCE_PENALTY, SURFACED_TWICE_PENALTY, computeSurfacedPenalty } from './scoring/surfacedPenalty.js';
export { computeConfidence, syntheticConfidence } from './scoring/confidence.js';
export { BUILT_IN_DOMAINS, BUILT_IN_SCORING_PROFILES, DEFAULT_CONFIG_HASH, DEFAULT_HADE_CONFIG } from './config/defaults.js';
export { loadConfig, resolveEffectiveCopy } from './config/index.js';
export { HadeConfigValidationError, HadeConfigValidationIssue, assertValidConfig, validateConfig } from './config/validateConfig.js';
export { CURRENT_SCHEMA_VERSION, detectSchemaVersion, migrateConfig } from './config/migrations.js';
export { computeConfigHash, computeConfigHashSync } from './config/hash.js';
import { HadeConfig } from './config/schema.js';
export { HadeAdapterMetadata, HadeAdaptersMetadata, HadeConfidenceBandConfig, HadeConfidenceConfig, HadeConfidenceLabelConfig, HadeConfidenceWeightConfig, HadeConfigDefaults, HadeCopyConfig, HadeDomainConfig, HadeMobilityConfig, HadeNodeConfidenceConfig, HadeOfflineConfig, HadeOpportunityWeightConfig, HadeProductConfig, HadeRuntimeConfig, HadeSchemaVersion, HadeScoringConfig, HadeScoringProfile, HadeSyntheticConfidenceConfig, HadeTimeoutConfig, HadeWeightConfig, ResolvedHadeConfig } from './config/schema.js';
export { formatDistance, formatEta } from './util/format.js';
export { FallbackEntryLike, extractRejectedVenueIds, extractSurfacedFallbackTitles, recoverLeastRecentlySurfaced, sortFallbackCandidates } from './engine/fallbackSelection.js';
export { buildExplanation } from './explanation/explanation.js';
export { A as AdapterHealth, a as AdapterKind, C as CacheAdapter, G as GeoAdapter, b as GeoCoords, H as HadeAdapters, L as LLMAdapter, P as PartialHadeAdapters, V as VenueAdapter, c as VenueCandidate, d as VenueContextLike, e as VenueMultiQueryOptions, f as VenueSearchNearbyOptions } from './adapters-2-CsI3Kq.js';
export { createVenueAdapter, getVenueAdapter, registerDefaultAdapters, resetAdapterRegistryForTests, resolveAdapters, setDefaultVenueAdapterFactory } from './adapters/registry.js';
export { AdapterName, CreateHadeErrorFactoryOptions, HadeError, HadeErrorCode, HadeErrorContext, HadeErrorFactory, createHadeErrorFactory, isHadeError } from './errors/index.js';
export { CompositeGeoOptions, HeaderGeoOptions, HeaderSource, IpLookupGeoOptions, StaticGeoOptions, compositeGeo, headerGeo, ipLookupGeo, staticGeo } from './adapters/geo/index.js';
export { EmptyVenuesOptions, MemoryCacheOptions, NoopLLMOptions, emptyVenues, memoryCache, noopLLM } from './adapters/defaults/index.js';
export { LegacyCopyPatch, LegacyFetchNearbyOptions, LegacyMultiQueryOptions, LegacyOpenAIAdapterDeps, LegacyRedisClient, LegacyUpstashAdapterDeps, UnwrappedGooglePlacesDeps, legacyOpenAIAdapter, legacyUpstashAdapter, unwrappedGooglePlaces } from './legacy/index.js';
import { D as DecideInput, a as DecideOptions, b as HadeClientConfig } from './createHade-DE3d2SK2.js';
export { H as HadeClient, R as RefineInput, c as RefineToneShorthand, d as createHade } from './createHade-DE3d2SK2.js';

/**
 * Vibe tag sentiment map for confidence scoring (subset of full Hade VibeTag union).
 * Kept in core so scoring stays framework-free.
 */
declare const VIBE_TAG_SENTIMENT: Record<string, "positive" | "negative">;

declare const HADE_CORE_VERSION: "0.1.0-alpha.0";

declare function decide(input: DecideInput, options?: DecideOptions & {
    config?: HadeClientConfig;
}): Promise<DecisionEngineOutput>;

declare function defineConfig(config: HadeConfig): HadeConfig;

export { DecideInput, DecideOptions, DecisionEngineOutput, HADE_CORE_VERSION, HadeClientConfig, HadeConfig, VIBE_TAG_SENTIMENT, decide, defineConfig };
