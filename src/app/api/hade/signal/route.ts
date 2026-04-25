/**
 * POST /api/hade/signal
 *
 * UGC VibeSignal ingest endpoint.
 *
 * Accepts a batch of VibeSignals from the client's idle-flush queue,
 * validates and sanitizes each signal, computes weight deltas, and
 * upserts the LocationNode registry for use in the next decide() call.
 *
 * Returns 202 Accepted with per-signal IDs and updated node versions.
 * Returns 400 on malformed input.
 * Returns 429 if the device or IP rate limit is exceeded.
 *
 * Never returns 5xx for partial failures — each signal is processed
 * independently; bad signals are rejected, good ones accepted.
 *
 * Auth: None (MVP). Add request signing / user token validation here in Phase 2.
 *
 * ── Abuse prevention ────────────────────────────────────────────────────────
 * Layer 1 — Request rate limit (device):  10 req / 60 s
 * Layer 2 — Request rate limit (IP):      30 req / 60 s
 * Layer 3 — Impact dampening (per venue): max 3 signals accepted per device
 *           per venue per 10 min; excess signals are silently discarded.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID }                from "crypto";
import type {
  SignalIngestRequest,
  VibeSignal,
} from "@/types/hade";
import { VIBE_TAG_SENTIMENT }        from "@/types/hade";
import {
  computeWeightDelta,
  upsertLocationNode,
}                                    from "@/lib/hade/weights";
import { preloadDeviceTrust }        from "@/lib/hade/trust";
import {
  aggregateSignals,
  filterExpiredSignals,
}                                    from "@/lib/hade/signals";
import { getRedisMode, handleRedisFailure, hasRedis, redis } from "@/lib/hade/redis";

// ─── Rate limit constants ─────────────────────────────────────────────────────

/** Layer 1: max requests per device per window. */
const DEVICE_REQ_LIMIT    = 10;
/** Layer 2: max requests per IP per window. */
const IP_REQ_LIMIT        = 30;
/** Sliding window duration for request-level rate limits (seconds). */
const RATE_WINDOW_SECS    = 60;

/** Layer 3: max accepted signals per device per venue per dampening window. */
const VENUE_SIGNAL_LIMIT  = 3;
/** Dampening window duration (10 minutes in seconds). */
const DAMPENING_WINDOW_SECS = 600;

// ─── In-memory rate limit store (dev / staging only) ─────────────────────────
//
// Module-level Map — persists across requests within the same process, but is
// cleared on restart. This is intentional: dev sessions are naturally scoped.
// In production, Redis is the sole authority.

interface MemWindow {
  count:       number;
  windowStart: number; // ms timestamp of window open
}

const memRateLimiter = new Map<string, MemWindow>();

// ─── Rate limit helpers ───────────────────────────────────────────────────────

/**
 * Increments a sliding-window counter for the given key and reports whether
 * the limit has been reached.
 *
 * Redis path:  INCR key → EXPIRE key windowSecs (set once on first write)
 * Memory path: fixed window reset when windowSecs elapses
 *
 * Returns { limited, count } — count is the new value after increment.
 */
async function incrementAndCheck(
  key:        string,
  limit:      number,
  windowSecs: number,
): Promise<{ limited: boolean; count: number }> {
  // ── Redis (production + any env with Redis configured) ────────────────────
  if (hasRedis && redis) {
    try {
      const count = await redis.incr(key);
      // Set TTL only on the first write so the window starts from the first request.
      if (count === 1) await redis.expire(key, windowSecs);
      return { limited: count > limit, count };
    } catch (error) {
      // Always log [HADE_NO_REDIS] with the specific key and operation so the
      // silent degradation from cluster-wide → per-process rate limiting is
      // visible in observability. Fallback behaviour is preserved below.
      handleRedisFailure(
        { operation: "rateLimit.incrementAndCheck", key, limit, windowSecs },
        error,
      );
    }
  }

  // ── In-memory (dev / staging without Redis OR fall-through after failure) ──
  const now     = Date.now();
  const windowMs = windowSecs * 1000;
  const existing = memRateLimiter.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    // Window expired or first request — open a fresh window
    memRateLimiter.set(key, { count: 1, windowStart: now });
    return { limited: false, count: 1 };
  }

  existing.count += 1;
  return { limited: existing.count > limit, count: existing.count };
}

/**
 * Checks whether a device has exceeded its per-venue signal influence cap.
 * Uses the same increment-and-check mechanism — every check consumes a slot,
 * so repeated calls naturally accumulate toward the limit.
 *
 * Returns true if the signal should be dampened (silently discarded).
 */
async function isVenueDampened(
  identifier: string, // deviceId ?? ip
  venueId:    string,
): Promise<boolean> {
  const key = `hade:rate:dv:${identifier}:${venueId}`;
  const { limited } = await incrementAndCheck(key, VENUE_SIGNAL_LIMIT, DAMPENING_WINDOW_SECS);
  return limited;
}

