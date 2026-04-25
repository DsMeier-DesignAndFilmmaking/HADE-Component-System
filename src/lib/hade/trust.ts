/**
 * trust.ts — Device trust scoring for HADE signal quality.
 *
 * Maintains a trust multiplier per device that scales the weight delta applied
 * to LocationNodes in upsertLocationNode(). Trust is earned through consistent,
 * aligned UGC contributions and degraded through conflicting signals.
 *
 * ── Safety contract ──────────────────────────────────────────────────────────
 * Every exported function is fail-safe:
 *   • If trust data is unavailable → multiplier = 1.0 (neutral, no change)
 *   • If Redis is down → in-memory fallback, never throws
 *   • If deviceId is absent or a placeholder → immediate return, no state change
 *
 * ── Hot-path performance ─────────────────────────────────────────────────────
 * safeGetTrustMultiplier() reads synchronously from an in-memory Map —
 * zero network round-trips in the scoring path. Redis writes are fire-and-forget.
 *
 * ── Storage ──────────────────────────────────────────────────────────────────
 * Reads:  in-memory Map (synchronous). On first access per device, a background
 *         Redis fetch hydrates the registry so subsequent calls reflect persisted
 *         state. First-call latency is always zero; Redis data arrives on the
 *         next scoring event for that device.
 * Writes: in-memory immediately + Redis async (best-effort, 30-day TTL)
 *
 * ── Failure mode ─────────────────────────────────────────────────────────────
 * If trust is undefined, Redis unavailable, or deviceId missing:
 *   trustMultiplier = 1.0  →  behavior identical to pre-trust-system
 */

import {
  canUseGlobalFallbackStorage,
  getRedisMode,
  handleRedisFailure,
  hasRedis,
  redis,
} from "@/lib/hade/redis";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Starting trust for any new device — neutral, no effect on weight deltas. */
export const INITIAL_TRUST = 1.0;

/** Lower bound — poorly-aligned device still contributes at 50% weight. */
export const MIN_TRUST = 0.5;

/** Upper bound — highly-aligned device contributes at 150% weight. */
export const MAX_TRUST = 1.5;

/** Redis key TTL — 30 days. */
const TRUST_TTL_SECONDS = 60 * 60 * 24 * 30;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeviceTrustRecord {
  /** Multiplier in [MIN_TRUST, MAX_TRUST]. */
  score:        number;
  /** Total UGC signal events attributed to this device. */
  signal_count: number;
  /** ISO timestamp of the most recent trust update. */
  last_updated: string;
}

// ─── In-process registry ──────────────────────────────────────────────────────
//
// Shared via globalThis so Next.js hot-reloads don't reset accumulated trust.
// Provides the synchronous read path used by safeGetTrustMultiplier().

const g = globalThis as typeof globalThis & {
  __hadeTrustRegistry?:    Map<string, DeviceTrustRecord>;
  __hadePreloadedDevices?: Set<string>;
};
if (!g.__hadeTrustRegistry) {
  g.__hadeTrustRegistry = new Map();
}
if (!g.__hadePreloadedDevices) {
  g.__hadePreloadedDevices = new Set();
}
const trustRegistry    = g.__hadeTrustRegistry;
/**
 * Tracks devices whose trust record has already been fetched from Redis in this
 * process. Shared via globalThis so Next.js hot-reloads don't trigger redundant
 * fetches. A device is marked on the FIRST preload attempt — failed fetches are
 * included so a Redis outage doesn't cause a thundering herd of retries.
 */
const preloadedDevices = g.__hadePreloadedDevices;

// ─── Utility helpers ──────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function getTrustKey(deviceId: string): string {
  return `hade:trust:${deviceId}`;
}

/**
 * Returns true for placeholder IDs that carry no device identity and should
 * never accumulate trust state.
 *
 * "server"  — emitted by getDeviceId() on SSR (window === undefined)
 * "unknown" — emitted by getDeviceId() when localStorage is blocked
 * ""        — defensive catch-all for any callers that pass empty string
 */
