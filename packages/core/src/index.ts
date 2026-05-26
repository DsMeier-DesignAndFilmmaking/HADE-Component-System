// @hade/core — public API surface (Phase A scaffold)
//
// This file is the SOLE public entry point for @hade/core. Every symbol exported
// here is part of the v1.0 contract. Internal implementation lives in ./internal/*
// and is never re-exported.
//
// Phase A status: scaffold only. The signatures below are placeholders that
// satisfy the type-check gate and the bundle-budget gate. Real implementations
// land in Phase B (engine relocation) and Phase C (entry points + types).
//
// See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md

export const HADE_CORE_VERSION = "0.1.0" as const;

// ─── Headless output contract (Phase 4) ───────────────────────────────────────

export type {
  ActionKind,
  ActionToken,
  ConfidenceBand,
  DecisionEngineOutput,
  DecisionEngineOutputVersion,
  DecisionSource,
  LayoutDensity,
  LayoutSlot,
  LayoutSurface,
  UxEscalationStep,
  UxNextAction,
  UxSuggestedSheet,
} from "./types/DecisionEngineOutput.js";

export { DECISION_ENGINE_OUTPUT_VERSION } from "./types/DecisionEngineOutput.js";

export {
  buildDecisionEngineOutput,
  confidenceBand,
  confidenceLabelId,
  fromDecideResponse,
  fromHadeDecision,
  normalizeDecisionSource,
} from "./engine/buildOutput.js";

export type {
  BuildOutputOptions,
  DecideResponseLike,
  HadeDecisionLike,
} from "./engine/buildOutput.js";

// ─── Phase 1 extracted engine modules ───────────────────────────────────────

export {
  SURFACED_ONCE_PENALTY,
  SURFACED_TWICE_PENALTY,
  computeSurfacedPenalty,
} from "./scoring/surfacedPenalty.js";

export { computeConfidence, syntheticConfidence } from "./scoring/confidence.js";

export { VIBE_TAG_SENTIMENT } from "./config/vibeSentiment.js";

export {
  BUILT_IN_DOMAINS,
  BUILT_IN_SCORING_PROFILES,
  DEFAULT_CONFIG_HASH,
  DEFAULT_HADE_CONFIG,
} from "./config/defaults.js";
export { loadConfig, resolveEffectiveCopy } from "./config/loadConfig.js";
export {
  HadeConfigValidationError,
  assertValidConfig,
  validateConfig,
} from "./config/validateConfig.js";
export type {
  HadeConfigValidationIssue,
} from "./config/validateConfig.js";

// Phase F: migration registry + sha256 hash
export {
  CURRENT_SCHEMA_VERSION,
  detectSchemaVersion,
  migrateConfig,
} from "./config/migrations.js";
export {
  computeConfigHash,
  computeConfigHashSync,
} from "./config/hash.js";

export type {
  HadeAdapterMetadata,
  HadeAdaptersMetadata,
  HadeConfidenceBandConfig,
  HadeConfidenceConfig,
  HadeConfidenceLabelConfig,
  HadeConfidenceWeightConfig,
  HadeCopyConfig,
  HadeDomainConfig,
  HadeMobilityConfig,
  HadeNodeConfidenceConfig,
  HadeOfflineConfig,
  HadeOpportunityWeightConfig,
  HadeProductConfig,
  HadeRuntimeConfig,
  HadeSchemaVersion,
  HadeScoringConfig,
  HadeScoringProfile,
  HadeSyntheticConfidenceConfig,
  HadeTimeoutConfig,
  HadeWeightConfig,
} from "./config/schema.js";

export { formatDistance, formatEta } from "./util/format.js";

export type { FallbackEntryLike } from "./engine/fallbackSelection.js";
export {
  extractRejectedVenueIds,
  extractSurfacedFallbackTitles,
  recoverLeastRecentlySurfaced,
  sortFallbackCandidates,
} from "./engine/fallbackSelection.js";

export { buildExplanation } from "./explanation/explanation.js";

// ─── Adapter contracts (Phase 3) ──────────────────────────────────────────────

export type {
  CacheAdapter,
  GeoAdapter,
  GeoCoords,
  HadeAdapters,
  LLMAdapter,
  PartialHadeAdapters,
  VenueAdapter,
  VenueCandidate,
  VenueContextLike,
  VenueMultiQueryOptions,
  VenueSearchNearbyOptions,
} from "./types/adapters.js";

