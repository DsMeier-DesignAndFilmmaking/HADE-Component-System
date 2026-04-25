/**
 * weights.ts — Probabilistic weight layer for LocationNode management.
 *
 * Storage strategy:
 *   • Redis (Upstash) when env vars are configured
 *   • In-memory Map fallback for local dev or Redis failures
 */

import type { VibeSignal, VibeTag, LocationNode } from "@/types/hade";
import { VIBE_TAG_SENTIMENT } from "@/types/hade";
import {
  canUseGlobalFallbackStorage,
  handleRedisFailure,
  hasRedis,
  redis,
} from "@/lib/hade/redis";
import { safeGetTrustMultiplier, updateDeviceTrust } from "@/lib/hade/trust";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Exponential decay rate λ — halves weight impact every ~7 hours. */
const DECAY_LAMBDA = 0.1;

/** UGC signals are slightly discounted vs system signals. */
const UGC_TRUST_FACTOR = 0.8;

/** Neutral starting weight for any new tag on a fresh LocationNode. */
const NEUTRAL_WEIGHT = 0.5;

/** Redis key TTL (7 days). */
const NODE_TTL_SECONDS = 60 * 60 * 24 * 7;

// ─── In-process fallback registry ────────────────────────────────────────────

const g = globalThis as typeof globalThis & {
  __hadeNodeRegistry?: Map<string, LocationNode>;
};
if (!g.__hadeNodeRegistry) {
  g.__hadeNodeRegistry = new Map<string, LocationNode>();
}
const nodeRegistry = g.__hadeNodeRegistry;

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
 * Redis-first with in-memory fallback. Never throws.
 */
export async function upsertLocationNode(
  venueId: string,
  signal: VibeSignal,
  weightDelta: number,
): Promise<LocationNode> {
  let node = await getStoredNode(venueId);
  if (!node) {
    node = createNeutralNode(venueId);
  }

  // ── Device trust — synchronous read, zero network cost ────────────────────
  // preMean captures the venue's weight direction BEFORE this signal so the
  // alignment check below reflects genuine agreement/conflict with prior state.
  const existingVals = Object.values(node.weight_map) as number[];
  const preMean = existingVals.length > 0
    ? existingVals.reduce((s, v) => s + v, 0) / existingVals.length
    : NEUTRAL_WEIGHT;
  const trust = safeGetTrustMultiplier(signal.source_user_id ?? undefined);

  for (const tag of signal.vibe_tags) {
    const sentimentPolarity = VIBE_TAG_SENTIMENT[tag];
    const sign = sentimentPolarity === "positive" ? 1 : -1;
    const currentWeight = node.weight_map[tag] ?? NEUTRAL_WEIGHT;
    node.weight_map[tag] = clamp(currentWeight + sign * weightDelta * trust, 0.1, 0.9);
  }

  // ── Update device trust (fire-and-forget — must not block) ─────────────────
  // Aligned = signal polarity matches the venue's existing weight direction.
  // New venues (preMean === 0.5) treat all first signals as aligned so
  // early contributors aren't penalised for pioneering a venue.
  const sentimentPositive = signal.sentiment === "positive";
  const aligned = sentimentPositive ? preMean >= NEUTRAL_WEIGHT : preMean <= NEUTRAL_WEIGHT;
  void updateDeviceTrust(signal.source_user_id ?? "", aligned ? 0.05 : -0.05);

  const n = node.signal_count;
  node.trust_score = clamp((node.trust_score * n + signal.strength) / (n + 1), 0, 1);
  node.signal_count = n + 1;
  node.last_updated = new Date().toISOString();
  node.version += 1;

  await persistNode(venueId, node);
  return deepCloneNode(node);
}

/**
 * Retrieves current LocationNodes for a list of venue IDs.
 * Returns only nodes that exist in storage.
 */
export async function getLocationWeights(venueIds: string[]): Promise<LocationNode[]> {
  if (venueIds.length === 0) return [];

  if (!hasRedis || !redis) {
    if (!canUseGlobalFallbackStorage()) {
      handleRedisFailure(new Error("Redis unavailable in production"));
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
    handleRedisFailure(error);

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
 * Never throws — Redis failures fall back to in-memory, then neutral.
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
    handleRedisFailure(error);

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
 * Redis-first with in-memory fallback. Never throws.
 */
export async function locationNodeExists(venueId: string): Promise<boolean> {
  try {
    const node = await getStoredNode(venueId);
    return node !== null;
  } catch {
    // getStoredNode already catches internally; this is a belt-and-braces guard.
    // Returning false on failure is safe: the worst case is a redundant seed write.
    return false;
  }
}

/**
 * Persists a pre-constructed LocationNode without modifying any existing node.
 * Intended for cold-start trust seeding only — the caller is responsible for
 * the existence guard (see locationNodeExists). Never throws.
 */
export async function createLocationNode(node: LocationNode): Promise<void> {
  try {
    await persistNode(node.venue_id, node);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[weights] createLocationNode failed for ${node.venue_id}: ${detail}`);
  }
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

function getNodeKey(venueId: string): string {
  return `hade:node:${venueId}`;
}

async function getStoredNode(venueId: string): Promise<LocationNode | null> {
  if (!hasRedis || !redis) {
    if (!canUseGlobalFallbackStorage()) {
      handleRedisFailure(new Error("Redis unavailable in production"));
      return null;
    }
    const local = nodeRegistry.get(venueId);
    return local ? deepCloneNode(local) : null;
  }

  try {
    const raw = await redis.get<LocationNode>(getNodeKey(venueId));
    if (!raw) {
      const local = nodeRegistry.get(venueId);
      return local ? deepCloneNode(local) : null;
    }

    const parsed = sanitizeNode(raw, venueId);
    nodeRegistry.set(venueId, parsed);
    return deepCloneNode(parsed);
  } catch (error) {
    handleRedisFailure(error);

    if (!canUseGlobalFallbackStorage()) {
      return null;
    }

    const local = nodeRegistry.get(venueId);
    return local ? deepCloneNode(local) : null;
  }
}

async function persistNode(venueId: string, node: LocationNode): Promise<void> {
  if (canUseGlobalFallbackStorage()) {
    nodeRegistry.set(venueId, deepCloneNode(node));
  }

  if (!hasRedis || !redis) {
    if (!canUseGlobalFallbackStorage()) {
      handleRedisFailure(new Error("Redis unavailable in production"));
    }
    return;
  }

  try {
    await redis.set(getNodeKey(venueId), node, { ex: NODE_TTL_SECONDS });
  } catch (error) {
    handleRedisFailure(error);
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
    trust_score: 0,
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
