import { b as DecisionEngineOutput } from './DecisionEngineOutput-RR3Y_eDj.cjs';
export { A as ActionKind, a as ActionToken, C as ConfidenceBand, D as DECISION_ENGINE_OUTPUT_VERSION, c as DecisionEngineOutputVersion, d as DecisionSource, L as LayoutDensity, e as LayoutSlot, f as LayoutSurface, U as UxEscalationStep, g as UxNextAction, h as UxSuggestedSheet } from './DecisionEngineOutput-RR3Y_eDj.cjs';
export { BuildOutputOptions, DecideResponseLike, HadeDecisionLike, buildDecisionEngineOutput, confidenceBand, confidenceLabelId, fromDecideResponse, fromHadeDecision, normalizeDecisionSource } from './engine/buildOutput.cjs';
export { SURFACED_ONCE_PENALTY, SURFACED_TWICE_PENALTY, computeSurfacedPenalty } from './scoring/surfacedPenalty.cjs';
export { computeConfidence, syntheticConfidence } from './scoring/confidence.cjs';
export { BUILT_IN_DOMAINS, BUILT_IN_SCORING_PROFILES, DEFAULT_CONFIG_HASH, DEFAULT_HADE_CONFIG } from './config/defaults.cjs';
export { loadConfig, resolveEffectiveCopy } from './config/index.cjs';
export { HadeConfigValidationError, HadeConfigValidationIssue, assertValidConfig, validateConfig } from './config/validateConfig.cjs';
export { CURRENT_SCHEMA_VERSION, detectSchemaVersion, migrateConfig } from './config/migrations.cjs';
export { computeConfigHash, computeConfigHashSync } from './config/hash.cjs';
import { HadeConfig } from './config/schema.cjs';
export { HadeAdapterMetadata, HadeAdaptersMetadata, HadeConfidenceBandConfig, HadeConfidenceConfig, HadeConfidenceLabelConfig, HadeConfidenceWeightConfig, HadeConfigDefaults, HadeCopyConfig, HadeDomainConfig, HadeMobilityConfig, HadeNodeConfidenceConfig, HadeOfflineConfig, HadeOpportunityWeightConfig, HadeProductConfig, HadeRuntimeConfig, HadeSchemaVersion, HadeScoringConfig, HadeScoringProfile, HadeSyntheticConfidenceConfig, HadeTimeoutConfig, HadeWeightConfig, ResolvedHadeConfig } from './config/schema.cjs';
export { formatDistance, formatEta } from './util/format.cjs';
export { FallbackEntryLike, extractRejectedVenueIds, extractSurfacedFallbackTitles, recoverLeastRecentlySurfaced, sortFallbackCandidates } from './engine/fallbackSelection.cjs';
export { buildExplanation } from './explanation/explanation.cjs';
export { A as AdapterHealth, a as AdapterKind, C as CacheAdapter, G as GeoAdapter, b as GeoCoords, H as HadeAdapters, L as LLMAdapter, P as PartialHadeAdapters, V as VenueAdapter, c as VenueCandidate, d as VenueContextLike, e as VenueMultiQueryOptions, f as VenueSearchNearbyOptions } from './adapters-2-CsI3Kq.cjs';
export { createVenueAdapter, getVenueAdapter, registerDefaultAdapters, resetAdapterRegistryForTests, resolveAdapters, setDefaultVenueAdapterFactory } from './adapters/registry.cjs';
export { AdapterName, CreateHadeErrorFactoryOptions, HadeError, HadeErrorCode, HadeErrorContext, HadeErrorFactory, createHadeErrorFactory, isHadeError } from './errors/index.cjs';
export { CompositeGeoOptions, HeaderGeoOptions, HeaderSource, IpLookupGeoOptions, StaticGeoOptions, compositeGeo, headerGeo, ipLookupGeo, staticGeo } from './adapters/geo/index.cjs';
export { EmptyVenuesOptions, MemoryCacheOptions, NoopLLMOptions, emptyVenues, memoryCache, noopLLM } from './adapters/defaults/index.cjs';
export { LegacyCopyPatch, LegacyFetchNearbyOptions, LegacyMultiQueryOptions, LegacyOpenAIAdapterDeps, LegacyRedisClient, LegacyUpstashAdapterDeps, UnwrappedGooglePlacesDeps, legacyOpenAIAdapter, legacyUpstashAdapter, unwrappedGooglePlaces } from './legacy/index.cjs';
import { D as DecideInput, a as DecideOptions, b as HadeClientConfig } from './createHade-CHg1z-km.cjs';
export { H as HadeClient, R as RefineInput, c as RefineToneShorthand, d as createHade } from './createHade-CHg1z-km.cjs';

/**
 * Vibe tag sentiment map for confidence scoring (subset of full Hade VibeTag union).
 * Kept in core so scoring stays framework-free.
 */
declare const VIBE_TAG_SENTIMENT: Record<string, "positive" | "negative">;

declare const HADE_CORE_VERSION: "0.1.0";

declare function decide(input: DecideInput, options?: DecideOptions & {
    config?: HadeClientConfig;
}): Promise<DecisionEngineOutput>;

declare function defineConfig(config: HadeConfig): HadeConfig;

export { DecideInput, DecideOptions, DecisionEngineOutput, HADE_CORE_VERSION, HadeClientConfig, HadeConfig, VIBE_TAG_SENTIMENT, decide, defineConfig };
