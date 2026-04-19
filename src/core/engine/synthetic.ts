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
import { getNodeVibeScore } from "@/lib/hade/weights";
import type {
  GeoLocation,
  HadeContext,
  Intent,
  DecideResponse,
  PlaceOption,
} from "@/types/hade";

// ─── Result type ──────────────────────────────────────────────────────────────

type SyntheticResult =
  | { ok: true; data: DecideResponse; places: PlaceOption[] }
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

  return places.filter((place) => normalizedCategories.has(place.category));
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
async function scorePlaceOption(p: PlaceOption): Promise<number> {
  // ── Base score (unchanged behaviour when no UGC exists) ──────────────────
  const proximityScore = Math.max(0, 1 - p.distance_meters / 3000);
  const ratingScore    = ((p.rating ?? 3.5) - 1) / 4; // normalise 1–5 → 0–1
  const baseScore      = proximityScore * 0.6 + ratingScore * 0.4;

  // ── UGC vibe overlay ─────────────────────────────────────────────────────
  // getNodeVibeScore() returns 0.5 (neutral) when:
  //   • The venue has no LocationNode entry (never received a VibeSignal)
  //   • All accumulated signals have expired and been filtered out
  //   • The LocationNode signal_count is 0
  // In all three cases vibe_delta = 0 and final_score === baseScore exactly.
  const vibeScore = await getNodeVibeScore(p.id); // p.id is the Google Place ID / venue_id
  const vibeDelta = (vibeScore - 0.5) * 0.2; // range: −0.10 to +0.10

  return clamp(baseScore + vibeDelta, 0, 1);
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

    const places = await fetchNearbyGrounded({
      geo: geoHint,
      intent,
      target_categories: targetCategories,
      radius_meters: radius,
      open_now: true,
    });

    const relevantPlaces = filterPlacesByMappedCategory(places, targetCategories);

    if (relevantPlaces.length === 0) {
      console.warn(`[hade-synthetic ${reqId}] no places returned — falling through to Tier 3`);
      return { ok: false };
    }

    // ── Pick best place ───────────────────────────────────────────────────────
    const scoredPlaces = await Promise.all(
      relevantPlaces.map(async (place) => ({
        place,
        score: await scorePlaceOption(place),
      })),
    );
    const sorted = scoredPlaces.sort((a, b) => b.score - a.score);
    const best = sorted[0].place;

    // ── Resolve display intent (infer from time if absent) ────────────────────
    const resolvedIntent: Intent =
      intent ??
      inferIntentFromTime(ctx.time_of_day) ??
      "anything";

    // ── Assemble HadeDecision ─────────────────────────────────────────────────
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
    };

    // ── Assemble DecideResponse ───────────────────────────────────────────────
    const data: DecideResponse = {
      decision,
      context_snapshot: {
        situation_summary: situationSummary,
        interpreted_intent: resolvedIntent,
        decision_basis: "fallback",
        candidates_evaluated: relevantPlaces.length,
        llm_failure_reason: "provider_error",
      },
      session_id: `synthetic-${reqId}`,
      source: "synthetic",
      fallback_places: relevantPlaces,
    };

    console.log(
      `[hade-synthetic ${reqId}] ✓ built synthetic decision` +
        ` — "${best.name}" (${best.distance_meters}m, ${relevantPlaces.length} candidate(s))`,
    );

    return { ok: true, data, places: relevantPlaces };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[hade-synthetic ${reqId}] ✗ threw unexpectedly: ${detail}`);
    return { ok: false };
  }
}