function isPlaceholderId(deviceId: string): boolean {
  return !deviceId || deviceId === "server" || deviceId === "unknown";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the trust multiplier for a device from the in-memory cache.
 *
 * Synchronous — reads directly from the in-process Map with zero network cost.
 * Returns INITIAL_TRUST (1.0) for any device not yet in the registry.
 *
 * Prefer safeGetTrustMultiplier() in all production call sites.
 */
export function getTrustMultiplier(deviceId: string): number {
  if (!canUseGlobalFallbackStorage() && getRedisMode() === "DEGRADED") {
    return INITIAL_TRUST;
  }
  const record = trustRegistry.get(deviceId);
  if (!record) return INITIAL_TRUST;
  return clamp(record.score, MIN_TRUST, MAX_TRUST);
}

/**
 * Fail-safe wrapper around getTrustMultiplier.
 *
 * Returns 1.0 (neutral) when:
 *   • deviceId is absent, empty, or a placeholder ("server" / "unknown")
 *   • any error is thrown by getTrustMultiplier
 *
 * This is the ONLY function that should be called in hot-path scoring code.
 * It guarantees a finite number is always returned — callers need no guard.
 *
 * Redis hydration: on the first call for a given device, a background preload
 * is fired so that subsequent scoring events within the same process reflect
 * the persisted Redis state. The sync return contract is never broken — the
 * current in-memory value (INITIAL_TRUST if unseen) is returned immediately
 * while the preload resolves. After the preload settles, all further calls
 * for that device read the hydrated, Redis-consistent value synchronously.
 */
export function safeGetTrustMultiplier(deviceId?: string): number {
  try {
    if (!deviceId) return 1.0;

    // Trigger one-time background hydration from Redis for this device.
    // preloadedDevices gate prevents concurrent or repeated fetches.
    if (!isPlaceholderId(deviceId) && !preloadedDevices.has(deviceId)) {
      void preloadDeviceTrust(deviceId);
    }

    return getTrustMultiplier(deviceId);
  } catch {
    return 1.0;
  }
}

/**
 * Updates the trust score for a device by a signed delta.
 *
 * Positive delta → signal aligned with community context → trust increases.
 * Negative delta → signal conflicts with community context → trust decreases.
 *
 * The in-memory registry is updated synchronously so that subsequent calls to
 * safeGetTrustMultiplier() within the same request see the new value.
 * Redis persistence is best-effort and never blocks the call site.
 *
 * Placeholder IDs ("server", "unknown", "") are silently ignored.
 * Never throws — safe to call with `void` (fire-and-forget).
 */
export async function updateDeviceTrust(
  deviceId: string,
  delta:    number,
): Promise<void> {
  if (isPlaceholderId(deviceId)) return;

  try {
    if (!canUseGlobalFallbackStorage() && (!hasRedis || !redis || getRedisMode() === "DEGRADED")) {
      handleRedisFailure(new Error("Redis unavailable in production"));
      return;
    }

    const existing  = trustRegistry.get(deviceId);
    const current   = existing?.score ?? INITIAL_TRUST;
    const newScore  = clamp(current + delta, MIN_TRUST, MAX_TRUST);

    const record: DeviceTrustRecord = {
      score:        newScore,
      signal_count: (existing?.signal_count ?? 0) + 1,
      last_updated: new Date().toISOString(),
    };

    // In-memory write is synchronous — future safeGetTrustMultiplier() calls
    // within the same process see the updated score immediately.
    trustRegistry.set(deviceId, record);

    // Redis write is best-effort. Failure is silently swallowed —
    // the in-memory value remains authoritative for the current process.
    if (hasRedis && redis) {
      await redis.set(getTrustKey(deviceId), record, { ex: TRUST_TTL_SECONDS });
    }
  } catch (error) {
    handleRedisFailure(error);
    // Trust updates must never propagate errors — UGC pipeline continues
    // regardless of trust infrastructure health.
  }
}

/**
 * Hydrates the in-memory trust registry from Redis for a given device.
 *
 * Called fire-and-forget by safeGetTrustMultiplier() on first access per
 * device. Restores cross-session trust continuity after server restarts.
 *
 * Merge rule — newer-wins by last_updated timestamp:
 *   • No in-memory entry (e.g. fresh restart)   → load from Redis unconditionally
 *   • Both exist, Redis is newer                → overwrite in-memory with Redis
 *   • Both exist, in-memory is current or equal → keep in-memory unchanged
 *
 * In normal operation in-memory is equal to or ahead of Redis (due to the
 * async write lag in updateDeviceTrust). After a restart Redis holds the
 * persisted record with a later timestamp than the empty in-memory state,
 * so we correctly restore historical trust from Redis.
 *
 * Deduplication: preloadedDevices is marked BEFORE the async fetch so
 * concurrent callers for the same device do not trigger parallel fetches.
 * A failed fetch is also marked — Redis outages fall through to INITIAL_TRUST
 * rather than retrying on every subsequent scoring event.
 *
 * Never throws.
 */
export async function preloadDeviceTrust(deviceId: string): Promise<void> {
  if (isPlaceholderId(deviceId)) return;

  // Mark before await — prevents concurrent fetches and thundering herd
  // under Redis pressure. Idempotent if called directly (e.g. from tests).
  preloadedDevices.add(deviceId);

  try {
    if (!hasRedis || !redis) {
      if (!canUseGlobalFallbackStorage()) {
        handleRedisFailure(new Error("Redis unavailable in production"));
      }
      return;
    }

    const raw = await redis.get<DeviceTrustRecord>(getTrustKey(deviceId));
    if (!raw || typeof raw.score !== "number") return;

    const redisRecord: DeviceTrustRecord = {
      score:        clamp(raw.score, MIN_TRUST, MAX_TRUST),
      signal_count: Math.max(0, Number(raw.signal_count ?? 0)),
      last_updated: typeof raw.last_updated === "string"
        ? raw.last_updated
        : new Date().toISOString(),
    };

    const existing = trustRegistry.get(deviceId);

    if (!existing) {
      // No in-memory entry — restore from Redis (e.g. after server restart)
      trustRegistry.set(deviceId, redisRecord);
      return;
    }

    // Both present — apply newer-wins: only overwrite if Redis is strictly ahead
    const existingTime = new Date(existing.last_updated).getTime();
    const redisTime    = new Date(redisRecord.last_updated).getTime();

    if (Number.isFinite(redisTime) && redisTime > existingTime) {
      trustRegistry.set(deviceId, redisRecord);
    }
    // else: in-memory is current or equal — leave it unchanged
  } catch (error) {
    handleRedisFailure(error);
    // Pre-warm failure is non-fatal — trust reads continue from in-memory or
    // fall through to INITIAL_TRUST. preloadedDevices is already marked so
    // this device will not retry until the process restarts.
  }
}