// ─── Valid VibeTag set for sanitization ───────────────────────────────────────

const VALID_VIBE_TAGS = new Set(Object.keys(VIBE_TAG_SENTIMENT));

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const reqId = randomUUID().slice(0, 8);
  const t0    = Date.now();

  console.log(`[hade-signal ${reqId}] ← POST received`);

  // ── Extract caller identifiers ─────────────────────────────────────────────
  //
  // Device ID is client-supplied and NOT trusted for auth — it is used solely
  // as a rate-limit key alongside the IP to make bulk abuse harder.
  // Missing device ID falls back to IP-only enforcement (not rejected outright).
  const deviceId = request.headers.get("x-hade-device-id") ?? null;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  // Identifier for per-venue dampening: prefer device, fall back to IP.
  const identifier = deviceId ?? ip;

  // ── Layer 1: Device rate limit (10 req / 60 s) ────────────────────────────
  if (deviceId) {
    const { limited } = await incrementAndCheck(
      `hade:rate:device:${deviceId}`,
      DEVICE_REQ_LIMIT,
      RATE_WINDOW_SECS,
    );
    if (limited) {
      console.warn("[HADE_RATE_LIMIT]", { layer: "device", deviceId, ip });
      return new NextResponse("Rate limit exceeded", {
        status: 429,
        headers: { "Retry-After": String(RATE_WINDOW_SECS) },
      });
    }
  }

  // ── Layer 2: IP rate limit (30 req / 60 s) ────────────────────────────────
  {
    const { limited } = await incrementAndCheck(
      `hade:rate:ip:${ip}`,
      IP_REQ_LIMIT,
      RATE_WINDOW_SECS,
    );
    if (limited) {
      console.warn("[HADE_RATE_LIMIT]", { layer: "ip", deviceId, ip });
      return new NextResponse("Rate limit exceeded", {
        status: 429,
        headers: { "Retry-After": String(RATE_WINDOW_SECS) },
      });
    }
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!isSignalIngestRequest(body)) {
    return NextResponse.json(
      { error: "Body must be { signals: VibeSignal[] }" },
      { status: 400 },
    );
  }

  const { signals: rawSignals, session_id } = body;

  if (rawSignals.length === 0) {
    // Vacuously persisted — nothing to write. Still surface current degraded
    // state so a client polling with empty batches can observe outage status.
    const emptyDegraded = getRedisMode() === "DEGRADED";
    return NextResponse.json(
      {
        ok:            true,
        accepted:      0,
        rejected:      0,
        signal_ids:    [],
        node_versions: {},
        persisted:     !emptyDegraded,
        degraded:      emptyDegraded,
      },
      {
        status:  202,
        headers: { "x-hade-degraded": emptyDegraded ? "1" : "0" },
      },
    );
  }

  // ── Pre-process: deduplicate + strip expired ────────────────────────────────
  const fresh   = filterExpiredSignals(rawSignals);
  const deduped = aggregateSignals(fresh) as VibeSignal[];

  console.log(
    `[hade-signal ${reqId}]   raw=${rawSignals.length}` +
    ` fresh=${fresh.length} deduped=${deduped.length}`,
  );

  // ── Validate + apply each signal ───────────────────────────────────────────
  const accepted:     string[] = [];
  // Per-signal node version. `null` indicates the upsert ran but the
  // persistence layer dropped the write (Redis degraded). Clients MUST treat
  // null as non-durable — version numbers are not faked under failure.
  const nodeVersions: Record<string, number | null> = {};

  // Tracks whether any signal in this batch failed to persist. Combined with
  // the post-loop getRedisMode() check, drives the top-level `persisted` flag.
  let anyUnpersisted = false;

  // Rejected tally: dupes and expired signals dropped in pre-processing.
  // Dampened signals are counted here too — clients get no hint about which
  // specific signals were suppressed vs. rejected for data quality reasons.
  let rejectedCount = rawSignals.length - deduped.length;

  for (const signal of deduped) {
    const result = validateAndSanitize(signal, session_id);
    if (!result.ok) {
      console.warn(`[hade-signal ${reqId}]   reject signal ${signal.id}: ${result.reason}`);
      rejectedCount += 1;
      continue;
    }

    const clean = result.signal;
    await preloadDeviceTrust(clean.source_user_id ?? "");

    // ── Layer 3: Per-venue impact dampening (max 3 / device / venue / 10 min) ─
    //
    // Checked AFTER validation so that invalid signals don't consume dampening
    // slots. Excess signals are quietly counted as rejected — no error detail
    // is returned so attackers get no signal to rotate venues or identifiers.
    const dampened = await isVenueDampened(identifier, clean.location_node_id);
    if (dampened) {
      console.warn("[HADE_RATE_LIMIT]", {
        layer:   "venue_dampening",
        deviceId,
        ip,
        venueId: clean.location_node_id,
      });
      rejectedCount += 1;
      continue;
    }

    const delta = computeWeightDelta(clean);
    const node  = await upsertLocationNode(clean.location_node_id, clean, delta);

    // Detect persistence success via Redis degraded state. `persistNode` does
    // not throw — it logs [HADE_NO_REDIS] and silently no-ops. The only
    // available signal to the route is `getRedisMode()` which flips to
    // "DEGRADED" the first time `markRedisDegraded()` is invoked in production.
    // In dev `getRedisMode()` always returns "FULL"` because local fallback
    // storage is explicitly allowed there. Production must never infer
    // durability from process memory.
    const signalPersisted = getRedisMode() !== "DEGRADED";

    accepted.push(clean.id);
    if (signalPersisted) {
      nodeVersions[clean.location_node_id] = node.version;
    } else {
      // Do NOT report a fake version increment — next read will rebuild from
      // version 0. Null tells the client this signal was received but not
      // durably persisted.
      nodeVersions[clean.location_node_id] = null;
      anyUnpersisted = true;
    }

    console.log(
      `[hade-signal ${reqId}]   accepted ${clean.id}` +
      ` venue=${clean.location_node_id} Δw=${delta.toFixed(3)}` +
      ` node.v=${signalPersisted ? node.version : "null(degraded)"}`,
    );
  }

  const ms = Date.now() - t0;

  // Whole-batch durability flag: true only if every accepted signal persisted
  // AND the process is not currently in the sticky degraded state. If any
  // call during this request flipped the flag, `persisted` reports false.
  const persisted = !anyUnpersisted && getRedisMode() !== "DEGRADED";
  const degraded  = !persisted;

  console.log(
    `[hade-signal ${reqId}] → done in ${ms}ms` +
    ` accepted=${accepted.length} rejected=${rejectedCount}` +
    ` persisted=${persisted} degraded=${degraded}`,
  );

  // Response shape extends SignalIngestResponse with the durability contract.
  // Status remains 202 in every case — the request was received and processed;
  // the `persisted`/`degraded`/`x-hade-degraded` fields communicate whether
  // the write reached durable storage. Clients MUST inspect these before
  // assuming the signal influenced future decide() calls.
  //
  // Note: `node_versions` widens to `Record<string, number | null>` to carry
  // the per-signal durability sentinel — null entries indicate the upsert ran
  // but the persistence layer dropped the write. The base SignalIngestResponse
  // type is intentionally not used as a constraint here; the shape is a
  // strict superset.
  return NextResponse.json(
    {
      ok:            true,
      accepted:      accepted.length,
      rejected:      rejectedCount,
      signal_ids:    accepted,
      node_versions: nodeVersions,
      persisted,
      degraded,
    },
    {
      status:  202,
      headers: { "x-hade-degraded": degraded ? "1" : "0" },
    },
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true;  signal: VibeSignal }
  | { ok: false; reason: string };

