import { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { generateSyntheticDecision } from "@/core/engine/synthetic";
import type { GeoLocation, GeoSource, LocationNode, ScoringWeights, SpontaneousObject, HadeDebugPayload, DecideResponse } from "@/types/hade";
import { getLocationWeights, locationNodeExists, createLocationNode } from "@/lib/hade/weights";
import { setOfflineCache, getValidCache } from "@/lib/hade/cache";
import type { CacheEntry, CachedVenue, CachedLocationNode } from "@/lib/hade/cache";
import { haversineDistanceMeters } from "@/lib/hade/engine";
import { getRedisMode } from "@/lib/hade/redis";
import { fetchNearbyGrounded } from "@/core/services/places";
import { RADIUS } from "@/core/constants/radius";
import { LENS_PROFILES, getLensProfile, type LensProfile } from "@/lib/hade/lensProfiles";

export const runtime = "nodejs";

import { computeConfidence } from "@/lib/hade/confidence";
import { buildExplanation } from "@/lib/hade/explanation";
import { assertDecisionValid, extractSafeCopyPatch } from "./validateDecision";


// ─── Configuration ───────────────────────────────────────────────────────────

const UPSTREAM_TIMEOUT_MS = 8000;
const COPY_ENHANCE_TIMEOUT_MS = 1500;

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

// ─── Deterministic provenance ────────────────────────────────────────────────

type ProvenanceSource = "places" | "ugc" | "synthetic" | "offline" | "static";

/**
 * Derives the authoritative source label for the winning candidate and
 * packages it with the composite score and ranking reason. Added to every
 * response that comes from the deterministic engine (Tier 1 and cold-start).
 *
 * source resolution:
 *   ugc_event type         → "ugc"
 *   google_places source   → "places"
 *   everything else        → "synthetic"
 */
function buildDecisionProvenance(result: {
  data: DecideResponse;
  debugPayload: HadeDebugPayload;
}): {
  candidate_id: string;
  source: ProvenanceSource;
  score: number | null;
  ranking_reason: string | null;
} {
  const decision = result.data.decision;

  let source: ProvenanceSource = "synthetic";
  if (decision.type === "ugc_event") {
    source = "ugc";
  } else if (
    decision.source === "google_places" ||
    decision.source === "google_places_fallback"
  ) {
    source = "places";
  }

  return {
    candidate_id: decision.id,
    source,
    score: result.debugPayload.scoring_breakdown?.[0]?.final_score ?? null,
    ranking_reason: result.debugPayload.final_reasoning ?? null,
  };
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

// ─── Fallback candidate builder ───────────────────────────────────────────────

const STATIC_FALLBACK_TITLES = [
  "Take a walk nearby",
  "Grab coffee nearby",
  "Explore this area",
] as const;

function normalizeFallbackToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function extractStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function extractRejectedFallbackTitles(body?: Record<string, unknown> | null): Set<string> {
  const raw = body?.rejection_history;
  if (!Array.isArray(raw)) return new Set();

  const titles = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const venueName = (entry as { venue_name?: unknown }).venue_name;
      return typeof venueName === "string" ? venueName.trim().toLowerCase() : null;
    })
    .filter((title): title is string => typeof title === "string" && title.length > 0);

  return new Set(titles);
}

function resolveStaticFallbackProfile(body?: Record<string, unknown> | null): LensProfile {
  const categories = extractStringArray(body?.candidate_categories).map(normalizeFallbackToken);
  if (categories.length > 0) {
    const categorySet = new Set(categories);
    let bestProfile: LensProfile | null = null;
    let bestScore = 0;

    for (const profile of Object.values(LENS_PROFILES)) {
      const score = profile.candidateCategories
        .map(normalizeFallbackToken)
        .filter((category) => categorySet.has(category))
        .length;
      if (score > bestScore) {
        bestProfile = profile;
        bestScore = score;
      }
    }

    if (bestProfile) return bestProfile;
  }

  const mode = typeof body?.mode === "string" ? body.mode : undefined;
  return getLensProfile(mode);
}

