/**
 * ugc.ts — Lightweight Redis-backed UGC entity store.
 *
 * Mirrors the LocationNode storage pattern in `weights.ts`:
 *   • Redis (Upstash) when env vars are configured
 *   • In-memory Map fallback for local dev / CI only
 *
 * Provides:
 *   • putUGC()             — write with TTL + index membership
 *   • getUGC()             — read by id
 *   • getNearbyUGC()       — bulk read filtered by haversine radius
 *   • ugcToPlaceOption()   — projection for the synthetic.ts custom_candidates
 *                            merge (no scoring/fallback changes)
 */

import type { GeoLocation, PlaceOption, UGCEntity } from "@/types/hade";
import {
  canUseGlobalFallbackStorage,
  handleRedisFailure,
  hasRedis,
  redis,
} from "@/lib/hade/redis";
import { haversineDistanceMeters } from "@/lib/hade/engine";
import type { PersistResult } from "@/lib/hade/weights";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default Redis key TTL when no `expires_at` is provided (7 days). */
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Floor on computed TTL so a near-past `expires_at` does not get rejected. */
const MIN_TTL_SECONDS = 60;

/** Redis SET tracking all live UGC ids (drift tolerated — see module header). */
const UGC_INDEX_KEY = "hade:ugc:index";

// ─── In-process fallback registry — DEV ONLY ─────────────────────────────────

const g = globalThis as typeof globalThis & {
  __hadeUgcRegistry?: Map<string, UGCEntity>;
};
const ugcRegistry = canUseGlobalFallbackStorage()
  ? (g.__hadeUgcRegistry ??= new Map<string, UGCEntity>())
  : new Map<string, UGCEntity>();

// ─── Key + TTL helpers ───────────────────────────────────────────────────────

function getUgcKey(id: string): string {
  return `hade:ugc:${id}`;
}

function computeTtlSeconds(entity: UGCEntity): number {
  if (!entity.expires_at) return DEFAULT_TTL_SECONDS;
  const expiresMs = Date.parse(entity.expires_at);
  if (!Number.isFinite(expiresMs)) return DEFAULT_TTL_SECONDS;
  const seconds = Math.floor((expiresMs - Date.now()) / 1000);
  return Math.max(MIN_TTL_SECONDS, seconds);
}

function deepCloneEntity(entity: UGCEntity): UGCEntity {
  return { ...entity, geo: { ...entity.geo } };
}

// ─── Write ───────────────────────────────────────────────────────────────────

/**
 * Persists `entity` and reports both write occurrence and durability.
 *
 * Behaviour mirrors `persistNode()` in weights.ts:
 *   Case A — Redis OK                 → { success: true,  durable: true }
 *   Case B — Redis FAIL in dev / CI   → { success: true,  durable: false }
 *   Case C — Redis FAIL in production → { success: false, durable: false }
 *
 * Never throws.
 */
export async function putUGC(entity: UGCEntity): Promise<PersistResult> {
  const key = getUgcKey(entity.id);
  const ttl = computeTtlSeconds(entity);
  let durable = false;

  if (hasRedis && redis) {
    try {
      await redis.set(key, entity, { ex: ttl });
      await redis.sadd(UGC_INDEX_KEY, entity.id);
      durable = true;
    } catch (error) {
      handleRedisFailure({ operation: "putUGC", key, ugcId: entity.id }, error);
    }
  } else if (!canUseGlobalFallbackStorage()) {
    handleRedisFailure(
      { operation: "putUGC", key, ugcId: entity.id, reason: "redis_unavailable" },
      new Error("Redis unavailable in production"),
    );
  }

  if (!durable && !canUseGlobalFallbackStorage()) {
    return { success: false, durable: false };
  }

  try {
    ugcRegistry.set(entity.id, deepCloneEntity(entity));
    return { success: true, durable };
  } catch (error) {
    handleRedisFailure(
      {
        operation: "putUGC.memoryFallback",
        key,
        ugcId: entity.id,
        reason: durable
          ? "memory_mirror_failed_but_redis_durable"
          : "dev_memory_fallback_failed",
      },
      error,
    );
    return { success: durable, durable };
  }
}

// ─── Read by id ──────────────────────────────────────────────────────────────

