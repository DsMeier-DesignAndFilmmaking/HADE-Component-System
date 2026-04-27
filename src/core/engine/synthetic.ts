/**
 * Synthetic Decision Engine — Tier 2 fallback
 *
 * Called when the upstream LLM engine is unavailable. Builds a contextually
 * grounded HadeDecision from real nearby venues fetched via Google Places,
 * using the same context utilities (situation summary, intent inference) the
 * upstream engine would use.
 *
 * Contract:
 *   • Always resolves — never throws to the caller.
 *   • Returns { ok: false } when geo is absent or no usable places found.
 *   • Returns { ok: true, data, places } when a valid decision is produced.
 */

import "server-only";

import { fetchNearbyGrounded } from "@/core/services/places";
import { mapIntentToPlacesCategory } from "@/core/utils/intentMapper";
import {
  buildContext,
  generateSituationSummary,
  inferIntentFromTime,
} from "@/lib/hade/engine";
import { getNodeTrustScore, getNodeVibeScore } from "@/lib/hade/weights";
import { getDistanceCopy } from "@/lib/hade/ugcCopy";
import type {
  GeoLocation,
  HadeContext,
  HadeDebugPayload,
  Intent,
  DecideResponse,
  PlaceOption,
  ScoringWeights,
} from "@/types/hade";

// ─── Result type ──────────────────────────────────────────────────────────────

type ExplanationSignals = {
  vibe_match: "strong" | "moderate" | "none";
  social_proof: "high" | "moderate" | "none";
};

type SyntheticResult =
  | {
      ok: true;
      data: DecideResponse;
      places: PlaceOption[];
      debugPayload: HadeDebugPayload;
      explanation_signals?: ExplanationSignals;
    }
  | { ok: false };

// ─── Intent / radius helpers ──────────────────────────────────────────────────

const VALID_INTENTS = new Set<string>(["eat", "drink", "chill", "scene", "anything"]);

function extractIntent(body: Record<string, unknown>): Intent | undefined {
  const situation = (body as { situation?: { intent?: unknown } }).situation;
  const intent = situation?.intent;
  return typeof intent === "string" && VALID_INTENTS.has(intent)
    ? (intent as Intent)
    : undefined;
}

function extractRadius(body: Record<string, unknown>): number {
  const r = (body as { radius_meters?: unknown }).radius_meters;
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : 800;
}

// ─── Why-now copy ─────────────────────────────────────────────────────────────

function buildWhyNow(intent: Intent): string {
  switch (intent) {
    case "eat":
      return "Time to eat — this one's close and open now.";
    case "drink":
      return "Time for a drink — this one's right nearby.";
    case "chill":
      return "Good moment to unwind — this spot fits.";
    case "scene":
      return "Looking for a scene — this one's live right now.";
    default:
      return "Good moment for a break — this one's close and open.";
  }
}

function mapLegacyIntentToSemantic(intent: Intent): string {
  switch (intent) {
    case "eat":
    case "drink":
      return "Fuel";
    case "chill":
      return "Nature";
    case "scene":
      return "Energy";
    default:
      return "Anything";
  }
}

function resolveTargetCategories(
  situationSummary: string,
  intent: Intent | undefined,
  timeOfDay: HadeContext["time_of_day"],
): { intentLabel: string; categories: string[] } {
  const summaryCategories = mapIntentToPlacesCategory(situationSummary, timeOfDay);
  if (summaryCategories.length > 0) {
    return { intentLabel: situationSummary, categories: summaryCategories };
  }

  const semanticIntent = intent ? mapLegacyIntentToSemantic(intent) : "Anything";
  return {
    intentLabel: semanticIntent,
    categories: mapIntentToPlacesCategory(semanticIntent, timeOfDay),
  };
}

function filterPlacesByMappedCategory(places: PlaceOption[], categories: string[]): PlaceOption[] {
  if (categories.length === 0) return places;

  const normalizedCategories = new Set(
    categories.map((category) => normalizeMappedCategory(category)),
  );

  return places.filter((place) => {
    if (place.isUGC) return true;
    return normalizedCategories.has(place.category);
  });
}

