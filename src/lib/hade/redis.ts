import { Redis } from "@upstash/redis";

// ─── Availability detection ───────────────────────────────────────────────────

export const hasRedis =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

// ─── Dev / staging one-time warning ──────────────────────────────────────────

if (!hasRedis && process.env.NODE_ENV !== "production") {
  console.warn(
    "[HADE_DEV_MODE] Using in-memory registry. UGC will NOT persist across sessions.",
  );
}

// ─── In-memory fallback registry (dev / staging only) ────────────────────────
//
// Shared via globalThis so that weights.ts and any other module that accesses
// __hadeNodeRegistry see the same Map instance across hot-reloads.

(globalThis as Record<string, unknown>).__hadeNodeRegistry =
  (globalThis as Record<string, unknown>).__hadeNodeRegistry || new Map();

// ─── Redis client ─────────────────────────────────────────────────────────────

export const redis = hasRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// ─── Runtime state ────────────────────────────────────────────────────────────

/** Reflects which persistence backend is active. Read by observability tooling. */
export const HADE_PERSISTENCE_MODE: "redis" | "memory" = hasRedis ? "redis" : "memory";
let redisDegraded = false;

export function markRedisDegraded(): void {
  if (!redisDegraded && process.env.NODE_ENV === "production") {
    redisDegraded = true;
  }
}

export function handleRedisFailure(error: unknown): void {
  console.error("[HADE_NO_REDIS] Redis operation failed", error);
  markRedisDegraded();
}

export function getRedisMode() {
  if (redisDegraded && process.env.NODE_ENV === "production") {
    return "DEGRADED";
  }
  return "FULL";
}

export function canUseGlobalFallbackStorage(): boolean {
  return process.env.NODE_ENV !== "production";
}

if (process.env.NODE_ENV === "production" && !hasRedis) {
  handleRedisFailure(new Error("Redis not configured in production"));
}