export async function getUGC(id: string): Promise<UGCEntity | null> {
  const key = getUgcKey(id);

  if (!hasRedis || !redis) {
    if (!canUseGlobalFallbackStorage()) {
      handleRedisFailure(
        { operation: "getUGC", key, ugcId: id, reason: "redis_unavailable" },
        new Error("Redis unavailable in production"),
      );
      return null;
    }
    const local = ugcRegistry.get(id);
    return local ? deepCloneEntity(local) : null;
  }

  try {
    const raw = await redis.get<UGCEntity>(key);
    if (!raw) return null;
    ugcRegistry.set(id, raw);
    return deepCloneEntity(raw);
  } catch (error) {
    handleRedisFailure({ operation: "getUGC", key, ugcId: id }, error);
    if (!canUseGlobalFallbackStorage()) return null;
    const local = ugcRegistry.get(id);
    return local ? deepCloneEntity(local) : null;
  }
}

// ─── Read by geo radius ──────────────────────────────────────────────────────

/**
 * Deterministic sort for UGC candidates.
 *
 * Priority:
 *   1. distance ASC   — closer venues rank first
 *   2. created_at DESC — among equidistant entities, newer wins
 *   3. id ASC          — final stable tie-breaker so Redis SMEMBERS order
 *                        never influences the result
 *
 * Sorting here, before merge and scoring, ensures that identical inputs
 * always produce identical candidate ordering regardless of Redis SET
 * iteration order.
 */
function sortUGCEntities(entities: UGCEntity[], origin: GeoLocation): UGCEntity[] {
  return [...entities].sort((a, b) => {
    const distDiff =
      haversineDistanceMeters(origin, a.geo) - haversineDistanceMeters(origin, b.geo);
    if (distDiff !== 0) return distDiff;

    const timeDiff = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (timeDiff !== 0) return timeDiff;

    return a.id.localeCompare(b.id);
  });
}

/**
 * Lists every live UGC entity within `radiusMeters` of `origin`.
 *
 * Strategy:
 *   1. SMEMBERS hade:ugc:index → candidate ids
 *   2. MGET hade:ugc:{id...}   → entities (null entries = expired/missing)
 *   3. Filter nulls + apply haversine radius in-memory
 *   4. Sort deterministically (distance ASC → created_at DESC → id ASC)
 *
 * Stale ids in the index are tolerated; they surface as null and are dropped.
 *
 * In dev or production-without-Redis, falls back to scanning the in-process
 * registry (DEV ONLY) and applying the same filter and sort.
 */
export async function getNearbyUGC(
  origin: GeoLocation,
  radiusMeters: number,
): Promise<UGCEntity[]> {
  const filterByRadius = (entities: UGCEntity[]): UGCEntity[] =>
    entities.filter((e) => haversineDistanceMeters(origin, e.geo) <= radiusMeters);

  const filterAndSort = (entities: UGCEntity[]): UGCEntity[] =>
    sortUGCEntities(filterByRadius(entities), origin);

  if (!hasRedis || !redis) {
    if (!canUseGlobalFallbackStorage()) {
      handleRedisFailure(
        { operation: "getNearbyUGC", reason: "redis_unavailable" },
        new Error("Redis unavailable in production"),
      );
      return [];
    }
    return filterAndSort([...ugcRegistry.values()].map(deepCloneEntity));
  }

  try {
    const ids = (await redis.smembers(UGC_INDEX_KEY)) as string[];
    if (!ids || ids.length === 0) return [];

    const keys = ids.map(getUgcKey);
    const raw = (await redis.mget<UGCEntity[]>(...keys)) ?? [];
    const live: UGCEntity[] = [];
    for (const entry of raw) {
      if (entry && typeof entry === "object" && entry.geo) {
        live.push(entry);
      }
    }
    return filterAndSort(live);
  } catch (error) {
    handleRedisFailure({ operation: "getNearbyUGC" }, error);
    if (!canUseGlobalFallbackStorage()) return [];
    return filterAndSort([...ugcRegistry.values()].map(deepCloneEntity));
  }
}

// ─── PlaceOption projection ──────────────────────────────────────────────────

/**
 * Projects a stored UGCEntity into the PlaceOption shape consumed by the
 * synthetic engine's `custom_candidates` merge in src/core/engine/synthetic.ts.
 *
 * Required PlaceOption fields are filled with safe defaults:
 *   • vibe       = "community" (constant tag for UGC origin)
 *   • is_open    = true (UGC entries are live until their TTL expires)
 *   • distance_meters via haversine from origin
 *
 * Optional fields (address, rating, price_level) are intentionally omitted.
 */
export function ugcToPlaceOption(
  entity: UGCEntity,
  origin: GeoLocation,
): PlaceOption {
  return {
    id: entity.id,
    name: entity.venue_name,
    category: entity.category,
    vibe: "community",
    geo: { ...entity.geo },
    distance_meters: Math.round(haversineDistanceMeters(origin, entity.geo)),
    is_open: true,
    isUGC: true,
    created_at: entity.created_at,
    ...(entity.expires_at ? { expires_at: entity.expires_at } : {}),
  };
}
