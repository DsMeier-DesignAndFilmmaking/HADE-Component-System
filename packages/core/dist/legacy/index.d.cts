import { c as VenueCandidate, V as VenueAdapter, L as LLMAdapter, C as CacheAdapter } from '../adapters-2-CsI3Kq.cjs';

/**
 * unwrappedGooglePlaces — byte-identical legacy shim.
 *
 * Wraps the existing in-tree `fetchNearbyGrounded` (and optionally
 * `fetchMultiQueryGrounded`) from `src/core/services/places.ts` as a
 * {@link VenueAdapter}. Lets the route adopt the adapter API in Phase E with
 * **zero behavior delta** — same fetch, same field mask, same timeout, same
 * field shapes — by passing the existing functions as deps.
 *
 * Removable in v2.0 once the route is fully migrated to a clean-room
 * `googlePlaces()` adapter.
 *
 * See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md §4
 */

/**
 * Loose shape for the legacy in-tree options object. The shim doesn't import
 * any app types — callers pass whatever their `fetchNearbyGrounded` accepts.
 */
interface LegacyFetchNearbyOptions {
    geo: {
        lat: number;
        lng: number;
    };
    radius_meters?: number;
    intent?: string;
    target_categories?: string[];
    open_now?: boolean;
    max_results?: number;
}
interface LegacyMultiQueryOptions {
    geo: {
        lat: number;
        lng: number;
    };
    categoryBuckets: string[][];
    radius_meters: number;
    open_now?: boolean;
}
interface UnwrappedGooglePlacesDeps {
    readonly fetchNearbyGrounded: (opts: LegacyFetchNearbyOptions) => Promise<readonly VenueCandidate[]>;
    /** Optional. If omitted, `searchMultiQuery` falls through to a single search. */
    readonly fetchMultiQueryGrounded?: (opts: LegacyMultiQueryOptions) => Promise<readonly VenueCandidate[]>;
    /** Adapter id surfaced in logs. Defaults to `"google_places_legacy@0.0.0"`. */
    readonly id?: string;
    /** Default radius applied when `searchForContext` is called without one. */
    readonly defaultRadiusMeters?: number;
}
declare function unwrappedGooglePlaces(deps: UnwrappedGooglePlacesDeps): VenueAdapter;

/**
 * legacyOpenAIAdapter — byte-identical legacy shim.
 *
 * Wraps the existing inline copy-enhancement function (`enhanceCopyWithLLM`
 * at `src/app/api/hade/decide/route.ts:814-920`) as an {@link LLMAdapter}.
 * Lets the route adopt the adapter API with zero behavior delta — the same
 * OpenAI fetch, the same `extractSafeCopyPatch` validation, the same char
 * caps — by passing the existing function in as a dep.
 *
 * Removable in v2.0 once the route is fully migrated to the clean-room
 * `openai()` adapter from `@hade/adapters-openai`.
 */

/** Loose patch shape — matches the existing `enhanceCopyWithLLM` return. */
interface LegacyCopyPatch {
    rationale?: string;
    why_now?: string;
    why_this?: string;
    decision_frame?: string;
}
interface LegacyOpenAIAdapterDeps {
    /**
     * The existing in-tree `enhanceCopyWithLLM`-shaped function. Takes a single
     * pre-rendered prompt string; returns a copy patch or null. Adapter passes
     * the prompt through verbatim — no normalization, no re-validation.
     */
    readonly enhanceCopy: (prompt: string, options?: {
        timeout_ms?: number;
        model?: string;
    }) => Promise<LegacyCopyPatch | null>;
    /** Adapter id surfaced in logs. Defaults to `"openai_legacy@0.0.0"`. */
    readonly id?: string;
}
declare function legacyOpenAIAdapter(deps: LegacyOpenAIAdapterDeps): LLMAdapter;

/**
 * legacyUpstashAdapter — byte-identical legacy shim.
 *
 * Wraps the existing in-tree Upstash client + `getRedisMode` from
 * `src/lib/hade/redis.ts` as a {@link CacheAdapter}. Lets the route and
 * other consumers adopt the adapter API with **zero behavior delta** — the
 * recovery-proxy semantics (`wrapForRecovery`) and degraded-mode bookkeeping
 * stay exactly as today.
 *
 * Removable in v2.0 once consumers fully migrate to the clean-room `upstash()`
 * adapter from `@hade/adapters-upstash`.
 */

/** Minimal shape needed from the legacy Upstash client — duck-typed. */
interface LegacyRedisClient {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, opts?: {
        ex?: number;
    }): Promise<unknown>;
}
interface LegacyUpstashAdapterDeps {
    /** The wrapped Upstash client (or `null` when unconfigured). */
    readonly client: LegacyRedisClient | null;
    /** Existing `getRedisMode()` function — duck-typed return preserved. */
    readonly getMode: () => "FULL" | "DEGRADED";
    /** Default TTL in seconds applied to `set` calls that omit one. */
    readonly defaultTtlSeconds?: number;
    /** Adapter id surfaced in logs. */
    readonly id?: string;
}
declare function legacyUpstashAdapter(deps: LegacyUpstashAdapterDeps): CacheAdapter;

export { type LegacyCopyPatch, type LegacyFetchNearbyOptions, type LegacyMultiQueryOptions, type LegacyOpenAIAdapterDeps, type LegacyRedisClient, type LegacyUpstashAdapterDeps, type UnwrappedGooglePlacesDeps, legacyOpenAIAdapter, legacyUpstashAdapter, unwrappedGooglePlaces };
