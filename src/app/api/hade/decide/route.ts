import { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { generateSyntheticDecision } from "@/core/engine/synthetic";
import type { GeoLocation, LocationNode, PlaceOption, ScoringWeights } from "@/types/hade";
import { getLocationWeights, locationNodeExists, createLocationNode } from "@/lib/hade/weights";
import { setOfflineCache, getValidCache } from "@/lib/hade/cache";
import type { CacheEntry, CachedVenue, CachedLocationNode } from "@/lib/hade/cache";
import { haversineDistanceMeters } from "@/lib/hade/engine";
import { getRedisMode } from "@/lib/hade/redis";
import { getNearbyUGC, ugcToPlaceOption } from "@/lib/hade/ugc";

export const runtime = "nodejs";

import { computeConfidence } from "@/lib/hade/confidence";
import { buildExplanation } from "@/lib/hade/explanation";


// ─── Configuration ───────────────────────────────────────────────────────────

const UPSTREAM_TIMEOUT_MS = 8000;

// ─── Stage result types ──────────────────────────────────────────────────────

type ParseResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string };

type ValidationResult = { ok: true } | { ok: false; error: string };

type UpstreamResult =
  | { ok: true; text: string; status: number }
  | {
      ok: false;
      reason:
        | "upstream_unreachable"
        | "upstream_timeout"
        | "upstream_error"
        | "upstream_non_json";
      detail: string;
    };

async function getDecisionNode(venueId: string): Promise<LocationNode | null> {
  const [node] = await getLocationWeights([venueId]);
  return node ?? null;
}

// ─── Degraded-state observability ────────────────────────────────────────────
//
// Wraps a JSON response body + init with the degraded contract:
//   • body.degraded            — boolean flag added to the JSON payload
//   • header x-hade-degraded   — "1" / "0" mirror for non-JSON consumers
//
// Pure observability — does not influence ranking, tier selection, or any
// decision-engine output. Captures the current process-level Redis state at
// the moment the Response is constructed via getRedisMode().
function withDegradedSignal(
  body: Record<string, unknown>,
  init: ResponseInit,
): Response {
  const degraded = getRedisMode() !== "FULL";
  const enriched = { ...body, degraded };
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) ?? {}),
    "x-hade-degraded": degraded ? "1" : "0",
  };
  return new Response(JSON.stringify(enriched), { ...init, headers });
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const reqId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  console.log(`[hade-decide ${reqId}] ← POST received`);

  try {
    // Stage 1: Parse body
    const parsed = await safeParseBody(request, reqId);
    if (!parsed.ok) {
      return fallbackResponse(reqId, "parse_error", parsed.error, null);
    }

    // Stage 2: Validate minimal shape
    const validated = validatePayload(parsed.body, reqId);
    const geoHint = extractGeo(parsed.body);
    if (!validated.ok) {
      return fallbackResponse(reqId, "validation_error", validated.error, geoHint);
    }

    // Stage 3: Inject LocationNode weights for any node_hints in the body
    const enrichedBody = await enrichWithNodeWeights(parsed.body, reqId);

    // Stage 4+5: Generate the decision (upstream call + success/fallback routing)
    return await generateDecision(enrichedBody, reqId, geoHint, startedAt);
  } catch (err) {
    // Belt-and-braces — should be unreachable because every stage catches its own errors.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[hade-decide ${reqId}] ✗ unexpected throw: ${detail}`);
    return fallbackResponse(reqId, "unexpected_error", detail, null);
  }
}

// ─── Decision generation ─────────────────────────────────────────────────────

/**
 * Three-tier decision pipeline:
 *
 *  Tier 1 — Upstream LLM  : forward to HADE_UPSTREAM_URL, inject source tag
 *  Tier 2 — Synthetic     : build a grounded decision from real Places API results
 *  Tier 3 — Static fallback: hardcoded cafe stub when all else fails
 *
 * Always returns a valid Response — never throws past this boundary.
 */
