// @hade/testkit — public API surface.
//
// Fixtures, scripted mock adapters, and deterministic clocks for any code
// that consumes @hade/core. Framework-free — works with vitest, jest, uvu,
// or vanilla Node test runners. Optional vitest matchers live at the
// `@hade/testkit/vitest` sub-path so consumers don't need vitest installed
// to use the rest of the kit.

export const HADE_TESTKIT_VERSION = "0.1.0-alpha.0" as const;

// ─── Fixtures ────────────────────────────────────────────────────────────────

export { makeConfig } from "./fixtures/makeConfig.js";
export { makeDecision, resetDecisionCounter } from "./fixtures/makeDecision.js";
export { makeDecisionEngineOutput } from "./fixtures/makeDecisionEngineOutput.js";
export {
  makeVenueCandidate,
  resetVenueCandidateCounter,
} from "./fixtures/makeVenueCandidate.js";

// ─── Mock adapters (scripted, with call inspection) ──────────────────────────

export { mockVenueAdapter } from "./mocks/mockVenueAdapter.js";
export type {
  MockVenueAdapter,
  MockVenueAdapterOptions,
  VenueAdapterCall,
} from "./mocks/mockVenueAdapter.js";

export { mockLLMAdapter } from "./mocks/mockLLMAdapter.js";
export type {
  MockLLMAdapter,
  MockLLMAdapterOptions,
  MockLLMAdapterCall,
  LLMEnhanceResult,
} from "./mocks/mockLLMAdapter.js";

export { mockCacheAdapter } from "./mocks/mockCacheAdapter.js";
export type {
  MockCacheAdapter,
  MockCacheAdapterOptions,
  CacheCall,
} from "./mocks/mockCacheAdapter.js";

export { mockGeoAdapter } from "./mocks/mockGeoAdapter.js";
export type {
  MockGeoAdapter,
  MockGeoAdapterOptions,
} from "./mocks/mockGeoAdapter.js";

// ─── Deterministic clock ─────────────────────────────────────────────────────

export { fakeClock } from "./clock/fakeClock.js";
export type { FakeClock, FakeClockOptions } from "./clock/fakeClock.js";
