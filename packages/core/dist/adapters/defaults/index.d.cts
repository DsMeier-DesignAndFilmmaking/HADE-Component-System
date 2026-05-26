import { V as VenueAdapter, L as LLMAdapter, C as CacheAdapter } from '../../adapters-2-CsI3Kq.cjs';

/**
 * emptyVenues — a VenueAdapter that always returns `[]`.
 *
 * Used as the bundle default when no real venue provider is wired. The engine's
 * existing fallback chain (synthetic Tier 2 → static Tier 3) takes over from
 * there, preserving the no-Places-key path that already works in the demo.
 */

interface EmptyVenuesOptions {
    readonly id?: string;
}
declare function emptyVenues(options?: EmptyVenuesOptions): VenueAdapter;

/**
 * noopLLM — an LLMAdapter that always returns null.
 *
 * Used as the bundle default when no real LLM provider is wired. The engine
 * falls back to its deterministic copy templates (see
 * `src/lib/hade/engine.ts:384 generateRationale`), preserving the no-OpenAI-key
 * path that already works today.
 */

interface NoopLLMOptions {
    readonly id?: string;
}
declare function noopLLM(options?: NoopLLMOptions): LLMAdapter;

/**
 * memoryCache — in-process LRU CacheAdapter with TTL support.
 *
 * Used as the bundle default when no real cache provider (Upstash, Cloudflare
 * KV, etc.) is wired. The engine treats this exactly like a real cache; on
 * eviction or expiry it simply misses. `mode()` always returns "FULL" because
 * there is no remote dependency that can degrade.
 *
 * NOT safe across server processes — single-instance only. For production use
 * `@hade/adapters-upstash` or similar.
 */

interface MemoryCacheOptions {
    readonly id?: string;
    /** Max entries before LRU eviction. Defaults to 1024. */
    readonly maxEntries?: number;
    /** Default TTL in seconds for set() calls that omit one. */
    readonly defaultTtlSeconds?: number;
}
declare function memoryCache(options?: MemoryCacheOptions): CacheAdapter;

export { type EmptyVenuesOptions, type MemoryCacheOptions, type NoopLLMOptions, emptyVenues, memoryCache, noopLLM };