function validateAndSanitize(
  raw:        VibeSignal,
  sessionId?: string,
): ValidationResult {
  // Required fields
  if (!raw.location_node_id?.trim()) {
    return { ok: false, reason: "missing location_node_id" };
  }

  if (!Array.isArray(raw.vibe_tags) || raw.vibe_tags.length === 0) {
    return { ok: false, reason: "vibe_tags must be a non-empty array" };
  }

  // Sanitize tags to known enum values only
  const cleanTags = raw.vibe_tags.filter((t) => VALID_VIBE_TAGS.has(t));
  if (cleanTags.length === 0) {
    return { ok: false, reason: "no valid vibe_tags after sanitization" };
  }

  // Clamp strength to [0, 1]
  const strength = Math.max(0, Math.min(1, raw.strength ?? 0.7));

  // Derive sentiment from tag majority if not provided or invalid
  const posCount = cleanTags.filter(
    (t) => VIBE_TAG_SENTIMENT[t] === "positive",
  ).length;
  const negCount = cleanTags.length - posCount;
  const sentiment: VibeSignal["sentiment"] =
    posCount > negCount ? "positive" : negCount > posCount ? "negative" : "neutral";

  const signal: VibeSignal = {
    ...raw,
    id:               raw.id ?? `vsig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    vibe_tags:        cleanTags,
    strength,
    sentiment,
    source:           "user",
    category:         "vibe",
    shareable:        raw.shareable ?? false,
    validation_status: "approved",
  };

  // Attach session if the signal didn't carry one
  if (sessionId && !signal.source_user_id) {
    signal.source_user_id = sessionId;
  }

  return { ok: true, signal };
}

// ─── Type guard ───────────────────────────────────────────────────────────────

function isSignalIngestRequest(v: unknown): v is SignalIngestRequest {
  return (
    typeof v === "object" &&
    v !== null &&
    "signals" in v &&
    Array.isArray((v as SignalIngestRequest).signals)
  );
}
