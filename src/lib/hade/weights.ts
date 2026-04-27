/**
 * weights.ts — Probabilistic weight layer for LocationNode management.
 *
 * Storage strategy:
 *   • Redis (Upstash) when env vars are configured
 *   • In-memory Map fallback for local dev / CI only
 */

import type { VibeSignal, VibeTag, LocationNode } from "@/types/hade";
import { VIBE_TAG_SENTIMENT } from "@/types/hade";
import {
  canUseGlobalFallbackStorage,
  handleRedisFailure,
  hasRedis,
  redis,
} from "@/lib/hade/redis";
import {
  preloadDeviceTrust,
  safeGetTrustMultiplier,
  updateDeviceTrust,
} from "@/lib/hade/trust";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Exponential decay rate λ — halves weight impact every ~7 hours. */
const DECAY_LAMBDA = 0.1;

/** UGC signals are slightly discounted vs system signals. */
const UGC_TRUST_FACTOR = 0.8;

/** Neutral starting weight for any new tag on a fresh LocationNode. */
const NEUTRAL_WEIGHT = 0.5;

/** Redis key TTL (7 days). */
const NODE_TTL_SECONDS = 60 * 60 * 24 * 7;

// ─── In-process fallback registry — DEV ONLY ─────────────────────────────────
//
// globalThis.__hadeNodeRegistry is DEV ONLY. In production this module uses a
// process-local Map strictly as a hot cache; correctness and persistence must
// come from Redis, never from globalThis.
const g = globalThis as typeof globalThis & {
  __hadeNodeRegistry?: Map<string, LocationNode>;
};
const nodeRegistry = canUseGlobalFallbackStorage()
  ? (g.__hadeNodeRegistry ??= new Map<string, LocationNode>())
  : new Map<string, LocationNode>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes the magnitude of weight change a VibeSignal should cause.
 * Does NOT apply the sentiment sign — sign is applied per-tag in upsertLocationNode.
 *
 * @returns Δw in [0, 1]
 */
export function computeWeightDelta(signal: VibeSignal): number {
  const trustFactor = signal.source === "user" ? UGC_TRUST_FACTOR : 1.0;
  const hoursSinceEmit =
    (Date.now() - new Date(signal.emitted_at).getTime()) / 3_600_000;
  const timeFactor = Math.exp(-DECAY_LAMBDA * Math.max(0, hoursSinceEmit));

  return clamp(signal.strength * trustFactor * timeFactor, 0, 1);
}

/**
 * Upserts a LocationNode entry with the weight delta from a VibeSignal.
 * Creates a neutral node if one doesn't yet exist for this venue.
 *
 * Redis-first. Never throws.
 *
 * ── Version integrity contract ───────────────────────────────────────────────
 * The returned node's `version` (and every other mutated field) reflects the
 * post-write state ONLY when persistNode confirmed durability. On persistence
 * failure the unchanged base state is returned — no optimistic increments, no
 * phantom versions, no client desync. The base node mirrors what a subsequent
 * getStoredNode() call would observe; the two are guaranteed consistent.
 */