async function generateDecision(
  body: Record<string, unknown>,
  reqId: string,
  geoHint: GeoLocation | null,
  startedAt: number,
): Promise<Response> {
  try {
    // ── Tier 1: Upstream LLM ─────────────────────────────────────────────────
    const upstream = await callUpstream(body, reqId);

    if (upstream.ok) {
      const elapsed = Date.now() - startedAt;
      console.log(`[hade-decide ${reqId}] ✓ Tier 1 (llm) ok in ${elapsed}ms`);

      // Upstream body is validated JSON (checked in callUpstream) — safe to parse.
      const data = JSON.parse(upstream.text) as Record<string, unknown>;
      const decisionId = (data as { decision?: { id?: unknown } }).decision?.id;
      const decisionNode =
        typeof decisionId === "string" ? await getDecisionNode(decisionId) : null;
      const enriched = { ...data, source: "llm", fallback_places: [], decision_node: decisionNode };

      return withDegradedSignal(enriched, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-hade-source": "llm",
        },
      });
    }

    console.warn(
      `[hade-decide ${reqId}] ↓ Tier 1 failed (${upstream.reason}), trying Tier 2 (synthetic)`,
    );

    // ── Tier 2: Synthetic (real Places API candidates) ────────────────────────
    const bodyForTier2 = await injectUGCCandidates(body, geoHint, reqId);
    const synthetic = await generateSyntheticDecision(bodyForTier2, reqId, geoHint);

    if (synthetic.ok) {
      const elapsed = Date.now() - startedAt;
      console.log(
        `[hade-decide ${reqId}] ✓ Tier 2 (synthetic) ok in ${elapsed}ms` +
          ` — ${synthetic.places.length} place(s)`,
      );

      const decisionNode = await getDecisionNode(synthetic.data.decision.id);
      const debugMode =
        (body as { settings?: { debug?: unknown } }).settings?.debug === true;
      const enrichedSyntheticData = {
        ...synthetic.data,
        decision_node: decisionNode,
        ...(debugMode ? { debug: synthetic.debugPayload } : {}),
        ...(synthetic.explanation_signals
          ? { explanation_signals: synthetic.explanation_signals }
          : {}),
      };

      // ── Tier 2.5: Write offline cache (fire-and-forget, non-blocking) ────────
      void writeCacheFromSynthetic(synthetic.places, body);

      return withDegradedSignal(enrichedSyntheticData, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-hade-source": "synthetic",
        },
      });
    }

    console.warn(`[hade-decide ${reqId}] ↓ Tier 2 failed, trying Tier 2.5 (offline cache)`);

    // ── Tier 2.5: Serve from offline cache ───────────────────────────────────
    const cached = await getValidCache();
    if (cached && cached.venues.length > 0 && geoHint) {
      const offlineResponse = buildOfflineResponse(cached, geoHint, reqId, body);
      if (offlineResponse) {
        const elapsed = Date.now() - startedAt;
        console.log(`[hade-decide ${reqId}] ✓ Tier 2.5 (offline_cache) ok in ${elapsed}ms`);
        return offlineResponse;
      }
    }

    console.warn(`[hade-decide ${reqId}] ↓ Tier 2.5 failed, falling to Tier 3 (static)`);

    // ── Tier 3: Static fallback ───────────────────────────────────────────────
    return fallbackResponse(reqId, upstream.reason, upstream.detail, geoHint);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[hade-decide ${reqId}] ✗ generateDecision threw: ${detail}`);
    return fallbackResponse(reqId, "decision_error", detail, geoHint);
  }
}

// ─── Stage 3: Enrich with LocationNode weights ───────────────────────────────

/**
 * Reads node_hints from the request body and fetches any known LocationNode
 * weights from the in-process registry. Injects them as `location_nodes` so
 * the upstream LLM (or Tier 2 synthetic engine) can apply vibe-weighted scoring.
 *
 * No-ops silently if node_hints is absent or empty.
 */
async function enrichWithNodeWeights(
  body:  Record<string, unknown>,
  reqId: string,
): Promise<Record<string, unknown>> {
  const hints = (body as { node_hints?: unknown }).node_hints;
  if (!Array.isArray(hints) || hints.length === 0) return body;

  const venueIds = hints.filter((h): h is string => typeof h === "string");
  if (venueIds.length === 0) return body;

  const nodes = await getLocationWeights(venueIds);
  if (nodes.length === 0) return body;

  console.log(
    `[hade-decide ${reqId}]   ↗ injecting ${nodes.length} LocationNode(s) from hints: ${venueIds.join(",")}`,
  );

  return { ...body, location_nodes: nodes };
}

// ─── UGC candidate injection ─────────────────────────────────────────────────

/**
 * Fetches nearby UGC entities and merges them into `custom_candidates` before
 * the Tier 2 synthetic engine runs. Caller-supplied entries take precedence
 * over stored UGC when IDs collide (last-write-wins on the caller side).
 *
 * The synthetic engine's existing merge + filter + scoring pipeline runs
 * unchanged — UGC entries are indistinguishable from any other custom_candidate.
 */
async function injectUGCCandidates(
  body: Record<string, unknown>,
  geo: GeoLocation | null,
  reqId: string,
): Promise<Record<string, unknown>> {
  if (!geo) return body;

  const radiusRaw = (body as { radius_meters?: unknown }).radius_meters;
  const radius =
    typeof radiusRaw === "number" && Number.isFinite(radiusRaw) && radiusRaw > 0
      ? radiusRaw
      : 800;

  let ugcEntities;
  try {
    ugcEntities = await getNearbyUGC(geo, radius);
  } catch {
    return body;
  }

  if (ugcEntities.length === 0) return body;

  const ugcPlaces = ugcEntities.map((e) => ugcToPlaceOption(e, geo));

  // Merge: UGC first, then caller's custom_candidates overwrite on id collision.
  const callerRaw = (body as { custom_candidates?: unknown }).custom_candidates;
  const callerCandidates = Array.isArray(callerRaw) ? (callerRaw as PlaceOption[]) : [];
  const byId = new Map<string, PlaceOption>();
  for (const p of ugcPlaces)         byId.set(p.id, p);
  for (const c of callerCandidates)  byId.set(c.id, c);
  const merged = [...byId.values()];

  console.log(
    `[hade-decide ${reqId}]   ↗ injecting ${ugcPlaces.length} UGC candidate(s)` +
      ` (custom_candidates pool: ${merged.length})`,
  );

  return { ...body, custom_candidates: merged };
}

// ─── Stage 1: Parse body ─────────────────────────────────────────────────────

async function safeParseBody(
  request: NextRequest,
  reqId: string,
): Promise<ParseResult> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const summary = summarizePayload(body);
    console.log(`[hade-decide ${reqId}]   payload: ${summary}`);
    return { ok: true, body };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown parse error";
    console.warn(`[hade-decide ${reqId}] ✗ parse failed: ${error}`);
    return { ok: false, error };
  }
}

// ─── Stage 2: Validate ───────────────────────────────────────────────────────

function validatePayload(
  body: Record<string, unknown>,
  reqId: string,
): ValidationResult {
  const geo = extractGeo(body);
  if (!geo) {
    const msg = "geo is missing or invalid";
    console.warn(`[hade-decide ${reqId}] ✗ validation: ${msg}`);
    return { ok: false, error: msg };
  }

  const candidatesResult = validateCustomCandidates(body, reqId);
  if (!candidatesResult.ok) return candidatesResult;

  return { ok: true };
}

/**
 * Validates custom_candidates if present.
 *
 * Only checks the minimal contract: each entry must have a non-empty string
 * `id`, a non-empty string `name`, and a geo with finite lat/lng.
 * All other PlaceOption fields are optional — no Google-specific constraints.
 *
 * Returns { ok: true } when the field is absent (fully optional).
 * Returns { ok: false } on the first malformed entry.
 */
function validateCustomCandidates(
  body: Record<string, unknown>,
  reqId: string,
): ValidationResult {
  const raw = (body as { custom_candidates?: unknown }).custom_candidates;
  if (raw === undefined) return { ok: true };

  if (!Array.isArray(raw)) {
    const msg = "custom_candidates must be an array";
    console.warn(`[hade-decide ${reqId}] ✗ validation: ${msg}`);
    return { ok: false, error: msg };
  }

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== "object") {
      const msg = `custom_candidates[${i}]: must be an object`;
      console.warn(`[hade-decide ${reqId}] ✗ validation: ${msg}`);
      return { ok: false, error: msg };
    }

    const c = entry as Record<string, unknown>;

    if (typeof c.id !== "string" || !c.id.trim()) {
      const msg = `custom_candidates[${i}]: id must be a non-empty string`;
      console.warn(`[hade-decide ${reqId}] ✗ validation: ${msg}`);
      return { ok: false, error: msg };
    }

    if (typeof c.name !== "string" || !c.name.trim()) {
      const msg = `custom_candidates[${i}]: name must be a non-empty string`;
      console.warn(`[hade-decide ${reqId}] ✗ validation: ${msg}`);
      return { ok: false, error: msg };
    }

    if (!extractGeo(c)) {
      const msg = `custom_candidates[${i}]: geo must have finite lat and lng`;
      console.warn(`[hade-decide ${reqId}] ✗ validation: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  return { ok: true };
}