function buildStaticFallbackTitles(body?: Record<string, unknown> | null): {
  profile: LensProfile;
  titles: string[];
} {
  const profile = resolveStaticFallbackProfile(body);
  const rejectedTitles = extractRejectedFallbackTitles(body);
  const lensTitles = profile.fallbackHints.filter((title) => !rejectedTitles.has(title.toLowerCase()));
  const genericTitles = STATIC_FALLBACK_TITLES.filter((title) => !rejectedTitles.has(title.toLowerCase()));
  const titles = lensTitles.length > 0 ? lensTitles : genericTitles;

  return {
    profile,
    titles: titles.length > 0 ? titles : [...profile.fallbackHints],
  };
}

/**
 * Returns at least 1 SpontaneousObject for use as fallback candidates.
 *
 * Resolution order:
 *   1. Fetch real nearby places via Google Places API
 *   2. If Places fails or returns nothing, emit 3 static synthetic objects
 *
 * The `fallback-` prefix on static IDs is intentional — the client's pivot
 * guard refuses to add fallback IDs to rejection_history, preventing loops.
 */
async function buildFallbackCandidates(
  geo: GeoLocation | null,
  reqId: string,
  geoSource: GeoSource,
  body?: Record<string, unknown> | null,
): Promise<SpontaneousObject[]> {
  const now = Date.now();

  // Only call Places when we have a verified real location. "unknown" geo means
  // the coordinate is a fake default — fetching Places with it would return
  // venues from the wrong city entirely.
  if (geo && geoSource !== "unknown") {
    try {
      console.log("[HADE TRACE] Places fetch executing at: src/app/api/hade/decide/route.ts", {
        geo,
        radius_meters: RADIUS.SEARCH_DEFAULT,
        open_now: true,
        caller: "buildFallbackCandidates",
      });
      const places = await fetchNearbyGrounded({ geo, radius_meters: RADIUS.SEARCH_DEFAULT, open_now: true });
      if (places.length > 0) {
        console.log(`[hade-decide ${reqId}] fallback: resolved ${places.length} place(s) from Google`);
        return places.map((place) => ({
          id: place.id,
          type: "place_opportunity" as const,
          title: place.name,
          time_window: { start: now, end: now + 60 * 60 * 1000 },
          location: { lat: place.geo.lat, lng: place.geo.lng, place_id: place.id },
          radius: Math.round(haversineDistanceMeters(geo, place.geo)),
          going_count: 0,
          maybe_count: 0,
          user_state: null,
          created_at: now,
          expires_at: now + 60 * 60 * 1000,
          trust_score: place.rating !== undefined
            ? Math.max(0, Math.min(1, (place.rating - 1) / 4))
            : 0.5,
          vibe_tag: place.vibe,
          source: "google_places_fallback",
        }));
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[hade-decide ${reqId}] fallback: Google Places failed: ${detail}`);
    }
  }

  // Static synthetic floor — guaranteed >= 1. This is last-resort only: Places,
  // synthetic ranking, UGC, and offline cache all get earlier chances to win.
  const staticFallback = buildStaticFallbackTitles(body);
  console.log(`[hade-decide ${reqId}] fallback: using ${staticFallback.titles.length} ${staticFallback.profile.id} static synthetic object(s)`);
  return staticFallback.titles.map((title, i) => ({
    id: `fallback-static-${i}-${now}`,
    type: "place_opportunity" as const,
    title,
    time_window: { start: now, end: now + 60 * 60 * 1000 },
    location: { lat: geo?.lat ?? 0, lng: geo?.lng ?? 0 },
    radius: RADIUS.FALLBACK_STATIC,
    going_count: 0,
    maybe_count: 0,
    user_state: null,
    created_at: now,
    expires_at: now + 60 * 60 * 1000,
    trust_score: 0.5,
    vibe_tag: staticFallback.profile.id,
    source: `static_synthetic:${staticFallback.profile.id}`,
  }));
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
      console.log("[HADE FALLBACK TRIGGER]", { reason: "INVALID_RESPONSE", error: parsed.error });
      return await fallbackResponse(reqId, "parse_error", parsed.error, null, "unknown");
    }

    // Stage 2: Validate minimal shape
    const validated = validatePayload(parsed.body, reqId);
    const geoHint = extractGeo(parsed.body);
    const geoSource = extractGeoSource(parsed.body);
    if (!validated.ok) {
      console.log("[HADE FALLBACK TRIGGER]", { reason: "INVALID_RESPONSE", error: validated.error });
      return await fallbackResponse(reqId, "validation_error", validated.error, geoHint, geoSource, parsed.body);
    }

    console.log(`[hade-decide ${reqId}]   geo_source=${geoSource}`);

    // Stage 3: Inject LocationNode weights for any node_hints in the body
    const enrichedBody = await enrichWithNodeWeights(parsed.body, reqId);

    // Stage 4+5: Generate the decision (upstream call + success/fallback routing)
    return await generateDecision(enrichedBody, reqId, geoHint, geoSource, startedAt);
  } catch (err) {
    // Belt-and-braces — should be unreachable because every stage catches its own errors.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[hade-decide ${reqId}] ✗ unexpected throw: ${detail}`);
    console.log("[HADE FALLBACK TRIGGER]", { reason: "LLM_ERROR", error: detail });
    return await fallbackResponse(reqId, "unexpected_error", detail, null, "unknown");
  }
}

// ─── Decision generation ─────────────────────────────────────────────────────

/**
 * Three-tier decision pipeline (deterministic-first):
 *
 *  Cold-start — real-world context → synthetic engine → Places/UGC → ranking
 *               → deterministic card (no intent / no signals / no rejections)
 *  Tier 1 — Synthetic     : Places/UGC candidates → ranking/filtering
 *                           → selected candidate (authoritative for ALL paths)
 *  Tier 2 — Offline cache : scored cached venues when Tier 1 fails
 *  Tier 3 — Static fallback: guaranteed non-null SpontaneousObject, always 200
 *
 * Upstream/LLM is never the primary decision authority. It may be used for
 * optional copy enhancement after candidate selection in a future iteration.
 *
 * Always returns a valid Response with a non-null decision — never throws past
 * this boundary and never emits a 503.
 */
async function generateDecision(
  body: Record<string, unknown>,
  reqId: string,
  geoHint: GeoLocation | null,
  geoSource: GeoSource,
  startedAt: number,
): Promise<Response> {
  try {
    // ── Cold-start guard (before any external call) ───────────────────────────
    const intent = (body as { situation?: { intent?: unknown } }).situation?.intent;
    const signals = (body as { signals?: unknown[] }).signals;
    const rejectionHistory = (body as { rejection_history?: unknown[] }).rejection_history;

    const isColdStart =
      !intent &&
      (!Array.isArray(signals) || signals.length === 0) &&
      (!Array.isArray(rejectionHistory) || rejectionHistory.length === 0);

    console.log(`[HADE DECIDE INPUT] reqId=${reqId}`, {
      hasGeo: !!geoHint,
      lat: geoHint?.lat ?? null,
      lng: geoHint?.lng ?? null,
      geoSource,
      mode: (body as { mode?: unknown }).mode ?? "default",
      isColdStart,
      signal_count: (Array.isArray(signals) ? signals : []).length,
      rejection_history_count: (Array.isArray(rejectionHistory) ? rejectionHistory : []).length,
      candidate_categories: (body as { candidate_categories?: unknown }).candidate_categories ?? null,
      hasGoogleKey: !!serverEnv.googleApiKey,
    });

    if (isColdStart) {
      console.log(`[hade-decide ${reqId}] cold start — attempting Places fetch before fallback`);

      // Skip Places when geo is unknown — avoids returning SF venues to non-SF users.
      if (geoHint && geoSource !== "unknown") {
        let coldStartSynthetic: Awaited<ReturnType<typeof generateSyntheticDecision>>;
        try {
          coldStartSynthetic = await generateSyntheticDecision(body, reqId, geoHint);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          console.warn(`[hade-decide ${reqId}] ✗ cold-start synthetic threw: ${detail}`);
          coldStartSynthetic = { ok: false };
        }

        if (coldStartSynthetic.ok) {
          const decisionValid = assertDecisionValid(
            coldStartSynthetic.data.decision,
            coldStartSynthetic.data.decision.id,
            reqId,
          );

          if (decisionValid) {
            const elapsed = Date.now() - startedAt;
            console.log(
              `[hade-decide ${reqId}] ✓ cold-start Places ok in ${elapsed}ms` +
                ` — ${coldStartSynthetic.objects.length} object(s)`,
            );
            const decisionNode = await getDecisionNode(coldStartSynthetic.data.decision.id);
            const debugMode =
              (body as { settings?: { debug?: unknown } }).settings?.debug === true;
            const enrichedColdStart = {
              ...coldStartSynthetic.data,
              source: "cold_start_synthetic",
              decision_node: decisionNode,
              decision_provenance: buildDecisionProvenance(coldStartSynthetic),
              ...(debugMode ? { debug: coldStartSynthetic.debugPayload } : {}),
              ...(coldStartSynthetic.explanation_signals
                ? { explanation_signals: coldStartSynthetic.explanation_signals }
                : {}),
            };
            void writeCacheFromSynthetic(coldStartSynthetic.objects, body);
            return withDegradedSignal(enrichedColdStart, {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "x-hade-source": "cold_start_synthetic",
              },
            });
          }

          console.log("[HADE DECISION VALIDATION] fallback_used", {
            reqId,
            decision_id: coldStartSynthetic.data.decision.id,
            tier: "cold_start",
          });
          console.warn(
            `[hade-decide ${reqId}] ✗ cold-start decision invalid, falling to cold_start_fallback`,
          );
        }
      }

      if (geoSource === "unknown") {
        console.warn(`[hade-decide ${reqId}] cold start — geo_source=unknown; skipping Places to avoid fake-location results`);
      } else {
        console.warn("[HADE] Falling back due to no places");
      }
      console.log(`[hade-decide ${reqId}] cold start — no places available, returning cold_start_fallback`);
      const candidates = await buildFallbackCandidates(geoHint, reqId, geoSource, body);
      return new Response(
        JSON.stringify({
          decision: { ...candidates[0], is_fallback: true },
          fallback_places: candidates,
          source: "cold_start_fallback",
          degraded: true,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-hade-source": "cold_start_fallback",
            "x-hade-degraded": "1",
          },
        },
      );
    }

    // ── Tier 1: Deterministic candidate selection (Places/UGC → ranking) ──────
    // Skipped when geo_source is "unknown" — no real coordinates means Places
    // would return venues near a fake default location (e.g. San Francisco).
    let synthetic: Awaited<ReturnType<typeof generateSyntheticDecision>>;
    if (geoSource === "unknown") {
      console.warn(`[hade-decide ${reqId}] ↓ Tier 1 skipped — geo_source=unknown (no real location)`);
      synthetic = { ok: false, reason: "unknown_geo" };
    } else {
      try {
        synthetic = await generateSyntheticDecision(body, reqId, geoHint);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.warn(`[hade-decide ${reqId}] ✗ generateSyntheticDecision threw: ${detail}`);
        synthetic = { ok: false };
      }
    }

    if (synthetic.ok) {
      const decisionValid = assertDecisionValid(
        synthetic.data.decision,
        synthetic.data.decision.id,
        reqId,
      );

      if (decisionValid) {
        const elapsed = Date.now() - startedAt;
        console.log(
          `[hade-decide ${reqId}] ✓ Tier 1 (synthetic) ok in ${elapsed}ms` +
            ` — ${synthetic.objects.length} object(s)`,
        );

        const decisionNode = await getDecisionNode(synthetic.data.decision.id);
        const debugMode =
          (body as { settings?: { debug?: unknown } }).settings?.debug === true;

        // ── Copy enhancement (non-blocking, silent fallback) ─────────────────
        const copyPatch = await enhanceCopyWithLLM(synthetic.data.decision, body, reqId);

        const enrichedData = {
          ...synthetic.data,
          decision: copyPatch
            ? { ...synthetic.data.decision, ...copyPatch }
            : synthetic.data.decision,
          decision_node: decisionNode,
          decision_provenance: buildDecisionProvenance(synthetic),
          ...(debugMode ? { debug: synthetic.debugPayload } : {}),
          ...(synthetic.explanation_signals
            ? { explanation_signals: synthetic.explanation_signals }
            : {}),
        };

        void writeCacheFromSynthetic(synthetic.objects, body);

        return withDegradedSignal(enrichedData, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-hade-source": "synthetic",
            ...(copyPatch ? { "x-hade-copy-enhanced": "1" } : {}),
          },
        });
      }

      // Engine produced a result but the decision failed validation — fall through
      console.warn("[HADE] Falling back due to validation failure");
      console.log("[HADE DECISION VALIDATION] fallback_used", {
        reqId,
        decision_id: synthetic.data.decision.id,
        tier: "tier1",
      });
      console.warn(
        `[hade-decide ${reqId}] ↓ Tier 1 decision invalid, trying Tier 2 (offline cache)`,
      );
    } else {
      // Engine itself failed to produce any candidate
      console.warn("[HADE] Falling back due to no places");
      console.log("[HADE FALLBACK TRIGGER]", { reason: "SYNTHETIC_FAILED", error: synthetic.reason ?? null });
      console.warn(
        `[hade-decide ${reqId}] ↓ Tier 1 (synthetic) failed, trying Tier 2 (offline cache)`,
      );
    }

    // ── Tier 2: Offline cache ─────────────────────────────────────────────────
    let cached: CacheEntry | null = null;
    try {
      cached = await getValidCache();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[hade-decide ${reqId}] ✗ getValidCache threw: ${detail}`);
    }

    // Tier 2 requires real geo to find nearby cached venues — skip when unknown.
    if (cached && cached.venues.length > 0 && geoHint && geoSource !== "unknown") {
      const offlineResponse = buildOfflineResponse(cached, geoHint, reqId, body);
      if (offlineResponse) {
        const elapsed = Date.now() - startedAt;
        console.log(`[hade-decide ${reqId}] ✓ Tier 2 (offline_cache) ok in ${elapsed}ms`);
        return offlineResponse;
      }
    }

    console.warn("[HADE] Falling back due to no places");
    console.log("[HADE FALLBACK TRIGGER]", { reason: "EMPTY_DECISION", error: null });
    console.warn(`[hade-decide ${reqId}] ↓ Tier 2 (offline_cache) failed, falling to Tier 3 (static)`);

    // ── Tier 3: Static fallback — always 200, never null ─────────────────────
    return await fallbackResponse(
      reqId,
      "synthetic_failed",
      !synthetic.ok ? (synthetic.reason ?? "no_candidates") : "validation_failed",
      geoHint,
      geoSource,
      body,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[hade-decide ${reqId}] ✗ generateDecision threw: ${detail}`);
    console.log("[HADE FALLBACK TRIGGER]", { reason: "LLM_ERROR", error: detail });
    return await fallbackResponse(reqId, "decision_error", detail, geoHint, geoSource, body);
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
 * Only checks the minimal SpontaneousObject contract: each entry must have a
 * non-empty string `id`, a non-empty string `title`, a valid `type`, and a
 * location with finite lat/lng.
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

    if (c.type !== "ugc_event" && c.type !== "place_opportunity") {
      const msg = `custom_candidates[${i}]: type must be ugc_event or place_opportunity`;
      console.warn(`[hade-decide ${reqId}] ✗ validation: ${msg}`);
      return { ok: false, error: msg };
    }

    if (typeof c.title !== "string" || !c.title.trim()) {
      const msg = `custom_candidates[${i}]: title must be a non-empty string`;
      console.warn(`[hade-decide ${reqId}] ✗ validation: ${msg}`);
      return { ok: false, error: msg };
    }

    const location = c.location;
    const lat = location && typeof location === "object" ? (location as { lat?: unknown }).lat : null;
    const lng = location && typeof location === "object" ? (location as { lng?: unknown }).lng : null;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      const msg = `custom_candidates[${i}]: location must have finite lat and lng`;
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