export async function upsertLocationNode(
  venueId: string,
  signal: VibeSignal,
  weightDelta: number,
): Promise<LocationNode> {
  const existing = await getStoredNode(venueId);
  const base = existing ?? createNeutralNode(venueId);

  await preloadDeviceTrust(signal.source_user_id ?? "");

  // ── Device trust — synchronous read, zero network cost ────────────────────
  // preMean captures the venue's weight direction BEFORE this signal so the
  // alignment check below reflects genuine agreement/conflict with prior state.
  const existingVals = Object.values(base.weight_map) as number[];
  const preMean = existingVals.length > 0
    ? existingVals.reduce((s, v) => s + v, 0) / existingVals.length
    : NEUTRAL_WEIGHT;
  const trust = safeGetTrustMultiplier(signal.source_user_id ?? undefined);

  // ── Build candidate node — DOES NOT mutate base ───────────────────────────
  // All field updates land on `candidate` so a failed persist leaves the
  // base node and any cached references untouched. Only on confirmed durable
  // write do these mutations become observable to callers.
  const candidate: LocationNode = deepCloneNode(base);

  for (const tag of signal.vibe_tags) {
    const sentimentPolarity = VIBE_TAG_SENTIMENT[tag];
    const sign = sentimentPolarity === "positive" ? 1 : -1;
    const currentWeight = candidate.weight_map[tag] ?? NEUTRAL_WEIGHT;
    candidate.weight_map[tag] = clamp(currentWeight + sign * weightDelta * trust, 0.1, 0.9);
  }

  // ── Update device trust (fire-and-forget — must not block) ─────────────────
  // Aligned = signal polarity matches the venue's existing weight direction.
  // New venues (preMean === 0.5) treat all first signals as aligned so
  // early contributors aren't penalised for pioneering a venue.
  // Trust deltas are an independent durability concern (handled inside
  // updateDeviceTrust) and are NOT gated on node persistence success.
  const sentimentPositive = signal.sentiment === "positive";
  const aligned = sentimentPositive ? preMean >= NEUTRAL_WEIGHT : preMean <= NEUTRAL_WEIGHT;
  void updateDeviceTrust(signal.source_user_id ?? "", aligned ? 0.05 : -0.05);

  const n = candidate.signal_count;
  candidate.trust_score  = clamp((candidate.trust_score * n + signal.strength) / (n + 1), 0, 1);
  candidate.signal_count = n + 1;
  candidate.last_updated = new Date().toISOString();
  candidate.version      = base.version + 1;

  // ── Write gate ─────────────────────────────────────────────────────────────
  // persistNode now reports both `success` (write occurred — Redis or memory
  // fallback) and `durable` (Redis confirmed). On `success` we return the
  // candidate so the in-process state and the returned node agree with the
  // registry. On total failure (`!success`) we return base — neither store
  // accepted the write, so the candidate is discarded.
  //
  // Cross-instance durability is the route layer's concern — it inspects
  // getRedisMode() / persistNode results to surface `x-hade-degraded` and
  // null out client-facing version fields. The client can therefore
  // distinguish a durably-bumped version from a memory-only one without
  // this function having to lie about its in-memory state.
  const { success } = await persistNode(venueId, candidate);
  if (success) {
    return deepCloneNode(candidate);
  }
  return deepCloneNode(base);
}

/**
 * Retrieves current LocationNodes for a list of venue IDs.
 * Returns only nodes that exist in storage.
 */
export async function getLocationWeights(venueIds: string[]): Promise<LocationNode[]> {
  if (venueIds.length === 0) return [];

  if (!hasRedis || !redis) {
    if (!canUseGlobalFallbackStorage()) {
      handleRedisFailure(
        { operation: "getLocationWeights", venueIds, reason: "redis_unavailable" },
        new Error("Redis unavailable in production"),
      );
      return [];
    }
    return venueIds
      .map((id) => nodeRegistry.get(id))
      .filter((n): n is LocationNode => n !== undefined)
      .map(deepCloneNode);
  }

  try {
    const nodes = await Promise.all(venueIds.map((id) => getStoredNode(id)));
    return nodes.filter((n): n is LocationNode => n !== null).map(deepCloneNode);
  } catch (error) {
    handleRedisFailure(
      { operation: "getLocationWeights", venueIds, count: venueIds.length },
      error,
    );

    if (!canUseGlobalFallbackStorage()) {
      return [];
    }

    return venueIds
      .map((id) => nodeRegistry.get(id))
      .filter((n): n is LocationNode => n !== undefined)
      .map(deepCloneNode);
  }
}

/**
 * Returns the aggregate vibe score for a venue, decayed toward neutrality (0.5)
 * as time passes since the last signal update.
 *
 * Scoring formula:
 *   rawMean      = mean of all weight_map values
 *   recencyFactor = exp(-0.15 × hoursSinceUpdate)   [1.0 when fresh → 0 when stale]
 *   score        = 0.5 + (rawMean − 0.5) × recencyFactor
 *
 * This is a read-time transformation only — weight_map is never mutated.
 * Returns 0.5 (neutral) if: no signals exist, weight_map is empty, or
 * last_updated is missing or unparseable.
 *
 * Never throws — Redis failures surface explicitly; production returns neutral
 * while dev / CI may consult the in-process cache.
 */
