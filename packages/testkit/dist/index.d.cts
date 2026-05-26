import { HadeConfig, ResolvedHadeConfig, HadeDecisionLike, DecisionEngineOutput, VenueCandidate, VenueAdapter, VenueSearchNearbyOptions, VenueMultiQueryOptions, VenueContextLike, LLMAdapter, CacheAdapter, GeoAdapter, GeoCoords } from '@hade/core';

/**
 * Builds a {@link ResolvedHadeConfig} by deep-merging `overrides` with
 * built-in defaults. Routes through `loadConfig` so the result has all
 * defaults filled in (built-in domains, scoring profiles, copy keys, etc.) —
 * tests can read any field without checking for `undefined`.
 *
 * @example
 *   const cfg = makeConfig({ active_domain: "ecommerce" });
 *   expect(cfg.domains.ecommerce.default_radius_meters).toBe(0);
 */
declare function makeConfig(overrides?: HadeConfig): ResolvedHadeConfig;

declare function makeDecision(overrides?: Partial<HadeDecisionLike>): HadeDecisionLike;
/** Resets the auto-incrementing ID counter. Call in test setup for determinism. */
declare function resetDecisionCounter(): void;

/**
 * Builds a fully-assembled {@link DecisionEngineOutput} with sensible defaults.
 * Routes through `fromHadeDecision` so every field — including derived ones
 * like `confidence.band`, `ux_state`, `copy_tokens.keys` — is computed
 * consistently with the real engine.
 *
 * @param decisionOverrides — patches the input decision before assembly
 * @param outputOverrides   — patches the assembled output (deep-merged)
 */
declare function makeDecisionEngineOutput(decisionOverrides?: Partial<Parameters<typeof makeDecision>[0]>, outputOverrides?: Partial<DecisionEngineOutput>): DecisionEngineOutput;

declare function makeVenueCandidate(overrides?: Partial<VenueCandidate>): VenueCandidate;
/** Resets the auto-incrementing ID counter. Call in test setup for determinism. */
declare function resetVenueCandidateCounter(): void;

interface MockVenueAdapterOptions {
    readonly id?: string;
    /**
     * Canned candidate sequence. Each call to a search method consumes the next
     * batch in order; once exhausted, subsequent calls return `[]`. Set
     * `loop: true` to cycle back to the start instead.
     */
    readonly batches?: ReadonlyArray<readonly VenueCandidate[]>;
    /** Cycle through `batches` indefinitely instead of returning empty when exhausted. */
    readonly loop?: boolean;
    /** Throw on every call. Useful for testing failure paths. */
    readonly alwaysFail?: boolean | Error;
}
interface MockVenueAdapter extends VenueAdapter {
    /** Mutable call log for inspection in tests. */
    readonly calls: ReadonlyArray<VenueAdapterCall>;
    /** Reset the call log and rewind the batch cursor. */
    reset(): void;
}
type VenueAdapterCall = {
    kind: "searchNearby";
    args: VenueSearchNearbyOptions;
} | {
    kind: "searchMultiQuery";
    args: VenueMultiQueryOptions;
} | {
    kind: "searchForContext";
    args: VenueContextLike;
    categories: string[];
};
/**
 * Scripted VenueAdapter. Unlike `emptyVenues()` (which returns `[]` every
 * call), this consumes a queue of canned batches AND records every call so
 * tests can assert on arguments and call order.
 *
 * @example
 *   const venue = mockVenueAdapter({
 *     batches: [[makeVenueCandidate(), makeVenueCandidate()]],
 *   });
 *   await client.decide({ geo: { lat: 40, lng: -74 } });
 *   expect(venue.calls).toHaveLength(1);
 *   expect(venue.calls[0].kind).toBe("searchForContext");
 */
declare function mockVenueAdapter(options?: MockVenueAdapterOptions): MockVenueAdapter;

type LLMEnhanceResult = {
    rationale?: string;
    why_now?: string;
    why_this?: string;
    decision_frame?: string;
};
interface MockLLMAdapterOptions {
    readonly id?: string;
    /**
     * Canned responses, consumed in order. Once exhausted, subsequent calls
     * return `null` (matching `noopLLM` behavior). Pass `null` as an entry to
     * simulate a per-call null response without exhausting the queue.
     */
    readonly responses?: ReadonlyArray<LLMEnhanceResult | null>;
    readonly alwaysFail?: boolean | Error;
}
interface MockLLMAdapterCall {
    readonly prompt: string;
    readonly options: {
        timeout_ms?: number;
        model?: string;
    } | undefined;
}
interface MockLLMAdapter extends LLMAdapter {
    readonly calls: ReadonlyArray<MockLLMAdapterCall>;
    reset(): void;
}
/**
 * Scripted LLMAdapter. Records every prompt and consumes a canned response
 * queue. Useful for verifying prompt construction without hitting OpenAI.
 *
 * @example
 *   const llm = mockLLMAdapter({
 *     responses: [{ rationale: "great pick", why_now: "lunch time" }],
 *   });
 *   await client.decide({ ... });
 *   expect(llm.calls[0].prompt).toContain("dining");
 */
