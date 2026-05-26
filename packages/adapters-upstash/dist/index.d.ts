import { CacheAdapter } from '@hade/core';

/**
 * @hade/adapters-upstash — clean-room CacheAdapter for Upstash Redis (REST).
 *
 * Internalizes the recovery-proxy semantics from `src/lib/hade/redis.ts:63
 * wrapForRecovery` so the adapter's `mode()` auto-clears to "FULL" the moment
 * Redis is reachable again — no timer, no restart, no per-call-site opt-in.
 *
 * Matches the legacy `getRedisMode()` semantics: degraded mode is only
 * surfaced in production (`NODE_ENV === "production"`); dev/staging always
 * report "FULL" so local sessions don't appear degraded after a transient
 * Upstash blip.
 *
 * Public surface deliberately mirrors `CacheAdapter` — get/set/mode — with no
 * Upstash-specific methods leaking out. Consumers who need Upstash's full API
 * should hold a direct `Redis` instance and pass it via `client`.
 */

declare const UPSTASH_ADAPTER_ID: "upstash@1.0.0";
interface UpstashAdapterOptions {
    /**
     * Pre-constructed Upstash client (or any duck-typed equivalent — useful for
     * tests and Cloudflare-Workers-bound Redis-compatible stores). Wins over
     * `url` / `token`.
     */
    readonly client?: UpstashClientLike;
    /** Falls back to `process.env.UPSTASH_REDIS_REST_URL`. */
    readonly url?: string;
    /** Falls back to `process.env.UPSTASH_REDIS_REST_TOKEN`. */
    readonly token?: string;
    /** Applied to `set()` calls that omit a TTL. */
    readonly defaultTtlSeconds?: number;
    /**
     * Match legacy `getRedisMode()` behavior: degraded mode only surfaces in
     * production. Defaults to `true`.
     */
    readonly productionOnlyDegradation?: boolean;
    /** Override the adapter id surfaced in logs. */
    readonly id?: string;
}
/** Minimal duck-typed shape we depend on from `@upstash/redis`. */
interface UpstashClientLike {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, opts?: {
        ex?: number;
    }): Promise<unknown>;
    del(key: string): Promise<unknown>;
}
declare function upstash(opts?: UpstashAdapterOptions): CacheAdapter;

export { UPSTASH_ADAPTER_ID, type UpstashAdapterOptions, type UpstashClientLike, upstash };