function extractGeoSource(body: Record<string, unknown> | null | undefined): GeoSource {
  if (!body) return "unknown";
  const raw = (body as { geo_source?: unknown }).geo_source;
  if (raw === "browser" || raw === "ip" || raw === "stored" || raw === "scenario") return raw;
  return "unknown";
}

// ─── Stage 3: Copy enhancement ───────────────────────────────────────────────

/**
 * Calls the OpenAI chat completions API with a constrained prompt that contains
 * only copy-safe context (venue name, category, distance, mode, intent).
 *
 * The LLM may return ONLY: rationale, why_now, why_this, decision_frame.
 * Any attempt to change venue identity is caught by extractSafeCopyPatch.
 * Returns null on any failure so the caller uses deterministic copy unchanged.
 */
async function enhanceCopyWithLLM(
  decision: import("@/types/hade").HadeDecision,
  body: Record<string, unknown>,
  reqId: string,
): Promise<Pick<import("@/types/hade").HadeDecision, "rationale" | "why_now" | "why_this" | "decision_frame"> | null> {
  if (!serverEnv.openAiApiKey) return null;

  const mode    = (body as { mode?: unknown }).mode;
  const intent  = (body as { situation?: { intent?: unknown } }).situation?.intent;

  const systemPrompt =
    "You are a terse, evocative copy writer for a spontaneous-decision app.\n" +
    "Your only job: write contextually-grounded copy for an already-selected venue card.\n" +
    "RULES — you MUST follow all of them:\n" +
    "• Do NOT change the venue name, category, or invent facts not provided.\n" +
    "• rationale: 1–2 sentences (≤280 chars) referencing a specific context factor.\n" +
    "• why_now: ≤120 chars explaining what makes this right at this exact moment.\n" +
    "• why_this: ≤60 chars, a scannable micro-reason (≤12 words).\n" +
    "• decision_frame: 1 sentence (≤180 chars) framing this as a recommendation.\n" +
    "Respond ONLY with valid JSON containing these four keys. No markdown, no extra keys.";

  const userContent = JSON.stringify({
    venue:          decision.venue_name,
    category:       decision.category,
    distance_meters: decision.distance_meters,
    mode:           typeof mode   === "string" ? mode   : "dining",
    intent:         typeof intent === "string" ? intent : null,
    current_copy: {
      rationale:      decision.rationale,
      why_now:        decision.why_now,
    },
  });

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${serverEnv.openAiApiKey}`,
      },
      body: JSON.stringify({
        model:           "gpt-4o-mini",
        temperature:     0.7,
        max_tokens:      260,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userContent  },
        ],
        response_format: { type: "json_object" },
      }),
      cache:  "no-store",
      signal: AbortSignal.timeout(COPY_ENHANCE_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[hade-copy-enhance ${reqId}] ✗ request failed (${detail})`);
    return null;
  }

  if (!response.ok) {
    console.warn(`[hade-copy-enhance ${reqId}] ✗ OpenAI ${response.status}`);
    return null;
  }

  let rawContent: string;
  try {
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    rawContent = data.choices?.[0]?.message?.content ?? "";
  } catch {
    console.warn(`[hade-copy-enhance ${reqId}] ✗ response body parse failed`);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    console.warn(`[hade-copy-enhance ${reqId}] ✗ content is not JSON`);
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const patch = extractSafeCopyPatch(decision.id, parsed as Record<string, unknown>, reqId);
  if (!patch) return null;

  // Enforce character limits per field — drop any field that exceeds the cap
  // rather than truncating (truncation can produce grammatically broken copy).
  const validated: Partial<typeof patch> = {};
  if (patch.rationale      && patch.rationale.length      <=  280) validated.rationale      = patch.rationale;
  if (patch.why_now        && patch.why_now.length        <=  120) validated.why_now        = patch.why_now;
  if (patch.why_this       && patch.why_this.length       <=   60) validated.why_this       = patch.why_this;
  if (patch.decision_frame && patch.decision_frame.length <=  180) validated.decision_frame = patch.decision_frame;

  const appliedFields = Object.keys(validated);
  if (appliedFields.length === 0) {
    console.warn(`[hade-copy-enhance ${reqId}] ✗ all fields exceeded length limits — keeping deterministic copy`);
    return null;
  }

  console.log(`[hade-copy-enhance ${reqId}] ✓ copy patched`, { fields: appliedFields });
  return validated as Pick<
    import("@/types/hade").HadeDecision,
    "rationale" | "why_now" | "why_this" | "decision_frame"
  >;
}