function normalizeMappedCategory(category: string): string {
  switch (category) {
    case "coffee_shop":
      return "cafe";
    case "book_store":
      return "bookstore";
    case "nightclub":
      return "nightclub";
    case "tourist_attraction":
      return "venue";
    case "campground":
      return "park";
    case "aquarium":
      return "museum";
    default:
      return category;
  }
}

// ─── Place scoring ────────────────────────────────────────────────────────────

/**
 * Clamps a value to [min, max].
 * Defined here so scorePlaceOption has no external utility dependency.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** All intermediate values produced by scorePlaceOption, exposed for trace logging. */
interface ScoreBreakdown {
  proximityScore: number;
  ratingScore: number;
  vibeScore: number;
  trustScore: number;
  finalScore: number;
}

/** Rounds to 3 decimal places — keeps trace logs readable without precision loss. */
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Composite score that balances closeness, quality, and real-time UGC sentiment.
 *
 * Components:
 *   proximity_score  — inverse linear decay over 3000 m (weight: 0.60)
 *   rating_score     — Google star rating normalised 1–5 → 0–1 (weight: 0.40)
 *   vibe_delta       — UGC LocationNode sentiment overlay (±0.10 max)
 *
 * UGC integration:
 *   getNodeVibeScore() reads the LocationNode registry for this venue and
 *   returns an aggregate sentiment value in [0, 1] where 0.5 is neutral.
 *   Venues with no UGC history return exactly 0.5, so vibe_delta = 0 and
 *   the score is identical to the pre-UGC baseline — no crash, no bias.
 *
 *   A venue tagged "perfect_vibe" + "worth_it" might score 0.72 → +0.044
 *   A venue tagged "too_crowded" + "skip_it" might score 0.28 → -0.044
 *   Maximum possible swing: ±0.10 (when vibe_score is 0.0 or 1.0)
 *
 * Final score is clamped to [0, 1] — safe to use in any downstream ranking.
 */