export async function getNodeVibeScore(venueId: string): Promise<number> {
  try {
    const node = await getStoredNode(venueId);
    if (!node || node.signal_count === 0) return NEUTRAL_WEIGHT;

    const values = Object.values(node.weight_map) as number[];
    if (values.length === 0) return NEUTRAL_WEIGHT;

    const rawMean = values.reduce((sum, v) => sum + v, 0) / values.length;

    const lastUpdated = new Date(node.last_updated).getTime();
    if (!lastUpdated || isNaN(lastUpdated)) return NEUTRAL_WEIGHT;

    const hoursSinceUpdate = Math.max(0, (Date.now() - lastUpdated) / 3_600_000);
    const recencyFactor    = Math.min(1, Math.max(0, Math.exp(-0.15 * hoursSinceUpdate)));

    const score = 0.5 + (rawMean - 0.5) * recencyFactor;
    return Math.min(1, Math.max(0, score));
  } catch (error) {
    handleRedisFailure({ operation: "getNodeVibeScore", venueId }, error);

    if (!canUseGlobalFallbackStorage()) {
      return NEUTRAL_WEIGHT;
    }

    const node = nodeRegistry.get(venueId);
    if (!node || node.signal_count === 0) return NEUTRAL_WEIGHT;

    const values = Object.values(node.weight_map) as number[];
    if (values.length === 0) return NEUTRAL_WEIGHT;

    const rawMean = values.reduce((sum, v) => sum + v, 0) / values.length;

    const lastUpdated = new Date(node.last_updated).getTime();
    if (!lastUpdated || isNaN(lastUpdated)) return NEUTRAL_WEIGHT;

    const hoursSinceUpdate = Math.max(0, (Date.now() - lastUpdated) / 3_600_000);
    const recencyFactor    = Math.min(1, Math.max(0, Math.exp(-0.15 * hoursSinceUpdate)));

    const score = 0.5 + (rawMean - 0.5) * recencyFactor;
    return Math.min(1, Math.max(0, score));
  }
}

/**
 * Returns true if a LocationNode already exists for this venue.
 * Redis-first with DEV-only in-memory fallback. Never throws — but failure is ALWAYS
 * surfaced via [HADE_NO_REDIS] so a swallowed `false` cannot masquerade as a
 * legitimate "not found".
 */
export async function locationNodeExists(venueId: string): Promise<boolean> {
  try {
    const node = await getStoredNode(venueId);
    return node !== null;
  } catch (error) {
    // getStoredNode already logs internally; this guard handles any unexpected
    // throw from outside that path (e.g. sanitization). Failure is logged so it
    // is distinguishable from a legitimate "not found" (which returns false
    // without throwing).
    handleRedisFailure(
      { operation: "locationNodeExists", venueId, outcome: "swallowed_false" },
      error,
    );
    return false;
  }
}

/**
 * Persists a pre-constructed LocationNode without modifying any existing node.
 * Intended for cold-start trust seeding only — the caller is responsible for
 * the existence guard (see locationNodeExists). Never throws.
 *
 * Failure is upgraded from console.warn to [HADE_NO_REDIS] so it is captured
 * by the same observability path as every other Redis fault.
 */