// ─── Stage 4: Upstream call (reserved) ──────────────────────────────────────

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

/**
 * Returns a 200 response with guaranteed >= 1 SpontaneousObject in both
 * `decision` and `fallback_places`. Attempts Google Places first; if that
 * fails or returns nothing, emits 3 static synthetic objects.
 */
async function fallbackResponse(
  reqId: string,
  reason: string,
  detail: string,
  geoHint: GeoLocation | null,
  geoSource: GeoSource,
  bodyHint?: Record<string, unknown> | null,
): Promise<Response> {
  const candidates = await buildFallbackCandidates(geoHint, reqId, geoSource, bodyHint);
  // candidates.length >= 1 guaranteed by buildFallbackCandidates
  const body = {
    decision: { ...candidates[0], is_fallback: true },
    decision_node: null,
    fallback_places: candidates,
    context_snapshot: {
      situation_summary: "Decision engine temporarily unavailable",
      interpreted_intent: "chill",
      decision_basis: "fallback" as const,
      candidates_evaluated: candidates.length,
      llm_failure_reason: "provider_error" as const,
      fallback_reason: reason,
    },
    session_id: null,
    source: "static_fallback" as const,
    degraded: true,
    error: { code: "engine_unavailable", reason, detail },
  };

  console.warn(`[hade-decide ${reqId}] ⚠ fallback (${reason}): ${detail} — ${candidates.length} candidate(s)`);

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "x-hade-source": "fallback",
      "x-hade-fallback-reason": reason,
      "x-hade-degraded": "1",
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
  objects: SpontaneousObject[],
  body: Record<string, unknown>,
): Promise<void> {
  if (objects.length === 0) return;

  // ── Cold-start seeding ────────────────────────────────────────────────────
  // For each venue with no existing LocationNode, create a trust-prior node
  // derived from its Google rating. This is a one-time initialization only:
  //   • Existing nodes are never read, modified, or overwritten.
  //   • weight_map stays empty — no synthetic vibe tags are injected.
  //   • trust_score encodes prior belief quality; UGC signals refine it later.
  for (const object of objects) {
    const exists = await locationNodeExists(object.id);
    if (exists) continue;

    await createLocationNode({
      venue_id: object.id,
      trust_score: Math.max(0, Math.min(1, object.trust_score)),
      weight_map: {} as LocationNode["weight_map"],
      signal_count: 0,
      last_updated: new Date().toISOString(),
      version: 0,
    });
  }

  const venues: CachedVenue[] = objects.map((object) => ({
    id: object.id,
    name: object.title,
    geo: { lat: object.location.lat, lng: object.location.lng },
    rating: 1 + Math.max(0, Math.min(1, object.trust_score)) * 4,
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
    const now = Date.now();
    const fallbackObjects: SpontaneousObject[] = cache.venues.map((venue) => ({
      id: venue.id,
      type: "place_opportunity",
      title: venue.name,
      time_window: { start: now, end: now + 60 * 60 * 1000 },
      location: { lat: venue.geo.lat, lng: venue.geo.lng, place_id: venue.id },
      radius: Math.round(haversineDistanceMeters(geoHint, venue.geo)),
      going_count: 0,
      maybe_count: 0,
      user_state: null,
      created_at: now,
      expires_at: now + 60 * 60 * 1000,
      trust_score: Math.max(0, Math.min(1, ((venue.rating ?? 3.5) - 1) / 4)),
      source: "offline_cache",
    }));
    const bestObject = fallbackObjects.find((object) => object.id === best.venue.id);

    const responseBody = {
      decision: {
        ...(bestObject ?? {}),
        id: best.venue.id,
        venue_name: best.venue.name,
        category: "venue",
        geo: best.venue.geo,
        distance_meters: Math.round(best.dist),
        eta_minutes: Math.max(1, Math.ceil(best.dist / 80)), // 80 m/min walking
        rationale: "Based on a recent nearby suggestion.",
        why_now: "Cached from a recent session — showing the best nearby option.",
        why_this: "Closest cached option while you're offline.",
        decision_frame: "Working from cache — your closest known good spot.",
        confidence: 0.55,
        confidence_label: "Exploratory" as const,
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
      fallback_places: fallbackObjects,
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