function scorePlaceOption(
  place: PlaceOption,
  geo: GeoLocation,
  vibeScore: number,
  trustScore: number,
  weights?: ScoringWeights,
): ScoreBreakdown {
  void geo;

  // ── Proximity (UGC dampened: floor distance at 100 m to block "drop-pin
  //    at user location" exploits without changing real-world UX) ──────────
  const effectiveDistance = place.isUGC
    ? Math.max(place.distance_meters, 100)
    : place.distance_meters;
  const proximityScore = Math.max(0, 1 - effectiveDistance / 3000);

  // ── Rating (UGC without an external rating starts slightly below the
  //    Google neutral baseline of 0.625 to prevent dominance on cold start) ─
  const ratingScore =
    place.isUGC && place.rating === undefined
      ? 0.55
      : ((place.rating ?? 3.5) - 1) / 4; // normalise 1–5 → 0–1

  // ── Weighted base — unchanged ratios (0.6 / 0.4) ─────────────────────────
  const proximityWeight = weights?.proximity ?? 0.6;
  const ratingWeight    = weights?.rating    ?? 0.4;
  const baseScore =
    proximityScore * proximityWeight +
    ratingScore * ratingWeight;

  // ── Social overlay: vibe + trust, jointly bounded ────────────────────────
  // Both inputs default to 0.5 (neutral) when no LocationNode exists, so a
  // venue with no UGC history has vibeDelta = trustDelta = 0 and scores
  // identically to the pre-overlay baseline.
  //   vibeDelta:  ±0.10  (×0.20)
  //   trustDelta: ±0.075 (×0.15)
  // The combined delta is clamped to ±0.15 so vibe and trust cannot stack
  // beyond the cap — prevents signal-stacking exploits.
  const vibeDelta  = (vibeScore  - 0.5) * 0.2;
  const trustDelta = (trustScore - 0.5) * 0.15;
  const boundedSocialDelta = clamp(vibeDelta + trustDelta, -0.15, 0.15);

  return {
    proximityScore,
    ratingScore,
    vibeScore,
    trustScore,
    finalScore: clamp(baseScore + boundedSocialDelta, 0, 1),
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Attempts to build a DecideResponse from real nearby Places API results.
 *
 * @param body   - Validated POST body (geo already confirmed present)
 * @param reqId  - Request correlation ID for logging
 * @param geoHint - Extracted GeoLocation from the validated request
 */
export async function generateSyntheticDecision(
  body: Record<string, unknown>,
  reqId: string,
  geoHint: GeoLocation | null,
): Promise<SyntheticResult> {
  try {
    // ── Guard: geo required ───────────────────────────────────────────────────
    if (!geoHint) {
      console.warn(`[hade-synthetic ${reqId}] no geo — cannot generate synthetic decision`);
      return { ok: false };
    }

    const intent = extractIntent(body);
    const radius = extractRadius(body);
    const scoringWeights =
      (
        body as {
          settings?: { scoring_weights?: ScoringWeights | null };
        }
      )?.settings?.scoring_weights ?? undefined;
    const ctx = buildContext(body as Partial<HadeContext>);
    const situationSummary = generateSituationSummary(ctx);
    const { intentLabel, categories: targetCategories } = resolveTargetCategories(
      situationSummary,
      intent,
      ctx.time_of_day,
    );
    const primaryCategory = targetCategories[0] ?? "broad";

    console.log(`[HADE Tier 2] Intent: "${intentLabel}" -> Mapped Category: "${primaryCategory}"`);

    // ── Fetch nearby places ───────────────────────────────────────────────────
    console.log(
      `[hade-synthetic ${reqId}] fetching places` +
        ` (intent=${intent ?? "any"}, radius=${radius}m, category=${primaryCategory})`,
    );

    let places = await fetchNearbyGrounded({
      geo: geoHint,
      intent,
      target_categories: targetCategories,
      radius_meters: radius,
      open_now: true,
    });

    const googleCount = places.length;

    // ── UGC injection: merge custom_candidates into the candidate pool ───────
    // Caller-supplied entities (events, pop-ups, custom venues) are appended
    // to the Google fetch and deduplicated by id with last-write-wins semantics
    // — a custom entry overrides any colliding Google record so updated UGC
    // metadata takes precedence. Category filter and rejection_history filter
    // both run AFTER this merge, unchanged.
    const customRaw = (body as { custom_candidates?: unknown }).custom_candidates;
    const customCandidates = Array.isArray(customRaw)
      ? (customRaw as PlaceOption[])
      : [];
    if (customCandidates.length > 0) {
      const byId = new Map<string, PlaceOption>();
      for (const p of places)            byId.set(p.id, p);
      for (const c of customCandidates)  byId.set(c.id, c); // last-write-wins
      const beforeCount = places.length;
      places = [...byId.values()];
      console.log(
        `[hade-synthetic ${reqId}] merged ${customCandidates.length} custom_candidate(s)` +
          ` — pool: ${places.length} (was ${beforeCount})`,
      );
    }

    const ugcInjectedCount = places.filter((p) => p.isUGC).length;
    const relevantPlaces = filterPlacesByMappedCategory(places, targetCategories);
    const ugcSurvivedCount = relevantPlaces.filter((p) => p.isUGC).length;

    if (ugcInjectedCount > 0) {
      const ugcFilteredOutCount = ugcInjectedCount - ugcSurvivedCount;
      if (ugcSurvivedCount === 0) {
        console.warn(
          `[hade-synthetic ${reqId}] ⚠ UGC fully filtered out` +
            ` — ugc_injected=${ugcInjectedCount} ugc_survived=0 ugc_filtered_out=${ugcInjectedCount}`,
        );
      } else {
        console.log(
          `[hade-synthetic ${reqId}] UGC visibility:` +
            ` ugc_injected=${ugcInjectedCount} ugc_survived=${ugcSurvivedCount} ugc_filtered_out=${ugcFilteredOutCount}`,
        );
      }
    }

    if (relevantPlaces.length === 0) {
      console.warn(`[hade-synthetic ${reqId}] no places returned — falling through to Tier 3`);
      return { ok: false };
    }

    // ── HARD EXCLUSION of rejected venues ─────────────────────────────────────
    // "Not This" must guarantee a rejected venue is NEVER returned again in the
    // same session. Filter BEFORE scoring so a rejected venue cannot be ranked,
    // tied, or surfaced as fallback_places. Schema is RejectionEntry[] (objects
    // with venue_id); accept raw string[] defensively for forward-compat.
    const rawRejections = (body as { rejection_history?: unknown }).rejection_history;
    const rejected = new Set<string>(
      Array.isArray(rawRejections)
        ? rawRejections
            .map((entry) => {
              if (typeof entry === "string") return entry;
              if (entry && typeof entry === "object" && "venue_id" in entry) {
                const id = (entry as { venue_id: unknown }).venue_id;
                return typeof id === "string" ? id : null;
              }
              return null;
            })
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        : [],
    );

    const filteredPlaces = rejected.size > 0
      ? relevantPlaces.filter((place) => !rejected.has(place.id))
      : relevantPlaces;

    if (filteredPlaces.length === 0) {
      console.warn(
        `[hade-synthetic ${reqId}] all ${relevantPlaces.length} candidate(s) rejected` +
          ` (rejection_history size=${rejected.size}) — falling through to Tier 3`,
      );
      return { ok: false };
    }

    if (rejected.size > 0) {
      const excluded = relevantPlaces.length - filteredPlaces.length;
      if (excluded > 0) {
        console.log(
          `[hade-synthetic ${reqId}] excluded ${excluded} rejected venue(s)` +
            ` — ${filteredPlaces.length} candidate(s) remain`,
        );
      }
    }

    // ── Pick best place ───────────────────────────────────────────────────────
    const scoredPlaces = await Promise.all(
      filteredPlaces.map(async (place) => {
        const [vibeScore, trustScore] = await Promise.all([
          getNodeVibeScore(place.id),
          getNodeTrustScore(place.id),
        ]);
        const breakdown = scorePlaceOption(
          place,
          geoHint,
          vibeScore,
          trustScore,
          scoringWeights,
        );
        return { place, score: breakdown.finalScore, breakdown };
      }),
    );
    const sorted = scoredPlaces.sort((a, b) => {
      // 1. finalScore DESC
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      // 2. distance_meters ASC — closer wins on tie
      const distDiff = a.place.distance_meters - b.place.distance_meters;
      if (distDiff !== 0) return distDiff;
      // 3. isUGC DESC — prefer UGC in exact ties (community-first)
      const ugcDiff = (b.place.isUGC ? 1 : 0) - (a.place.isUGC ? 1 : 0);
      if (ugcDiff !== 0) return ugcDiff;
      // 4. id ASC — final stable tie-breaker, immune to input ordering
      return a.place.id.localeCompare(b.place.id);
    });
    const best = sorted[0].place;

    // ── Resolve display intent (infer from time if absent) ────────────────────
    const resolvedIntent: Intent =
      intent ??
      inferIntentFromTime(ctx.time_of_day) ??
      "anything";

    // ── Assemble HadeDecision ─────────────────────────────────────────────────
    const winnerBreakdown = sorted[0].breakdown;
    const ugcMeta = best.isUGC && best.created_at
      ? {
          ugc_meta: {
            is_ugc: true as const,
            created_at: best.created_at,
            ...(best.expires_at ? { expires_at: best.expires_at } : {}),
            distance_copy: getDistanceCopy(best.distance_meters),
          },
        }
      : {};

    const decision = {
      id: best.id,
      venue_name: best.name,
      category: best.category,
      geo: best.geo,
      distance_meters: best.distance_meters,
      eta_minutes: Math.max(1, Math.ceil(best.distance_meters / 80)), // 80 m/min walking
      rationale: `A ${best.vibe} ${best.category} a short walk from here.`,
      why_now: buildWhyNow(resolvedIntent),
      confidence: 0.65,
      situation_summary: situationSummary,
      ...(best.address ? { neighborhood: best.address } : {}),
      ...ugcMeta,
    };

    // ── Assemble DecideResponse ───────────────────────────────────────────────
    const data: DecideResponse = {
      decision,
      context_snapshot: {
        situation_summary: situationSummary,
        interpreted_intent: resolvedIntent,
        decision_basis: "fallback",
        candidates_evaluated: filteredPlaces.length,
        llm_failure_reason: "provider_error",
      },
      session_id: `synthetic-${reqId}`,
      source: "synthetic",
      fallback_places: filteredPlaces,
    };

    console.log(
      `[hade-synthetic ${reqId}] ✓ built synthetic decision` +
        ` — "${best.name}" (${best.distance_meters}m, ${filteredPlaces.length} candidate(s))`,
    );

    // ── Decision trace — structured audit log (no PII: geo truncated to 3dp) ─
    const ugcCount = customCandidates.length;
    const winReason =
      sorted.length === 1
        ? "only_candidate"
        : sorted[0].score > (sorted[1]?.score ?? -1)
          ? "highest_score"
          : "tie_broken";
    const top3 = sorted.slice(0, 3);
    console.log("[hade-trace]", JSON.stringify({
      trace_id: reqId,
      input: {
        geo: { lat: r3(geoHint.lat), lng: r3(geoHint.lng) },
        intent: intent ?? "any",
        radius,
      },
      candidates: {
        google_count: googleCount,
        ugc_count: ugcCount,
        merged_count: googleCount + ugcCount > 0 ? places.length : 0,
      },
      filtering: {
        after_category: relevantPlaces.length,
        after_rejection: filteredPlaces.length,
      },
      scoring: top3.map(({ place, breakdown }) => ({
        id: place.id,
        isUGC: place.isUGC ?? false,
        distance: place.distance_meters,
        proximityScore: r3(breakdown.proximityScore),
        ratingScore:    r3(breakdown.ratingScore),
        vibeScore:      r3(breakdown.vibeScore),
        trustScore:     r3(breakdown.trustScore),
        finalScore:     r3(breakdown.finalScore),
      })),
      selected: {
        id: best.id,
        finalScore: r3(sorted[0].score),
        reason: winReason,
      },
    }));

    // ── Debug payload (returned when caller sets settings.debug=true) ─────────
    const finalReasoning =
      winReason === "only_candidate"
        ? `Only candidate: ${best.id}`
        : winReason === "highest_score"
          ? `Selected ${best.id} (score ${r3(sorted[0].score)}); next was ${sorted[1].place.id} (${r3(sorted[1].score)})`
          : `Tied at ${r3(sorted[0].score)} — resolved by id: ${best.id} over ${sorted[1].place.id}`;

    const debugPayload: HadeDebugPayload = {
      candidates_evaluated: filteredPlaces.length,
      ugc_injected: ugcInjectedCount,
      rejection_applied: rejected.size > 0,
      final_reasoning: finalReasoning,
      scoring_breakdown: top3.map(({ place, breakdown }) => ({
        venue_id:       place.id,
        venue_name:     place.name,
        category:       place.category,
        proximity_score: r3(breakdown.proximityScore),
        context_score:  0,
        intent_score:   0,
        final_score:    r3(breakdown.finalScore),
        isUGC:          place.isUGC ?? false,
        distance:       place.distance_meters,
        rating_score:   r3(breakdown.ratingScore),
        vibe_score:     r3(breakdown.vibeScore),
        trust_score:    r3(breakdown.trustScore),
      })),
    };

    const explanation_signals: ExplanationSignals = {
      vibe_match:
        winnerBreakdown.vibeScore >= 0.7 ? "strong"
        : winnerBreakdown.vibeScore >= 0.5 ? "moderate"
        : "none",
      social_proof:
        winnerBreakdown.trustScore >= 0.6 ? "high"
        : winnerBreakdown.trustScore >= 0.5 ? "moderate"
        : "none",
    };

    return { ok: true, data, places: filteredPlaces, debugPayload, explanation_signals };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[hade-synthetic ${reqId}] ✗ threw unexpectedly: ${detail}`);
    return { ok: false };
  }
}
