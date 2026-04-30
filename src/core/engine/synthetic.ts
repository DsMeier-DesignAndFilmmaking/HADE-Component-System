/**
 * Synthetic Decision Engine — Tier 2 fallback
 *
 * Called when the upstream LLM engine is unavailable. Builds a contextually
 * grounded HadeDecision by operating on a unified SpontaneousObject pool:
 *
 *   1. UGC spontaneous objects are fetched as the primary source
 *   2. Google Places are fetched and converted to SpontaneousObject
 *   3. The merged pool is filtered: expired objects and objects outside the
 *      next 2-hour window are dropped
 *   4. Remaining candidates are ranked by time proximity (highest weight),
 *      distance, going_count, trust_score, and user_state
 *   5. The top-ranked object is returned as a HadeDecision
 *
 * Contract:
 *   • Always resolves — never throws to the caller.
 *   • Returns { ok: false } when geo is absent or no usable candidates remain.
 *   • Returns { ok: true, data, objects } when a valid decision is produced.
 */

import "server-only";

import { getPlacesCandidates } from "@/core/adapters/placesAdapter";
import { mapIntentToPlacesCategory } from "@/core/utils/intentMapper";
import {
  buildContext,
  generateSituationSummary,
  haversineDistanceMeters,
  inferIntentFromTime,
} from "@/lib/hade/engine";
import { getNodeTrustScore } from "@/lib/hade/weights";
import { getDistanceCopy } from "@/lib/hade/ugcCopy";
import { getNearbyUGC } from "@/lib/hade/ugc";
import { getDomainConfig, type DomainConfig } from "@/core/domain/config";
import { RADIUS } from "@/core/constants/radius";
import type { DecisionCandidate } from "@/core/types/decision";
import type {
  GeoLocation,
  HadeContext,
  HadeDebugPayload,
  Intent,
  DecideResponse,
  PlaceOption,
  UGCEntity,
} from "@/types/hade";
import {
  fromGooglePlace,
  fromUGC,
  type SpontaneousObject,
} from "../../../domain/spontaneous-object/spontaneousObject";

// ─── Result type ──────────────────────────────────────────────────────────────

type ExplanationSignals = {
  vibe_match: "strong" | "moderate" | "none";
  social_proof: "high" | "moderate" | "none";
};

type SyntheticResult =
  | {
      ok: true;
      data: DecideResponse;
      objects: SpontaneousObject[];
      debugPayload: HadeDebugPayload;
      explanation_signals?: ExplanationSignals;
      topCandidate?: DecisionCandidate;
    }
  | { ok: false };

// ─── Intent / radius helpers ──────────────────────────────────────────────────

