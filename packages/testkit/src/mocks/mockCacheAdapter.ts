import type { CacheAdapter } from "@hade/core";

export interface MockCacheAdapterOptions {
  readonly id?: string;
  readonly mode?: "FULL" | "DEGRADED";
  /** Pre-seed entries. */
  readonly initial?: Record<string, unknown>;
}

export type CacheCall =
  | { kind: "get"; key: string; hit: boolean }
  | { kind: "set"; key: string; ttlSeconds: number | undefined };

export interface MockCacheAdapter extends CacheAdapter {
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
export function mockCacheAdapter(options: MockCacheAdapterOptions = {}): MockCacheAdapter {
  const id = options.id ?? "mock_cache@1.0.0";
  const mode = options.mode ?? "FULL";
  const store = new Map<string, unknown>(Object.entries(options.initial ?? {}));
  const calls: CacheCall[] = [];

  return {
    id,
    calls,
    store,
    mode(): "FULL" | "DEGRADED" {
      return mode;
    },
    reset(): void {
      calls.length = 0;
      store.clear();
      for (const [k, v] of Object.entries(options.initial ?? {})) store.set(k, v);
    },
    async get<T>(key: string): Promise<T | null> {
      const hit = store.has(key);
      calls.push({ kind: "get", key, hit });
      return hit ? (store.get(key) as T) : null;
    },
    async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
      calls.push({ kind: "set", key, ttlSeconds });
      store.set(key, value);
    },
  };
}