declare function mockLLMAdapter(options?: MockLLMAdapterOptions): MockLLMAdapter;

interface MockCacheAdapterOptions {
    readonly id?: string;
    readonly mode?: "FULL" | "DEGRADED";
    /** Pre-seed entries. */
    readonly initial?: Record<string, unknown>;
}
type CacheCall = {
    kind: "get";
    key: string;
    hit: boolean;
} | {
    kind: "set";
    key: string;
    ttlSeconds: number | undefined;
};
interface MockCacheAdapter extends CacheAdapter {
    readonly calls: ReadonlyArray<CacheCall>;
    /** Direct map access for inspection / arrange-time seeding. */
    readonly store: ReadonlyMap<string, unknown>;
    reset(): void;
}
/**
 * Map-backed CacheAdapter that records every `get`/`set` call. Unlike
 * `memoryCache()`, there is no LRU eviction or TTL expiry — entries live
 * for the lifetime of the mock. Perfect for arrange-act-assert tests.
 */
declare function mockCacheAdapter(options?: MockCacheAdapterOptions): MockCacheAdapter;

interface MockGeoAdapterOptions {
    readonly id?: string;
    /**
     * Coord sequence consumed by `resolveCoords()`. After the queue is drained
     * the adapter returns `null` (matching the runtime contract for failed geo).
     * Pass `null` as an entry to simulate a per-call resolution failure.
     */
    readonly coords?: ReadonlyArray<GeoCoords | null>;
    readonly alwaysFail?: boolean | Error;
}
interface MockGeoAdapter extends GeoAdapter {
    readonly calls: number;
    reset(): void;
}
/**
 * Scripted GeoAdapter. Each call to `resolveCoords()` consumes the next entry
 * in `coords` and tracks call count. After exhausting the queue, subsequent
 * calls return `null`.
 *
 * @example
 *   const geo = mockGeoAdapter({
 *     coords: [{ lat: 40.71, lng: -74.01 }, null], // first ok, second fails
 *   });
 */
declare function mockGeoAdapter(options?: MockGeoAdapterOptions): MockGeoAdapter;

/**
 * Deterministic clock helpers for HADE consumer tests.
 *
 * `fakeClock` patches `Date.now()` and `Math.random()` globally for the
 * lifetime of the returned controller, then restores both on `restore()`.
 * Use it in test setup to make request IDs, generated_at timestamps, and
 * any other entropy-driven outputs reproducible.
 *
 * @example
 *   const clock = fakeClock({ nowMs: 1_700_000_000_000, randomSeed: 0.42 });
 *   try {
 *     const output = await client.decide({ ... });
 *     expect(output.generated_at_ms).toBe(1_700_000_000_000);
 *   } finally {
 *     clock.restore();
 *   }
 */
interface FakeClockOptions {
    /** Initial epoch ms returned by `Date.now()`. Defaults to a Y2024 ms. */
    readonly nowMs?: number;
    /** Value returned by every `Math.random()` call. Defaults to 0.5. */
    readonly randomSeed?: number;
}
interface FakeClock {
    /** Current frozen time in epoch ms. */
    now(): number;
    /** Advance the clock by `ms`. */
    advance(ms: number): void;
    /** Restore the original `Date.now` + `Math.random`. */
    restore(): void;
}
declare function fakeClock(options?: FakeClockOptions): FakeClock;

declare const HADE_TESTKIT_VERSION: "0.1.0";

export { type CacheCall, type FakeClock, type FakeClockOptions, HADE_TESTKIT_VERSION, type LLMEnhanceResult, type MockCacheAdapter, type MockCacheAdapterOptions, type MockGeoAdapter, type MockGeoAdapterOptions, type MockLLMAdapter, type MockLLMAdapterCall, type MockLLMAdapterOptions, type MockVenueAdapter, type MockVenueAdapterOptions, type VenueAdapterCall, fakeClock, makeConfig, makeDecision, makeDecisionEngineOutput, makeVenueCandidate, mockCacheAdapter, mockGeoAdapter, mockLLMAdapter, mockVenueAdapter, resetDecisionCounter, resetVenueCandidateCounter };