function extractIntent(body: Record<string, unknown>): Intent | undefined {
  const situation = (body as { situation?: { intent?: unknown } }).situation;
  const intent = situation?.intent;
  return typeof intent === "string" && intent.trim().length > 0
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
      return intent; // unknown intents become their own semantic label
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

// ─── Clamp utility ────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Rounds to 3 decimal places — keeps trace logs readable without precision loss. */
const r3 = (v: number) => Math.round(v * 1000) / 1000;

// ─── SpontaneousObject pipeline types ─────────────────────────────────────────

/** Working unit during ranking: SpontaneousObject + optional distance/display metadata. */
export interface RankedCandidate {
  obj: SpontaneousObject;
  distance_meters?: number;
  category: string;
  address?: string;
  rating?: number;
}

/** All intermediate values produced by scoreSpontaneousCandidate, for trace logging. */
export interface SpontaneousScoreBreakdown {
  timeProximityScore: number;
  distanceScore: number;
  socialScore: number;
  trustScore: number;
  userStateBonus: number;
  finalScore: number;
}

// ─── DecisionCandidate adapter ────────────────────────────────────────────────

/**
 * Wraps a SpontaneousObject into the normalized DecisionCandidate shape.
 * Distance and time_relevance are derived from the caller's RankedCandidate
 * context and must be merged in at the call site if needed.
 */
export function toDecisionCandidate(obj: SpontaneousObject): DecisionCandidate {
  return {
    id: obj.id,
    title: obj.title,
    geo: { lat: obj.location.lat, lng: obj.location.lng },
    metadata: {
      social_signal: obj.going_count > 0 ? Math.min(1, obj.going_count / 50) : undefined,
      trust_score: obj.trust_score,
      tags: obj.vibe_tag ? [obj.vibe_tag] : undefined,
    },
    raw: obj,
  };
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

function isoToEpochMs(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
}

function epochMsToIso(ms: number): string {
  return new Date(ms).toISOString();
}

function hasFiniteLocation(obj: Partial<SpontaneousObject>): obj is Partial<SpontaneousObject> & {
  location: { lat: number; lng: number; place_id?: string };
} {
  return (
    typeof obj.location?.lat === "number" &&
    typeof obj.location?.lng === "number" &&
    Number.isFinite(obj.location.lat) &&
    Number.isFinite(obj.location.lng)
  );
}

function isSpontaneousObject(value: unknown): value is SpontaneousObject {
  if (!value || typeof value !== "object") return false;
  const obj = value as Partial<SpontaneousObject>;
  return (
    typeof obj.id === "string" &&
    (obj.type === "ugc_event" || obj.type === "place_opportunity") &&
    typeof obj.title === "string" &&
    hasFiniteLocation(obj)
  );
}

function normalizeSpontaneousObject(
  input: SpontaneousObject,
  now: number,
): SpontaneousObject {
  const start = typeof input.time_window?.start === "number" ? input.time_window.start : now;
  const end = typeof input.time_window?.end === "number" ? input.time_window.end : now + 60 * 60 * 1000;
  return {
    ...input,
    time_window: { start, end },
    radius: typeof input.radius === "number" ? input.radius : RADIUS.OBJECT_NORMALIZE_MIN,
    going_count: typeof input.going_count === "number" ? input.going_count : 0,
    maybe_count: typeof input.maybe_count === "number" ? input.maybe_count : 0,
    user_state: input.user_state === "going" || input.user_state === "maybe" ? input.user_state : null,
    created_at: typeof input.created_at === "number" ? input.created_at : now,
    expires_at: typeof input.expires_at === "number" ? input.expires_at : end,
    trust_score: typeof input.trust_score === "number" ? clamp(input.trust_score, 0, 1) : 0.5,
  };
}

function candidateFromObject(
  obj: SpontaneousObject,
  origin: GeoLocation,
  category: string,
  metadata: Pick<RankedCandidate, "address" | "rating"> = {},
): RankedCandidate {
  return {
    obj,
    distance_meters: Math.round(haversineDistanceMeters(origin, obj.location)),
    category,
    ...metadata,
  };
}

function ugcToCandidate(entity: UGCEntity, origin: GeoLocation, now: number): RankedCandidate | null {
  const createdAt = isoToEpochMs(entity.created_at) ?? now;
  const expiresAt = isoToEpochMs(entity.expires_at) ?? now + 2 * 60 * 60 * 1000;
  const obj = fromUGC({
    id: entity.id,
    title: entity.venue_name,
    type: "ugc_event",
    location: { lat: entity.geo.lat, lng: entity.geo.lng },
    time_window: { start: createdAt, end: expiresAt },
    created_at: createdAt,
    expires_at: expiresAt,
    radius: Math.round(haversineDistanceMeters(origin, entity.geo)),
    vibe_tag: entity.category,
    source: entity.created_by ?? "user",
  });

  if (!hasFiniteLocation(obj)) return null;

  return candidateFromObject(
    normalizeSpontaneousObject({ ...obj, created_at: createdAt, expires_at: expiresAt }, now),
    origin,
    entity.category,
  );
}

async function getUGCObjects(
  body: Record<string, unknown>,
  origin: GeoLocation,
  radius: number,
  now: number,
): Promise<RankedCandidate[]> {
  const storedEntities = await getNearbyUGC(origin, radius);
  const stored = storedEntities
    .map((entity) => ugcToCandidate(entity, origin, now))
    .filter((candidate): candidate is RankedCandidate => candidate !== null);

  const customRaw = (body as { custom_candidates?: unknown }).custom_candidates;
  const custom = Array.isArray(customRaw)
    ? customRaw
        .filter(isSpontaneousObject)
        .map((obj) =>
          candidateFromObject(
            normalizeSpontaneousObject(obj, now),
            origin,
            obj.vibe_tag ?? (obj.type === "ugc_event" ? "ugc" : "venue"),
          ),
        )
    : [];

  const byId = new Map<string, RankedCandidate>();
  for (const candidate of stored) byId.set(candidate.obj.id, candidate);
  for (const candidate of custom) byId.set(candidate.obj.id, candidate);
  return [...byId.values()];
}


function placeToCandidate(place: PlaceOption, origin: GeoLocation, now: number): RankedCandidate | null {
  const obj = fromGooglePlace({
    place_id: place.id,
    name: place.name,
    geometry: { location: { lat: place.geo.lat, lng: place.geo.lng } },
  });

  if (!hasFiniteLocation(obj)) return null;

  return {
    obj: normalizeSpontaneousObject(
      {
        ...obj,
        vibe_tag: place.vibe,
        source: "google_places",
        radius: place.distance_meters,
        trust_score: place.rating !== undefined ? clamp((place.rating - 1) / 4, 0, 1) : obj.trust_score,
      },
      now,
    ),
    distance_meters: place.distance_meters,
    category: place.category,
    address: place.address,
    rating: place.rating,
  };
}

function mergeCandidates(...groups: RankedCandidate[][]): RankedCandidate[] {
  const byId = new Map<string, RankedCandidate>();
  for (const group of groups) {
    for (const candidate of group) {
      byId.set(candidate.obj.id, candidate);
    }
  }
  return [...byId.values()];
}

// ─── Time-window filter ───────────────────────────────────────────────────────

/**
 * Keeps only candidates that:
 *  1. Have not yet expired (now < expires_at)
 *  2. Start within the next 2 hours, or have already started (start <= now + 7200)
 */
function filterByTimeWindow(candidates: RankedCandidate[], now: number): RankedCandidate[] {
  return candidates.filter(({ obj }) =>
    obj.expires_at > now &&
    obj.time_window.end >= now &&
    obj.time_window.start <= now + 2 * 60 * 60 * 1000,
  );
}

// ─── Ranking formula ──────────────────────────────────────────────────────────

/**
 * Scores a SpontaneousObject candidate using the new ranking formula:
 *
 *   time_proximity (0.45) — inverse decay from window start; 1 if starting now
 *   distance       (0.30) — inverse linear decay over 3000 m
 *   social_score   (0.15) — going_count normalised to [0, 1] (50 = max)
 *   trust_score    (0.10) — persisted trust value from SpontaneousObject
 *   user_state     (+0.10 / +0.05) — additive bonus for confirmed RSVP
 *
 * Venues with no UGC history default to trust_score=0.5 and going_count=0,
 * so they score identically to the neutral baseline — no crash, no bias.
 */
function scoreSpontaneousCandidate(
  candidate: RankedCandidate,
  now: number,
  weights?: DomainConfig["scoringWeights"],
): SpontaneousScoreBreakdown {
  const { obj, distance_meters } = candidate;

  const msUntilStart = Math.max(0, obj.time_window.start - now);
  const timeProximityScore = Math.max(0, 1 - msUntilStart / (2 * 60 * 60 * 1000));

  const distanceScore =
    typeof distance_meters === "number"
      ? Math.max(0, 1 - distance_meters / 3000)
      : 0.5;

  const socialScore = Math.min(1, obj.going_count / 50);

  const trustScore = obj.trust_score;

  const userStateBonus =
    obj.user_state === "going" ? 0.10 :
    obj.user_state === "maybe" ? 0.05 : 0;

  const w = weights ?? { time: 0.60, social: 0.25, distance: 0.10, trust: 0.05 };
  const baseScore =
    timeProximityScore * w.time     +
    socialScore        * w.social   +
    distanceScore      * w.distance +
    trustScore         * w.trust;

  return {
    timeProximityScore,
    distanceScore,
    socialScore,
    trustScore,
    userStateBonus,
    finalScore: clamp(baseScore + userStateBonus, 0, 1),
  };
}

export async function rankSpontaneousObjects(
  candidates: RankedCandidate[],
  now: number = Date.now(),
  weights?: DomainConfig["scoringWeights"],
): Promise<Array<{ candidate: RankedCandidate; score: number; breakdown: SpontaneousScoreBreakdown }>> {
  const scoredCandidates = await Promise.all(
    candidates.map(async (candidate) => {
      const nodeTrust = await getNodeTrustScore(candidate.obj.id);
      const effectiveTrust = (candidate.obj.trust_score + nodeTrust) / 2;
      const candidateWithTrust: RankedCandidate = {
        ...candidate,
        obj: { ...candidate.obj, trust_score: effectiveTrust },
      };
      const breakdown = scoreSpontaneousCandidate(candidateWithTrust, now, weights);
      return { candidate: candidateWithTrust, score: breakdown.finalScore, breakdown };
    }),
  );

  return scoredCandidates.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;

    const goingDiff = b.candidate.obj.going_count - a.candidate.obj.going_count;
    if (goingDiff !== 0) return goingDiff;

    const aDistance = a.candidate.distance_meters ?? Number.POSITIVE_INFINITY;
    const bDistance = b.candidate.distance_meters ?? Number.POSITIVE_INFINITY;
    const distDiff = aDistance - bDistance;
    if (distDiff !== 0) return distDiff;

    return a.candidate.obj.id.localeCompare(b.candidate.obj.id);
  });
}