function extractGeo(body: Record<string, unknown> | null | undefined): GeoLocation | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { geo?: unknown }).geo;
  if (!raw || typeof raw !== "object") return null;
  const { lat, lng } = raw as { lat?: unknown; lng?: unknown };
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  return { lat, lng };
}

// ─── Stage 3: Upstream call ──────────────────────────────────────────────────

async function callUpstream(
  body: Record<string, unknown>,
  reqId: string,
): Promise<UpstreamResult> {
  const url = `${serverEnv.hadeUpstreamUrl}/hade/decide`;
  const headers: HeadersInit = { "Content-Type": "application/json" };

  if (serverEnv.hadeApiKey && serverEnv.hadeApiKey !== "your_secret_here") {
    headers["x-api-key"] = serverEnv.hadeApiKey;
  }

  console.log(`[hade-decide ${reqId}]   → upstream POST ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (err instanceof DOMException && err.name === "TimeoutError") {
      console.warn(
        `[hade-decide ${reqId}] ✗ upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`,
      );
      return { ok: false, reason: "upstream_timeout", detail };
    }
    console.warn(`[hade-decide ${reqId}] ✗ upstream unreachable: ${detail}`);
    return { ok: false, reason: "upstream_unreachable", detail };
  }

  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[hade-decide ${reqId}] ✗ upstream body read failed: ${detail}`);
    return { ok: false, reason: "upstream_error", detail };
  }

  if (!response.ok) {
    console.warn(
      `[hade-decide ${reqId}] ✗ upstream ${response.status}: ${text.slice(0, 200)}`,
    );
    return {
      ok: false,
      reason: "upstream_error",
      detail: `${response.status} ${response.statusText}`,
    };
  }

  // Confirm body is valid JSON before forwarding. An upstream that returns 200
  // with an HTML error page would otherwise break the client's res.json().
  try {
    JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(
      `[hade-decide ${reqId}] ✗ upstream non-JSON body: ${text.slice(0, 200)}`,
    );
    return { ok: false, reason: "upstream_non_json", detail };
  }

  return { ok: true, text, status: response.status };
}

