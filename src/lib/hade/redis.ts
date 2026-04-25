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

// ─── Runtime state ────────────────────────────────────────────────────────────

/**
 * Reflects which persistence backend is active.
 * `memory` is DEV/CI-only and must never be interpreted as durable storage.
 */
export const HADE_PERSISTENCE_MODE: "redis" | "memory" = hasRedis ? "redis" : "memory";

/**
 * Process-local degraded flag. NOT sticky for the process lifetime — cleared
 * automatically by `clearRedisDegraded()` on any successful Redis operation
 * (see the recovery proxy below). Recovery is event-driven, never timed.
 */
let redisDegraded = false;

export function markRedisDegraded(): void {
  if (!redisDegraded && process.env.NODE_ENV === "production") {
    redisDegraded = true;
  }
}

/**
 * Soft recovery — clears the degraded flag once a Redis operation succeeds
 * again. Called automatically by the recovery proxy wrapping the client, so
 * call sites do not need to opt in. Safe to call when the flag is already
 * clear (no-op).
 */
export function clearRedisDegraded(): void {
  if (redisDegraded) {
    redisDegraded = false;
  }
}

// ─── Redis client (wrapped for event-driven recovery) ────────────────────────
//
// Every successful async method on the client clears the degraded flag, so the
// system returns to FULL mode the moment Redis is reachable again — no timer,
// no restart, no per-call-site opt-in. Failures continue to flow through
// `handleRedisFailure → markRedisDegraded` as before.
//
// Synchronous returns (e.g. `redis.pipeline()` builders) are passed through
// untouched: they have not performed I/O, so they must not flip recovery
// state. The resulting pipeline's `.exec()` is itself async and will clear
// the flag on success.

function wrapForRecovery<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return function (this: unknown, ...args: unknown[]) {
        const out = (value as (...a: unknown[]) => unknown).apply(target, args);
        if (out && typeof (out as PromiseLike<unknown>).then === "function") {
          return (out as Promise<unknown>).then((v) => {
            clearRedisDegraded();
            return v;
          });
        }
        return out;
      };
    },
  });
}

export const redis = hasRedis
  ? wrapForRecovery(
      new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      }),
    )
  : null;

/**
 * Structured failure context. Every Redis catch path MUST pass an `operation`
 * identifier; include `venueId`, `deviceId`, or `key` whenever they are in
 * scope so log shippers can correlate failures by entity.
 */
export interface RedisFailureContext {
  operation: string;
  venueId?:  string;
  deviceId?: string;
  key?:      string;
  [extra: string]: unknown;
}

/**
 * Single, mandatory failure-emit point for every Redis catch in the codebase.
 *
 * Always emits `[HADE_NO_REDIS]` with structured context — never bare. Always
 * marks the process as degraded in production. Callers MUST pass an
 * operation identifier; bare invocations are no longer accepted.
 */
export function handleRedisFailure(
  context: RedisFailureContext,
  error:   unknown,
): void {
  console.error("[HADE_NO_REDIS]", {
    ...context,
    error: error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : String(error),
  });
  markRedisDegraded();
}

export function getRedisMode() {
  if (redisDegraded && process.env.NODE_ENV === "production") {
    return "DEGRADED";
  }
  return "FULL";
}

/**
 * DEV ONLY — must NEVER be relied on as a substitute storage path in production.
 *
 * Returns true only when NODE_ENV !== "production". globalThis-backed Maps and
 * Sets are intended exclusively for local dev and CI; production execution must
 * always treat their absence/presence as a no-op and surface Redis failures via
 * handleRedisFailure().
 */
export function canUseGlobalFallbackStorage(): boolean {
  return process.env.NODE_ENV !== "production";
}

if (process.env.NODE_ENV === "production" && !hasRedis) {
  handleRedisFailure(
    { operation: "module_init", reason: "redis_not_configured" },
    new Error("Redis not configured in production"),
  );
}