export async function getTopSpontaneousObject(
  candidates: RankedCandidate[],
  now: number = Date.now(),
): Promise<RankedCandidate | null> {
  const ranked = await rankSpontaneousObjects(candidates, now);
  return ranked[0]?.candidate ?? null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Attempts to build a DecideResponse from a unified SpontaneousObject pool.
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
    const domainMode = (body as { mode?: unknown }).mode as string | undefined;
    const config = getDomainConfig(domainMode);

    const callerCategories = (body as { candidate_categories?: unknown }).candidate_categories;
    const categories =
      Array.isArray(callerCategories) && (callerCategories as unknown[]).length > 0
        ? (callerCategories as string[])
        : config.categoryResolver(ctx);
    const primaryCategory = categories[0] ?? "broad";

    console.log("[HADE DEBUG] categories:", categories);

    console.log(`[HADE Tier 2] domain=${config.id} intent="${intent ?? "any"}" category="${primaryCategory}"`);

    // ── Step 1: Fetch UGC (primary) and Places (fallback) ─────────────────────
    const now = Date.now();
    const ugcCandidates = await getUGCObjects(body, geoHint, radius, now);

    console.log(
      `[hade-synthetic ${reqId}] fetching places` +
        ` (intent=${intent ?? "any"}, radius=${radius}m, category=${primaryCategory})`,
    );

    const places = await getPlacesCandidates(ctx, categories);
    const placeCandidates = places
      .map((place) => placeToCandidate(place, geoHint, now))
      .filter((candidate): candidate is RankedCandidate => candidate !== null);

    const googleCount = placeCandidates.length;
    const ugcInjectedCount = ugcCandidates.length;

    // ── Step 2: Merge SpontaneousObject arrays ────────────────────────────────
    const mergedCandidates = mergeCandidates(ugcCandidates, placeCandidates);

    // ── Step 3: HARD EXCLUSION of rejected objects ────────────────────────────
    // "Not This" must guarantee a rejected venue is NEVER returned again in the
    // same session. Filter BEFORE conversion so rejected IDs cannot reach ranking.
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

    const admittedCandidates = rejected.size > 0
      ? mergedCandidates.filter((candidate) => !rejected.has(candidate.obj.id))
      : mergedCandidates;

    if (admittedCandidates.length === 0) {
      console.warn(
        `[hade-synthetic ${reqId}] all ${mergedCandidates.length} candidate(s) rejected` +
          ` (rejection_history size=${rejected.size}) — falling through to Tier 3`,
      );
      return { ok: false };
    }

    if (rejected.size > 0) {
      const excluded = mergedCandidates.length - admittedCandidates.length;
      if (excluded > 0) {
        console.log(
          `[hade-synthetic ${reqId}] excluded ${excluded} rejected venue(s)` +
            ` — ${admittedCandidates.length} candidate(s) remain`,
        );
      }
    }

    // ── Step 4: Filter by time window (now → +2h) ────────────────────────────
    const timeWindowCandidates = filterByTimeWindow(admittedCandidates, now);

    if (timeWindowCandidates.length === 0) {
      console.warn(
        `[hade-synthetic ${reqId}] no candidates within time window` +
          ` (admitted=${admittedCandidates.length}) — falling through to Tier 3`,
      );
      return { ok: false };
    }

    const ugcSurvivedCount = timeWindowCandidates.filter((c) => c.obj.type === "ugc_event").length;
    if (ugcInjectedCount > 0) {
      const ugcFiltered = ugcInjectedCount - ugcSurvivedCount;
      console.log(
        `[hade-synthetic ${reqId}] UGC visibility:` +
          ` ugc_injected=${ugcInjectedCount} ugc_survived=${ugcSurvivedCount} ugc_filtered_out=${ugcFiltered}`,
      );
    }

    // ── Step 5: Score and rank ────────────────────────────────────────────────
    const sorted = await rankSpontaneousObjects(timeWindowCandidates, now, config.scoringWeights);

    const best = sorted[0];
    if (!best) return { ok: false };

    const bestObj = best.candidate.obj;
    const bestDistance = best.candidate.distance_meters ?? 0;
    const bestCategory = best.candidate.category;
    const bestVibe = bestObj.vibe_tag ?? bestCategory;

    // ── Resolve display intent (infer from time if absent) ────────────────────
    const resolvedIntent: Intent =
      intent ??
      inferIntentFromTime(ctx.time_of_day) ??
      "anything";

    // ── Step 7: Assemble HadeDecision from the winning SpontaneousObject ──────
    const ugcMeta = bestObj.type === "ugc_event" && bestObj.created_at
      ? {
          ugc_meta: {
            is_ugc: true as const,
            created_at: epochMsToIso(bestObj.created_at),
            ...(bestObj.expires_at ? { expires_at: epochMsToIso(bestObj.expires_at) } : {}),
            distance_copy: getDistanceCopy(bestDistance),
          },
        }
      : {};

    const decision = {
      ...bestObj,
      id: bestObj.id,
      venue_name: bestObj.title,
      category: bestCategory,
      geo: { lat: bestObj.location.lat, lng: bestObj.location.lng },
      distance_meters: bestDistance,
      eta_minutes: Math.max(1, Math.ceil(bestDistance / 80)),
      rationale: `A ${bestVibe} ${bestCategory} a short walk from here.`,
      why_now: config.copy.buildWhyNow(ctx),
      confidence: 0.65,
      situation_summary: situationSummary,
      ...(best.candidate.address ? { neighborhood: best.candidate.address } : {}),
      ...ugcMeta,
    };

    // ── Assemble DecideResponse ───────────────────────────────────────────────
    const fallbackObjects = timeWindowCandidates.map((c) => c.obj);
    const data: DecideResponse = {
      decision,
      context_snapshot: {
        situation_summary: situationSummary,
        interpreted_intent: resolvedIntent,
        decision_basis: "fallback",
        candidates_evaluated: timeWindowCandidates.length,
        llm_failure_reason: "provider_error",
      },
      session_id: `synthetic-${reqId}`,
      source: "synthetic",
      fallback_places: fallbackObjects,
    };

    console.log(
      `[hade-synthetic ${reqId}] ✓ built synthetic decision` +
        ` — "${bestObj.title}" (${bestDistance}m, ${timeWindowCandidates.length} candidate(s))`,
    );

    // ── Decision trace — structured audit log (no PII: geo truncated to 3dp) ─
    const ugcCount = ugcCandidates.length;
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
        domain: config.id,
      },
      candidates: {
        google_count: googleCount,
        ugc_count: ugcCount,
        merged_count: mergedCandidates.length,
      },
      filtering: {
        after_rejection: admittedCandidates.length,
        after_time_window: timeWindowCandidates.length,
      },
      scoring: top3.map(({ candidate, breakdown }) => ({
        id: candidate.obj.id,
        type: candidate.obj.type,
        distance: candidate.distance_meters,
        timeProximityScore: r3(breakdown.timeProximityScore),
        distanceScore:      r3(breakdown.distanceScore),
        socialScore:        r3(breakdown.socialScore),
        trustScore:         r3(breakdown.trustScore),
        userStateBonus:     r3(breakdown.userStateBonus),
        finalScore:         r3(breakdown.finalScore),
      })),
      selected: {
        id: bestObj.id,
        type: bestObj.type,
        finalScore: r3(sorted[0].score),
        reason: winReason,
      },
    }));

    // ── Debug payload (returned when caller sets settings.debug=true) ─────────
    const finalReasoning =
      winReason === "only_candidate"
        ? `Only candidate: ${bestObj.id}`
        : winReason === "highest_score"
          ? `Selected ${bestObj.id} (score ${r3(sorted[0].score)}); next was ${sorted[1].candidate.obj.id} (${r3(sorted[1].score)})`
          : `Tied at ${r3(sorted[0].score)} — resolved by id: ${bestObj.id} over ${sorted[1].candidate.obj.id}`;

    const debugPayload: HadeDebugPayload = {
      candidates_evaluated: timeWindowCandidates.length,
      ugc_injected: ugcInjectedCount,
      rejection_applied: rejected.size > 0,
      final_reasoning: finalReasoning,
      scoring_breakdown: top3.map(({ candidate, breakdown }) => ({
        venue_id:        candidate.obj.id,
        venue_name:      candidate.obj.title,
        category:        candidate.category,
        proximity_score: r3(breakdown.timeProximityScore),
        context_score:   r3(breakdown.distanceScore),
        intent_score:    r3(breakdown.socialScore),
        final_score:     r3(breakdown.finalScore),
        isUGC:           candidate.obj.type === "ugc_event",
        distance:        candidate.distance_meters ?? 0,
        trust_score:     r3(breakdown.trustScore),
      })),
    };

    const explanation_signals: ExplanationSignals = {
      vibe_match:
        best.breakdown.socialScore >= 0.3 ? "strong"
        : best.breakdown.socialScore > 0  ? "moderate"
        : "none",
      social_proof:
        best.breakdown.trustScore >= 0.6 ? "high"
        : best.breakdown.trustScore >= 0.5 ? "moderate"
        : "none",
    };

    const baseCandidate = toDecisionCandidate(bestObj);
    const topCandidate: DecisionCandidate = {
      ...baseCandidate,
      metadata: {
        ...baseCandidate.metadata,
        distance_meters: bestDistance,
        time_relevance: r3(best.breakdown.timeProximityScore),
      },
    };

    return { ok: true, data, objects: fallbackObjects, debugPayload, explanation_signals, topCandidate };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[hade-synthetic ${reqId}] ✗ threw unexpectedly: ${detail}`);
    return { ok: false };
  }
}