// ─── Stage 4: Fallback response ──────────────────────────────────────────────

function fallbackResponse(
  reqId: string,
  reason: string,
  detail: string,
  geoHint: GeoLocation | null,
): Response {
  // Use caller's geo if available. A null geo here means even geo validation
  // failed — use a zero-point sentinel rather than a hardcoded city coordinate.
  const geo: GeoLocation = geoHint ?? { lat: 0, lng: 0 };

  const body = {
    decision: {
      id: `fallback-${reqId}`,
      venue_name: "A spot nearby",
      category: "venue",
      geo,
      distance_meters: 0,
      eta_minutes: 0,
      rationale: "The decision engine is temporarily unavailable — try again in a moment.",
      why_now: "Engine offline",
      confidence: 0.1,
      situation_summary: "Fallback decision — upstream engine unavailable",
    },
    context_snapshot: {
      situation_summary: "Fallback decision — upstream engine unavailable",
      interpreted_intent: "chill",
      decision_basis: "fallback" as const,
      candidates_evaluated: 0,
      llm_failure_reason: "provider_error" as const,
    },
    session_id: `fallback-${reqId}`,
    source: "static_fallback" as const,
    fallback_places: [],
    decision_node: null,
  };

  console.warn(`[hade-decide ${reqId}] ⚠ fallback (${reason}): ${detail}`);

  return withDegradedSignal(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "x-hade-source": "fallback",
      "x-hade-fallback-reason": reason,
    },
  });
}

// ─── Tier 2.5 helpers ────────────────────────────────────────────────────────

/**
 * Extracts venues and LocationNode weights from a Tier 2 result and writes
 * them to the offline cache. Fire-and-forget — called with `void`, never awaited
 * on the critical path.
 */
async function writeCacheFromSynthetic(
  places: PlaceOption[],
  body: Record<string, unknown>,
): Promise<void> {
  if (places.length === 0) return;

  // ── Cold-start seeding ────────────────────────────────────────────────────
  // For each venue with no existing LocationNode, create a trust-prior node
  // derived from its Google rating. This is a one-time initialization only:
  //   • Existing nodes are never read, modified, or overwritten.
  //   • weight_map stays empty — no synthetic vibe tags are injected.
  //   • trust_score encodes prior belief quality; UGC signals refine it later.
  for (const place of places) {
    const exists = await locationNodeExists(place.id);
    if (exists) continue;

    const rating = place.rating ?? 3.5;
    const trustScore = Math.max(0, Math.min(1, (rating - 1) / 4));

    await createLocationNode({
      venue_id: place.id,
      trust_score: trustScore,
      weight_map: {} as LocationNode["weight_map"],
      signal_count: 0,
      last_updated: new Date().toISOString(),
      version: 0,
    });
  }

  const venues: CachedVenue[] = places.map((p) => ({
    id: p.id,
    name: p.name,
    geo: p.geo,
    rating: p.rating,
  }));

  const rawNodes = (body as { location_nodes?: unknown }).location_nodes;
  const nodes: CachedLocationNode[] = Array.isArray(rawNodes)
    ? rawNodes
        .filter((n): n is Record<string, unknown> => typeof n === "object" && n !== null)
        .map((n) => ({
          venue_id: String(n["venue_id"] ?? ""),
          weight_map: (n["weight_map"] as Record<string, number>) ?? {},
          signal_count: Number(n["signal_count"] ?? 0),
          last_updated: String(n["last_updated"] ?? new Date().toISOString()),
        }))
        .filter((n) => n.venue_id.length > 0)
    : [];

  await setOfflineCache(venues, nodes);
}

