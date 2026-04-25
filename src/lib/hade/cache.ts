/**
 * cache.ts — Tier 2.5 offline venue cache.
 *
 * Stores the most recent set of nearby venues and their UGC LocationNode
 * weights so HADE can return a valid decision when both the upstream LLM
 * and the Places API are unavailable.
 *
 * Storage strategy (dual-environment, mirrors weights.ts pattern):
 *   • Browser  — idb-keyval (IndexedDB), persists across page loads
 *   • Node.js  — globalThis.__hadeOfflineCache (DEV / CI only)
 *
 * Contract:
 *   • setOfflineCache — always resolves, never throws
 *   • getValidCache  — always resolves, returns null on any failure
 */

import {
  canUseGlobalFallbackStorage,
  handleRedisFailure,
} from "@/lib/hade/redis";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CachedVenue = {
  id: string;
  name: string;
  geo: { lat: number; lng: number };
  rating?: number;
};

export type CachedLocationNode = {
  venue_id: string;
  weight_map: Record<string, number>;
  signal_count: number;
  last_updated: string;
};

export type CacheEntry = {
  venues: CachedVenue[];
  nodes: CachedLocationNode[];
  timestamp: number;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const CACHE_KEY = "hade:offline_cache";
const TTL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

// ─── Server-side singleton ────────────────────────────────────────────────────

// DEV ONLY. Survives Next.js hot-reloads in the same process during local work.
// Production must not rely on process memory as offline persistence.
const g = globalThis as typeof globalThis & {
  __hadeOfflineCache?: CacheEntry | null;
};

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Persists venues and their UGC nodes to the offline cache.
 * Skips silently when venues is empty — there's nothing useful to store.
 *
 * Browser  → idb-keyval (IndexedDB)
 * Node.js  → globalThis.__hadeOfflineCache
 */
export async function setOfflineCache(
  venues: CachedVenue[],
  nodes: CachedLocationNode[],
): Promise<void> {
  if (venues.length === 0) return;

  const entry: CacheEntry = { venues, nodes, timestamp: Date.now() };

  try {
    if (typeof window !== "undefined") {
      // Browser path: persist across page loads via IndexedDB
      const { set } = await import("idb-keyval");
      await set(CACHE_KEY, entry);
    } else {
      // Server path: in-process singleton (DEV ONLY)
      if (canUseGlobalFallbackStorage()) {
        g.__hadeOfflineCache = entry;
      } else {
        handleRedisFailure(
          { operation: "setOfflineCache", venueCount: venues.length, reason: "fallback_disabled_in_production" },
          new Error("Offline cache fallback disabled in production"),
        );
      }
    }
  } catch (error) {
    // Cache writes must never break the happy path — but the failure is
    // surfaced via [HADE_NO_REDIS] so a swallowed write is observable.
    handleRedisFailure(
      { operation: "setOfflineCache", venueCount: venues.length },
      error,
    );
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns the cached entry if it exists and has not expired (TTL: 6 hours).
 * Returns null when: no cache exists, TTL expired, or the entry is malformed.
 *
 * Browser  → idb-keyval (IndexedDB)
 * Node.js  → globalThis.__hadeOfflineCache
 */
export async function getValidCache(): Promise<CacheEntry | null> {
  try {
    let entry: CacheEntry | null | undefined;

    if (typeof window !== "undefined") {
      // Browser path
      const { get } = await import("idb-keyval");
      entry = await get<CacheEntry>(CACHE_KEY);
    } else {
      // Server path (DEV ONLY)
      if (canUseGlobalFallbackStorage()) {
        entry = g.__hadeOfflineCache ?? null;
      } else {
        handleRedisFailure(
          { operation: "getValidCache", reason: "fallback_disabled_in_production" },
          new Error("Offline cache fallback disabled in production"),
        );
        entry = null;
      }
    }

    if (!entry) return null;

    // TTL check
    if (Date.now() - entry.timestamp > TTL) return null;

    // Defensive shape validation — guards against corrupted IndexedDB entries
    if (
      !Array.isArray(entry.venues) ||
      !Array.isArray(entry.nodes) ||
      typeof entry.timestamp !== "number"
    ) {
      return null;
    }

    return entry;
  } catch (error) {
    // Read failure is surfaced via [HADE_NO_REDIS] so it is distinguishable
    // from a legitimate cache miss in observability.
    handleRedisFailure({ operation: "getValidCache" }, error);
    return null;
  }
}
