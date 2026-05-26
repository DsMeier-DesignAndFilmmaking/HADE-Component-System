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

import type { CacheAdapter } from "../types/adapters.js";

/** Minimal shape needed from the legacy Upstash client — duck-typed. */
export interface LegacyRedisClient {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
}

export interface LegacyUpstashAdapterDeps {
  /** The wrapped Upstash client (or `null` when unconfigured). */
  readonly client: LegacyRedisClient | null;
  /** Existing `getRedisMode()` function — duck-typed return preserved. */
  readonly getMode: () => "FULL" | "DEGRADED";
  /** Default TTL in seconds applied to `set` calls that omit one. */
  readonly defaultTtlSeconds?: number;
  /** Adapter id surfaced in logs. */
  readonly id?: string;
}

export function legacyUpstashAdapter(deps: LegacyUpstashAdapterDeps): CacheAdapter {
  const id = deps.id ?? "upstash_legacy@0.0.0";
  const defaultTtl = deps.defaultTtlSeconds;
  return {
    id,
    mode() {
      return deps.getMode();
    },
    async get<T>(key: string): Promise<T | null> {
      if (!deps.client) return null;
      const raw = await deps.client.get(key);
      return (raw ?? null) as T | null;
    },
    async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
      if (!deps.client) return;
      const ex = ttlSeconds ?? defaultTtl;
      if (ex !== undefined && Number.isFinite(ex)) {
        await deps.client.set(key, value, { ex });
      } else {
        await deps.client.set(key, value);
      }
    },
  };
}
