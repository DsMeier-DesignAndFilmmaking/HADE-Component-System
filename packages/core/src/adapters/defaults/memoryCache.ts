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

import type { CacheAdapter } from "../../types/adapters.js";

export interface MemoryCacheOptions {
  readonly id?: string;
  /** Max entries before LRU eviction. Defaults to 1024. */
  readonly maxEntries?: number;
  /** Default TTL in seconds for set() calls that omit one. */
  readonly defaultTtlSeconds?: number;
}

interface Entry {
  readonly value: unknown;
  /** Epoch ms after which the entry is treated as missing. */
  readonly expiresAtMs: number;
}

export function memoryCache(options: MemoryCacheOptions = {}): CacheAdapter {
  const id = options.id ?? "memory_cache@1.0.0";
  const maxEntries = options.maxEntries ?? 1024;
  const defaultTtlSeconds = options.defaultTtlSeconds ?? Number.POSITIVE_INFINITY;

  // Map preserves insertion order — re-inserting on hit moves to most-recent.
  const store = new Map<string, Entry>();

  function evictIfNeeded(): void {
    while (store.size > maxEntries) {
      const oldest = store.keys().next();
      if (oldest.done) return;
      store.delete(oldest.value);
    }
  }

  return {
    id,
    mode() {
      return "FULL";
    },
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAtMs <= Date.now()) {
        store.delete(key);
        return null;
      }
      // Refresh LRU position.
      store.delete(key);
      store.set(key, entry);
      return entry.value as T;
    },
    async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
      const ttl = ttlSeconds ?? defaultTtlSeconds;
      const expiresAtMs =
        ttl === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Date.now() + ttl * 1000;
      if (store.has(key)) store.delete(key); // re-insert at tail
      store.set(key, { value, expiresAtMs });
      evictIfNeeded();
    },
  };
}
