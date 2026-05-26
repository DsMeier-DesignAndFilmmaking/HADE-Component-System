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

import { Redis } from "@upstash/redis";
import type { CacheAdapter } from "@hade/core";

export const UPSTASH_ADAPTER_ID = "upstash@1.0.0" as const;

export interface UpstashAdapterOptions {
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
export interface UpstashClientLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export function upstash(opts: UpstashAdapterOptions = {}): CacheAdapter {
  const id = opts.id ?? UPSTASH_ADAPTER_ID;
  const defaultTtl = opts.defaultTtlSeconds;
  const productionOnlyDegradation = opts.productionOnlyDegradation ?? true;

  // Construct (or accept) the client. Constructor never throws; the adapter
  // simply reports "unconfigured" by returning `null`-equivalent paths when the
  // client isn't available.
  const client = resolveClient(opts);
  let degraded = false;

  function isProduction(): boolean {
    return typeof process !== "undefined" && process.env?.NODE_ENV === "production";
  }

  function markDegraded(): void {
    if (productionOnlyDegradation && !isProduction()) return;
    degraded = true;
  }

  function clearDegraded(): void {
    if (degraded) degraded = false;
  }

  return {
    id,
    mode() {
      return degraded ? "DEGRADED" : "FULL";
    },
    async get<T>(key: string): Promise<T | null> {
      if (!client) return null;
      try {
        const raw = await client.get(key);
        clearDegraded();
        return (raw ?? null) as T | null;
      } catch {
        markDegraded();
        return null;
      }
    },
    async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
      if (!client) return;
      const ex = ttlSeconds ?? defaultTtl;
      try {
        if (ex !== undefined && Number.isFinite(ex)) {
          await client.set(key, value, { ex });
        } else {
          await client.set(key, value);
        }
        clearDegraded();
      } catch {
        markDegraded();
      }
    },
  };
}

function resolveClient(opts: UpstashAdapterOptions): UpstashClientLike | null {
  if (opts.client) return opts.client;
  const url =
    opts.url ??
    (typeof process !== "undefined" && process.env
      ? process.env.UPSTASH_REDIS_REST_URL
      : undefined);
  const token =
    opts.token ??
    (typeof process !== "undefined" && process.env
      ? process.env.UPSTASH_REDIS_REST_TOKEN
      : undefined);
  if (!url || !token) return null;
  return new Redis({ url, token }) as unknown as UpstashClientLike;
}