export {
  createVenueAdapter,
  getVenueAdapter,
  registerDefaultAdapters,
  resetAdapterRegistryForTests,
  resolveAdapters,
  setDefaultVenueAdapterFactory,
} from "./adapters/registry.js";

// Adapter health/kind types (the rest of the adapter shapes are already exported above).
export type { AdapterHealth, AdapterKind } from "./types/adapters.js";

// ─── Errors (Phase C) ─────────────────────────────────────────────────────────

export {
  HadeError,
  createHadeErrorFactory,
  isHadeError,
} from "./errors/HadeError.js";

export type {
  AdapterName,
  CreateHadeErrorFactoryOptions,
  HadeErrorCode,
  HadeErrorContext,
  HadeErrorFactory,
} from "./errors/HadeError.js";

// ─── Built-in geo adapters (Phase C) — runtime-agnostic, no DOM ───────────────

export { staticGeo } from "./adapters/geo/staticGeo.js";
export type { StaticGeoOptions } from "./adapters/geo/staticGeo.js";

export { headerGeo } from "./adapters/geo/headerGeo.js";
export type { HeaderGeoOptions, HeaderSource } from "./adapters/geo/headerGeo.js";

export { ipLookupGeo } from "./adapters/geo/ipLookupGeo.js";
export type { IpLookupGeoOptions } from "./adapters/geo/ipLookupGeo.js";

export { compositeGeo } from "./adapters/geo/compositeGeo.js";
export type { CompositeGeoOptions } from "./adapters/geo/compositeGeo.js";

// ─── Built-in default adapters (Phase C) — used when no provider is wired ─────

export { emptyVenues } from "./adapters/defaults/emptyVenues.js";
export type { EmptyVenuesOptions } from "./adapters/defaults/emptyVenues.js";

export { noopLLM } from "./adapters/defaults/noopLLM.js";
export type { NoopLLMOptions } from "./adapters/defaults/noopLLM.js";

export { memoryCache } from "./adapters/defaults/memoryCache.js";
export type { MemoryCacheOptions } from "./adapters/defaults/memoryCache.js";

// ─── Legacy migration shims (Phase D — byte-identical wrappers) ──────────────

export {
  legacyOpenAIAdapter,
  legacyUpstashAdapter,
  unwrappedGooglePlaces,
} from "./legacy/index.js";

export type {
  LegacyCopyPatch,
  LegacyFetchNearbyOptions,
  LegacyMultiQueryOptions,
  LegacyOpenAIAdapterDeps,
  LegacyRedisClient,
  LegacyUpstashAdapterDeps,
  UnwrappedGooglePlacesDeps,
} from "./legacy/index.js";

// ─── Client factory (Phase C — real implementation) ───────────────────────────

export { createHade } from "./createHade.js";

export type {
  DecideInput,
  DecideOptions,
  HadeClient,
  HadeClientConfig,
  HadeConfig,
  HadeConfigDefaults,
  RefineInput,
  RefineToneShorthand,
  ResolvedHadeConfig,
} from "./types/HadeClient.js";

/**
 * `decide()` standalone entry — Phase E wires this to call `createHade(...).decide(input)`
 * under the hood with a per-call client. Currently a thin shim that constructs a default
 * client and delegates. Suitable for one-shot serverless / edge handlers.
 */
import { createHade as _createHade } from "./createHade.js";
import type { DecideInput as _DecideInput, DecideOptions as _DecideOptions, HadeClientConfig as _HadeClientConfig } from "./types/HadeClient.js";
import type { DecisionEngineOutput as _DecisionEngineOutput } from "./types/DecisionEngineOutput.js";

export async function decide(
  input: _DecideInput,
  options?: _DecideOptions & { config?: _HadeClientConfig },
): Promise<_DecisionEngineOutput> {
  const { config, ...callOptions } = options ?? {};
  const client = _createHade(config);
  try {
    return await client.decide(input, callOptions);
  } finally {
    await client.close();
  }
}

/**
 * Typed-config helper. Returns its argument unchanged at runtime; provides
 * autocomplete and validation at compile-time.
 */
import type { HadeConfig as _HadeConfig } from "./types/HadeClient.js";
export function defineConfig(config: _HadeConfig): _HadeConfig {
  return config;
}