/**
 * Scores cached venues by proximity + rating + UGC vibe overlay, picks the
 * best, and returns a Response shaped like a normal DecideResponse.
 *
 * Returns null if scoring produces no valid candidates (e.g. empty input).
 * Wrapped in try/catch — never throws past this boundary.
 */
function buildOfflineResponse(
  cache: CacheEntry,
  geoHint: GeoLocation,
  reqId: string,
  body: Record<string, unknown>,
): Response | null {
  try {
    const weights =
      (
        body as {
          settings?: { scoring_weights?: ScoringWeights | null };
        }
      )?.settings?.scoring_weights ?? undefined;
    const scored = cache.venues.map((venue) => {
      const dist = haversineDistanceMeters(geoHint, venue.geo);
      const proximityScore = Math.max(0, 1 - dist / 3000);
      const ratingScore = ((venue.rating ?? 3.5) - 1) / 4; // 1–5 → 0–1
      const proximityWeight = weights?.proximity ?? 0.6;
      const ratingWeight = weights?.rating ?? 0.4;
      const baseScore =
        proximityScore * proximityWeight +
        ratingScore * ratingWeight;

      // UGC overlay — matches the vibe scoring formula in synthetic.ts
      const node = cache.nodes.find((n) => n.venue_id === venue.id);
      const wValues = node ? Object.values(node.weight_map) : [];
      const vibeScore =
        wValues.length > 0
          ? wValues.reduce((s, v) => s + v, 0) / wValues.length
          : 0.5; // neutral when no UGC history
      const vibeDelta = (vibeScore - 0.5) * 0.2; // ±0.10 max

      const score = Math.max(0, Math.min(1, baseScore + vibeDelta));
      return { venue, dist, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return null;
    const decisionNode = cache.nodes.find((n) => n.venue_id === best.venue.id) ?? null;

    const responseBody = {
      decision: {
        id: best.venue.id,
        venue_name: best.venue.name,
        category: "venue",
        geo: best.venue.geo,
        distance_meters: Math.round(best.dist),
        eta_minutes: Math.max(1, Math.ceil(best.dist / 80)), // 80 m/min walking
        rationale: "Based on a recent nearby suggestion.",
        why_now: "Cached from a recent session — showing the best nearby option.",
        confidence: 0.55,
        situation_summary: "Offline cache decision",
      },
      context_snapshot: {
        situation_summary: "Offline cache decision",
        interpreted_intent: "anything",
        decision_basis: "fallback" as const,
        candidates_evaluated: cache.venues.length,
        llm_failure_reason: "provider_error" as const,
      },
      session_id: `offline-${reqId}`,
      source: "offline_cache",
      fallback_places: cache.venues,
      decision_node: decisionNode,
    };

    return withDegradedSignal(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "x-hade-source": "offline_cache",
      },
    });
  } catch {
    return null;
  }
}

// ─── Logging helpers ─────────────────────────────────────────────────────────

function summarizePayload(body: Record<string, unknown>): string {
  const geo = extractGeo(body);
  const geoStr = geo
    ? `geo=(${geo.lat.toFixed(2)},${geo.lng.toFixed(2)})`
    : "geo=missing";

  const situation = (body as { situation?: { intent?: unknown } }).situation;
  const intent = situation?.intent ?? "null";

  const persona = (body as { persona?: { id?: unknown } }).persona;
  const personaId = persona?.id ?? "none";

  const rejHistory = (body as { rejection_history?: unknown[] }).rejection_history;
  const rejCount = Array.isArray(rejHistory) ? rejHistory.length : 0;

  const customCandidates = (body as { custom_candidates?: unknown[] }).custom_candidates;
  const customCount = Array.isArray(customCandidates) ? customCandidates.length : 0;

  const customStr = customCount > 0 ? ` custom_candidates=${customCount}` : "";
  return `${geoStr} intent=${String(intent)} persona=${String(personaId)} rejections=${rejCount}${customStr}`;
}