export async function createLocationNode(node: LocationNode): Promise<void> {
  try {
    await persistNode(node.venue_id, node);
  } catch (error) {
    handleRedisFailure(
      { operation: "createLocationNode", venueId: node.venue_id },
      error,
    );
  }
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

function getNodeKey(venueId: string): string {
  return `hade:node:${venueId}`;
}

async function getStoredNode(venueId: string): Promise<LocationNode | null> {
  const key = getNodeKey(venueId);

  if (!hasRedis || !redis) {
    if (!canUseGlobalFallbackStorage()) {
      handleRedisFailure(
        { operation: "getStoredNode", venueId, key, reason: "redis_unavailable" },
        new Error("Redis unavailable in production"),
      );
      return null;
    }
    const local = nodeRegistry.get(venueId);
    return local ? deepCloneNode(local) : null;
  }

  try {
    const raw = await redis.get<LocationNode>(key);
    if (!raw) {
      return null;
    }

    const parsed = sanitizeNode(raw, venueId);
    nodeRegistry.set(venueId, parsed);
    return deepCloneNode(parsed);
  } catch (error) {
    handleRedisFailure({ operation: "getStoredNode", venueId, key }, error);

    if (!canUseGlobalFallbackStorage()) {
      return null;
    }

    const local = nodeRegistry.get(venueId);
    return local ? deepCloneNode(local) : null;
  }
}

/**
 * Result of a persistNode call.
 *
 * `success` — the node was written to at least one store (Redis or the
 *             in-process nodeRegistry). When false, the write was fully
 *             dropped and the caller MUST surface the failure upstream.
 * `durable` — the Redis write succeeded. When false, the node lives only
 *             in the in-process registry and will be lost on process exit
 *             or be invisible to other instances.
 */
export interface PersistResult {
  success: boolean;
  durable: boolean;
}

/**
 * Persists `node` and reports both write occurrence and durability.
 *
 * Behavior matrix:
 *   Case A — Redis OK                      → { success: true,  durable: true  } (+ memory mirror)
 *   Case B — Redis FAIL in dev / CI        → { success: true,  durable: false } (memory fallback)
 *   Case C — Redis FAIL in production      → { success: false, durable: false }
 *   Case D — Memory mirror ALSO fails      → { success: durable, durable }
 *
 * globalThis-backed storage is DEV ONLY. In production, Redis failure is an
 * explicit dropped-write path surfaced via [HADE_NO_REDIS]; process memory is
 * never treated as durable or cross-request-correct storage.
 *
 * Never throws.
 */
async function persistNode(venueId: string, node: LocationNode): Promise<PersistResult> {
  const key = getNodeKey(venueId);

  // ── Step 1: Attempt durable Redis write ────────────────────────────────────
  let durable = false;

  if (hasRedis && redis) {
    try {
      await redis.set(key, node, { ex: NODE_TTL_SECONDS });
      durable = true;
    } catch (error) {
      // Redis configured but the write threw. Logged loudly so the silent
      // memory-only fallback below is observable in production telemetry.
      handleRedisFailure({ operation: "persistNode", venueId, key }, error);
    }
  } else if (!canUseGlobalFallbackStorage()) {
    // Production with no Redis configured — surface the misconfiguration.
    // No non-durable fallback is allowed to make this look successful.
    handleRedisFailure(
      { operation: "persistNode", venueId, key, reason: "redis_unavailable" },
      new Error("Redis unavailable in production"),
    );
  }

  if (!durable && !canUseGlobalFallbackStorage()) {
    return { success: false, durable: false };
  }

  // ── Step 2: Mirror to the in-process registry ─────────────────────────────
  // DEV ONLY fallback when Redis is absent or degraded. In production this
  // runs only as a hot-cache mirror after a durable Redis write.
  try {
    nodeRegistry.set(venueId, deepCloneNode(node));
    return { success: true, durable };
  } catch (error) {
    handleRedisFailure(
      {
        operation: "persistNode.memoryFallback",
        venueId,
        key,
        reason: durable
          ? "memory_mirror_failed_but_redis_durable"
          : "dev_memory_fallback_failed",
      },
      error,
    );
    return { success: durable, durable };
  }
}

function sanitizeNode(input: LocationNode, venueId: string): LocationNode {
  return {
    venue_id: input.venue_id || venueId,
    weight_map: sanitizeWeightMap(input.weight_map),
    trust_score: clamp(input.trust_score ?? 0, 0, 1),
    signal_count: Math.max(0, Number(input.signal_count ?? 0)),
    last_updated: typeof input.last_updated === "string" ? input.last_updated : new Date().toISOString(),
    version: Math.max(0, Number(input.version ?? 0)),
  };
}

function sanitizeWeightMap(weightMap: Record<VibeTag, number> | undefined): Record<VibeTag, number> {
  const safe = {} as Record<VibeTag, number>;
  if (!weightMap) return safe;

  for (const [tag, value] of Object.entries(weightMap)) {
    if (!isVibeTag(tag)) continue;
    safe[tag] = clamp(Number(value), 0.1, 0.9);
  }

  return safe;
}

function isVibeTag(tag: string): tag is VibeTag {
  return tag in VIBE_TAG_SENTIMENT;
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

function createNeutralNode(venueId: string): LocationNode {
  return {
    venue_id: venueId,
    weight_map: {} as Record<VibeTag, number>,
    trust_score: 0.25,
    signal_count: 0,
    last_updated: new Date().toISOString(),
    version: 0,
  };
}

function deepCloneNode(node: LocationNode): LocationNode {
  return {
    ...node,
    weight_map: { ...node.weight_map } as Record<VibeTag, number>,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
