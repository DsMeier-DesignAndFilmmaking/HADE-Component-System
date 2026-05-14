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
import { fetchMultiQueryGrounded, DOMAIN_CATEGORY_BUCKETS, DOMAIN_RADIUS_M } from "@/core/services/places";
import { mapIntentToPlacesCategory } from "@/core/utils/intentMapper";
import {
  buildContext,
  generateSituationSummary,
  haversineDistanceMeters,
  inferIntentFromTime,
} from "@/lib/hade/engine";
import { getNodeTrustScore, getNodeVibeScore } from "@/lib/hade/weights";
import { getDistanceCopy } from "@/lib/hade/ugcCopy";
import { getNearbyUGC } from "@/lib/hade/ugc";
import { getDomainConfig, type ExtendedDomainConfig, type ScoringWeights } from "@/core/domain/domainConfigs";
import { DOMAIN_TYPE_BLACKLIST, filterByDomain } from "@/core/domain/filtering";
import { RADIUS } from "@/core/constants/radius";
import type { DecisionCandidate } from "@/core/types/decision";
import type {
  ConfidenceLabel,
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
  | { ok: false; reason?: string };

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

/**
 * Map a 0–1 composite score to a scannable trust label.
 * Synthetic (Tier 2) is fallback-tier and caps at "Good fit".
 * "Strong pick" is reachable for high-scoring synthetic (Tier 1) decisions.
 * isFallback=true caps at "Good fit" — used only for Tier 2/3 degraded paths.
 */
function deriveConfidenceLabel(score: number, isFallback = false): ConfidenceLabel {
  if (isFallback) {
    if (score >= 0.40) return "Good fit";
    return "Exploratory";
  }
  if (score >= 0.65) return "Strong pick";
  if (score >= 0.40) return "Good fit";
  return "Exploratory";
}

// ─── SpontaneousObject pipeline types ─────────────────────────────────────────

/** Working unit during ranking: SpontaneousObject + optional distance/display metadata. */
export interface RankedCandidate {
  obj: SpontaneousObject;
  distance_meters?: number;
  category: string;
  address?: string;
  place_name?: string;
  location_label?: string;
  location_source?: UGCEntity["location_source"];
  place_id?: string;
  rating?: number;
  /** Raw Google Place type tokens. Absent for UGC candidates — used by domain type filter. */
  types?: string[];
}

/** All intermediate values produced by scoreSpontaneousCandidate, for trace logging. */
export interface SpontaneousScoreBreakdown {
  timeProximityScore: number;
  distanceScore: number;
  socialScore: number;
  trustScore: number;
  /** Recency-decayed mean of UGC weight_map entries. 0.5 = neutral (no UGC). */
  vibeScore: number;
  userStateBonus: number;
  /** +boost / -penalty applied based on domain ↔ Google place-type alignment. */
  domainTypeBonus: number;
  /** SOCIAL-only: bonus when going_count aligns with the user's group size. */
  groupFitBonus: number;
  /** TRAVEL-only: bonus for landmarks/viewpoints/high-quality unique attractions. */
  uniquenessBonus: number;
  /** Lens-only soft boost from candidate_categories. Positive-only; never filters. */
  lensCategoryBoost: number;
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
  metadata: Pick<RankedCandidate, "address" | "rating" | "place_name" | "location_label" | "location_source" | "place_id"> = {},
): RankedCandidate {
  return {
    obj,
    distance_meters: Math.round(haversineDistanceMeters(origin, obj.location)),
    category,
    ...metadata,
  };
}

function ugcToCandidate(entity: UGCEntity, origin: GeoLocation, now: number): RankedCandidate | null {
  if (!entity.geo || !Number.isFinite(entity.geo.lat) || !Number.isFinite(entity.geo.lng)) {
    return null;
  }

  const createdAt = isoToEpochMs(entity.created_at) ?? now;
  const expiresAt = isoToEpochMs(entity.expires_at) ?? now + 2 * 60 * 60 * 1000;
  const displayAddress = entity.location_label ?? entity.address ?? entity.place_name;
  const obj = fromUGC({
    id: entity.id,
    title: entity.venue_name,
    type: "ugc_event",
    location: {
      lat: entity.geo.lat,
      lng: entity.geo.lng,
      ...(entity.place_id ? { place_id: entity.place_id } : {}),
    },
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
    {
      ...(displayAddress ? { address: displayAddress } : {}),
      ...(entity.place_name ? { place_name: entity.place_name } : {}),
      ...(entity.location_label ? { location_label: entity.location_label } : {}),
      ...(entity.location_source ? { location_source: entity.location_source } : {}),
      ...(entity.place_id ? { place_id: entity.place_id } : {}),
    },
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
    types: place.types,
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

// ─── Domain type filter ───────────────────────────────────────────────────────

/**
 * Removes Google Places candidates whose raw `types` array has no overlap with
 * `config.allowedPlaceTypes`. UGC candidates (no `types` field) always pass.
 *
 * Fail-soft:
 *   • Undefined config → resolve to default via getDomainConfig(undefined).
 *   • Empty/missing allowlist → return candidates unchanged.
 *   • Allowlist would empty the pool → return original candidates (never crash ranking).
 */
// Category-level domain gate for UGC / custom candidates (no Google types field).
// Mirrors DOMAIN_TYPE_WHITELIST in filtering.ts but operates on HADE category tokens
// (the normalized strings set by normalizeCategory() in places.ts).
const DOMAIN_CATEGORY_WHITELIST: Record<string, Set<string>> = {
  dining: new Set(["restaurant", "cafe", "bar", "bakery", "meal_takeaway", "meal_delivery"]),
  social: new Set(["bar", "night_club", "nightclub", "park", "event_venue", "venue", "movie_theater", "theater"]),
  travel: new Set(["tourist_attraction", "museum", "art_gallery", "gallery", "landmark", "amusement_park"]),
};

function filterCandidatesByDomain(
  candidates: RankedCandidate[],
  config: ExtendedDomainConfig | undefined,
  lensCategories?: readonly string[],
): RankedCandidate[] {
  // Safe fallback — defaults to DINING when config is missing for any reason
  const safeConfig = config ?? getDomainConfig(undefined);
  console.log("[HADE MODE]", safeConfig.id);
  console.log("[HADE FILTER] before:", candidates.length);

  const allowed = safeConfig.allowedPlaceTypes;
  if (!allowed || allowed.length === 0) {
    console.warn("[HADE FILTER] allowedPlaceTypes missing for domain:", safeConfig.id);
    console.log("[HADE FILTER] after:", candidates.length);
    return candidates;
  }

  const allowedSet = new Set(allowed);
  const ugcAllowed = DOMAIN_CATEGORY_WHITELIST[safeConfig.id];
  const lensTypeSet = new Set(expandLensCategoriesToPlaceTypes(lensCategories));
  const lensCategorySet = new Set((lensCategories ?? []).map(normalizeCategoryToken));

  const filtered = candidates.filter((c) => {
    // UGC events are community social content — always admitted regardless of domain
    if (c.obj.type === "ugc_event") return true;
    // Has Google types → use allowedPlaceTypes gate (same as filterByDomain)
    if (c.types && c.types.length > 0) {
      if (c.types.some((t) => DOMAIN_TYPE_BLACKLIST.has(t))) return false;
      const domainMatch = c.types.some((t) => allowedSet.has(t));
      const lensMatch = c.types.some((t) => lensTypeSet.has(normalizeCategoryToken(t)));
      return domainMatch || lensMatch;
    }
    // No types (custom / unknown) → gate by normalized category string
    if (ugcAllowed && c.category) {
      const normalizedCategory = normalizeCategoryToken(c.category);
      return ugcAllowed.has(c.category) || lensCategorySet.has(normalizedCategory);
    }
    // Unknown category and no types — admit rather than silently drop
    return true;
  });

  // No fail-soft: an empty filtered pool is a real signal — let the upstream
  // empty-pool guard handle it. Restoring the unfiltered pool here was the
  // primary path by which off-domain candidates reached scoring.
  console.log("[HADE FILTER] after:", filtered.length);
  // Always emit — required for cross-domain differentiation diagnostics.
  console.log("[HADE FILTERED COUNT]", filtered.length);
  return filtered;
}

function filterPlacesByDomainWithLens(
  places: PlaceOption[],
  domain: string,
  lensCategories?: readonly string[],
): PlaceOption[] {
  const domainFiltered = filterByDomain(places, domain);
  if (!lensCategories || lensCategories.length === 0) return domainFiltered;

  const keptIds = new Set(domainFiltered.map((place) => place.id));
  const lensTypeSet = new Set(expandLensCategoriesToPlaceTypes(lensCategories));
  const lensCategorySet = new Set(lensCategories.map(normalizeCategoryToken));
  const lensAdmitted = places.filter((place) => {
    if (keptIds.has(place.id)) return false;
    const types = place.types ?? [];
    if (types.some((type) => DOMAIN_TYPE_BLACKLIST.has(type))) return false;
    const typeMatch = types.some((type) => lensTypeSet.has(normalizeCategoryToken(type)));
    const categoryMatch = lensCategorySet.has(normalizeCategoryToken(place.category));
    return typeMatch || categoryMatch;
  });

  if (lensAdmitted.length > 0 && process.env.NODE_ENV !== "production") {
    console.log("[HADE LENS FILTER]", {
      mode: domain,
      domain_kept: domainFiltered.length,
      lens_admitted: lensAdmitted.length,
      lens_categories: lensCategories,
    });
  }

  return [...domainFiltered, ...lensAdmitted];
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
 * Per-domain Google-type boost lists. A candidate whose types intersect this
 * set receives DOMAIN_TYPE_BOOST; otherwise it receives DOMAIN_TYPE_PENALTY.
 * UGC candidates (no `types`) are neutral — bonus = 0.
 *
 * These values are intentionally large enough to flip rankings for candidates
 * with similar base scores, ensuring the same input produces visibly different
 * outputs across dining / social / travel.
 */
const DOMAIN_BOOST_TYPES: Record<string, string[]> = {
  // Mirrors the canonical MUST-include sets in domainConfigs.allowedPlaceTypes.
  dining: ["restaurant", "cafe", "bakery", "bar"],
  social: ["park", "event_venue", "bar", "public_space", "community_center"],
  travel: [
    "landmark",
    "museum",
    "attraction",
    "viewpoint",
    "tourist_attraction",
    "historical_landmark",
    "observation_deck",
  ],
};
const DOMAIN_TYPE_BOOST   = 0.25;
const DOMAIN_TYPE_PENALTY = -0.20;
const LENS_EXACT_MATCH_BOOST = 0.08;
const LENS_UGC_MATCH_BOOST = 0.06;
const LENS_LOOSE_MATCH_BOOST = 0.04;

function computeDomainTypeBonus(
  types: string[] | undefined,
  domainId: string | undefined,
): number {
  // UGC (no types) and unknown domains are domain-neutral
  if (!domainId || !types || types.length === 0) return 0;
  const boostList = DOMAIN_BOOST_TYPES[domainId];
  if (!boostList) return 0;
  return types.some((t) => boostList.includes(t)) ? DOMAIN_TYPE_BOOST : DOMAIN_TYPE_PENALTY;
}

function normalizeCategoryToken(token: string): string {
  return token.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const LENS_PLACE_TYPE_ALIASES: Record<string, readonly string[]> = {
  bookstore: ["book_store"],
  market: ["supermarket", "grocery_store"],
  event: ["event_venue"],
  food: ["restaurant", "cafe"],
  health: ["gym", "spa"],
  yoga: ["yoga_studio"],
  wellness: ["gym", "spa", "yoga_studio"],
  route: ["park", "tourist_attraction"],
  point_of_interest: ["tourist_attraction", "landmark"],
  nightclub: ["night_club"],
};

function expandLensCategoriesToPlaceTypes(categories?: readonly string[]): string[] {
  const seen = new Set<string>();

  for (const category of categories ?? []) {
    const normalized = normalizeCategoryToken(category);
    if (!normalized) continue;
    const placeTypes = LENS_PLACE_TYPE_ALIASES[normalized] ?? [normalized];
    for (const placeType of placeTypes) {
      const normalizedPlaceType = normalizeCategoryToken(placeType);
      if (normalizedPlaceType) seen.add(normalizedPlaceType);
    }
  }

  return [...seen];
}

function buildLensCategoryBuckets(categories?: readonly string[]): string[][] | undefined {
  const placeTypes = expandLensCategoriesToPlaceTypes(categories);
  return placeTypes.length > 0 ? placeTypes.map((placeType) => [placeType]) : undefined;
}

const LOOSE_LENS_GROUPS: readonly (readonly string[])[] = [
  ["restaurant", "cafe", "bakery", "meal_takeaway", "meal_delivery", "food", "bar"],
  ["bookstore", "book_store", "clothing_store", "store", "shopping_mall", "market", "mall", "grocery"],
  ["transit_station", "route", "park", "point_of_interest", "tourist_attraction", "landmark"],
  ["movie_theater", "art_gallery", "gallery", "museum", "bar", "night_club", "nightclub", "event", "event_venue", "venue", "theater"],
  ["cafe", "bar", "community_center", "event", "event_venue", "restaurant", "venue"],
  ["gym", "spa", "park", "health", "yoga", "wellness", "fitness_center", "yoga_studio"],
];

function hasLooseLensOverlap(candidateTokens: Set<string>, lensTokens: Set<string>): boolean {
  return LOOSE_LENS_GROUPS.some((group) => {
    const normalizedGroup = group.map(normalizeCategoryToken);
    return (
      normalizedGroup.some((token) => candidateTokens.has(token)) &&
      normalizedGroup.some((token) => lensTokens.has(token))
    );
  });
}

function computeLensCategoryBoost(
  candidate: RankedCandidate,
  lensCategories?: readonly string[],
): number {
  if (!lensCategories || lensCategories.length === 0) return 0;

  const lensTokens = new Set(lensCategories.map(normalizeCategoryToken).filter(Boolean));
  if (lensTokens.size === 0) return 0;

  const candidateTokens = new Set(
    [
      candidate.category,
      candidate.obj.vibe_tag,
      ...(candidate.types ?? []),
    ]
      .filter((token): token is string => typeof token === "string" && token.trim().length > 0)
      .map(normalizeCategoryToken),
  );

  if (candidateTokens.size === 0) return 0;

  const exactMatch = [...candidateTokens].some((token) => lensTokens.has(token));
  if (exactMatch) {
    return candidate.obj.type === "ugc_event" ? LENS_UGC_MATCH_BOOST : LENS_EXACT_MATCH_BOOST;
  }

  return hasLooseLensOverlap(candidateTokens, lensTokens) ? LENS_LOOSE_MATCH_BOOST : 0;
}

/**
 * SOCIAL-only group-fit bonus.
 *
 *   • Crowd venues (going_count >= 5) match groups of 3+ → +0.10
 *   • Quiet venues (going_count <= 2) match solo (group_size === 1) → +0.05
 *   • Mismatch (e.g. solo + heavy crowd, or large group + empty venue) → 0
 *
 * Other domains are not affected.
 */
function computeGroupFitBonus(
  obj: SpontaneousObject,
  groupSize: number | undefined,
  domainId: string | undefined,
): number {
  if (domainId !== "social" || !groupSize || groupSize < 1) return 0;
  const going = obj.going_count ?? 0;
  if (groupSize >= 3 && going >= 5) return 0.10;
  if (groupSize === 1 && going <= 2) return 0.05;
  return 0;
}

/**
 * TRAVEL-only uniqueness + visual-appeal bonus.
 *
 *   • Visual-appeal types (landmarks, monuments, viewpoints, observation decks) → +0.10
 *   • High-quality / "unique" trust score (>= 0.80, ~4.5+ rating proxy)         → +0.05
 *
 * The two stack — a high-rated landmark gets the full +0.15.
 */
const UNIQUE_TRAVEL_TYPES = new Set([
  "landmark",
  "historical_landmark",
  "monument",
  "viewpoint",
  "observation_deck",
  "scenic_lookout",
  "art_gallery",
]);

function computeUniquenessBonus(
  types: string[] | undefined,
  trustScore: number,
  domainId: string | undefined,
): number {
  if (domainId !== "travel") return 0;
  let bonus = 0;
  if (types && types.some((t) => UNIQUE_TRAVEL_TYPES.has(t))) bonus += 0.10;
  if (trustScore >= 0.80) bonus += 0.05;
  return bonus;
}

// ─── Post-ranking diversity selection ────────────────────────────────────────

/**
 * Selects the winner from the sorted ranking list, applying one pass of
 * category diversity to avoid same-category repetition.
 *
 * Rules:
 *   • Activates only after 2+ rejections (first two picks use pure score).
 *   • If the top candidate's category is in the rejected-categories set, look
 *     for the highest-scoring alternative in a different category.
 *   • The alternative must score within 15% of the top score — nearby relevance
 *     is preserved; a distant café never beats an obvious close restaurant.
 *   • If no in-threshold alternative exists, the top candidate is returned as-is.
 */
function selectWithDiversity(
  sorted: Array<{ candidate: RankedCandidate; score: number; breakdown: SpontaneousScoreBreakdown }>,
  rejectedCategories: Set<string>,
  rejectionCount: number,
): (typeof sorted)[0] {
  if (sorted.length < 2 || rejectionCount < 2 || rejectedCategories.size === 0) return sorted[0];

  const top = sorted[0];
  if (!rejectedCategories.has(top.candidate.category.toLowerCase())) return top;

  const threshold = top.score * 0.85;
  const alternative = sorted.find(
    (c, i) =>
      i > 0 &&
      c.score >= threshold &&
      !rejectedCategories.has(c.candidate.category.toLowerCase()),
  );

  if (alternative) {
    console.log(
      `[hade-diversity] category-swap: "${alternative.candidate.obj.title}" ` +
        `(${alternative.candidate.category}, score=${r3(alternative.score)})` +
        ` over "${top.candidate.obj.title}" (${top.candidate.category}, score=${r3(top.score)})`,
    );
  }

  return alternative ?? top;
}

/**
 * Scores a SpontaneousObject candidate using the new ranking formula:
 *
 *   time_proximity (0.45) — inverse decay from window start; 1 if starting now
 *   distance       (0.30) — inverse linear decay over 3000 m
 *   social_score   (0.15) — going_count normalised to [0, 1] (50 = max)
 *   trust_score    (0.10) — persisted trust value from SpontaneousObject
 *   user_state     (+0.10 / +0.05) — additive bonus for confirmed RSVP
 *   domain_type    (+0.25 / −0.20) — additive bias based on domain ↔ Google type alignment
 *
 * Venues with no UGC history default to trust_score=0.5 and going_count=0,
 * so they score identically to the neutral baseline — no crash, no bias.
 */
function scoreSpontaneousCandidate(
  candidate: RankedCandidate,
  now: number,
  vibeScore: number,
  weights?: ScoringWeights,
  explorationBias = 0,
  domainId?: string,
  groupSize?: number,
  lensCategories?: readonly string[],
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

  const w = weights ?? { time: 0.55, social: 0.25, distance: 0.10, trust: 0.05, vibe: 0.05 };
  const baseScore =
    timeProximityScore * w.time          +
    socialScore        * w.social        +
    distanceScore      * w.distance      +
    trustScore         * w.trust         +
    vibeScore          * (w.vibe ?? 0.05);

  const domainTypeBonus  = computeDomainTypeBonus(candidate.types, domainId);
  const groupFitBonus    = computeGroupFitBonus(obj, groupSize, domainId);
  const uniquenessBonus  = computeUniquenessBonus(candidate.types, trustScore, domainId);
  const lensCategoryBoost = computeLensCategoryBoost(candidate, lensCategories);
  const jitter = explorationBias > 0 ? (Math.random() - 0.5) * explorationBias * 0.2 : 0;

  return {
    timeProximityScore,
    distanceScore,
    socialScore,
    trustScore,
    vibeScore,
    userStateBonus,
    domainTypeBonus,
    groupFitBonus,
    uniquenessBonus,
    lensCategoryBoost,
    finalScore: clamp(
      baseScore +
        userStateBonus +
        domainTypeBonus +
        groupFitBonus +
        uniquenessBonus +
        lensCategoryBoost +
        jitter,
      0,
      1,
    ),
  };
}

export async function rankSpontaneousObjects(
  candidates: RankedCandidate[],
  now: number = Date.now(),
  weights?: ScoringWeights,
  explorationBias = 0,
  domainId?: string,
  groupSize?: number,
  lensCategories?: readonly string[],
): Promise<Array<{ candidate: RankedCandidate; score: number; breakdown: SpontaneousScoreBreakdown }>> {
  const scoredCandidates = await Promise.all(
    candidates.map(async (candidate) => {
      const [nodeTrust, nodeVibe] = await Promise.all([
        getNodeTrustScore(candidate.obj.id),
        getNodeVibeScore(candidate.obj.id),
      ]);
      const effectiveTrust = (candidate.obj.trust_score + nodeTrust) / 2;
      const candidateWithTrust: RankedCandidate = {
        ...candidate,
        obj: { ...candidate.obj, trust_score: effectiveTrust },
      };
      const vibeWeight = weights?.vibe ?? 0.05;
      console.log(
        `[hade-trace] Vibe Weight Applied: ${candidate.obj.id} -> Score: ${nodeVibe.toFixed(3)} (Impact: +${(nodeVibe * vibeWeight).toFixed(3)})`,
      );
      const breakdown = scoreSpontaneousCandidate(
        candidateWithTrust,
        now,
        nodeVibe,
        weights,
        explorationBias,
        domainId,
        groupSize,
        lensCategories,
      );
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

    // ── Guard: unknown geo — skip Places to avoid fake-location results ───────
    // The route gates Tier 1 before calling here, but this check provides an
    // additional defence for any future call sites that omit the gate.
    const geoSourceRaw = (body as { geo_source?: unknown }).geo_source;
    if (geoSourceRaw === "unknown") {
      console.warn(`[hade-synthetic ${reqId}] geo_source=unknown — skipping Places fetch`);
      return { ok: false, reason: "unknown_geo" };
    }

    const intent = extractIntent(body);
    const radius = extractRadius(body);
    const ctx = buildContext(body as Partial<HadeContext>);
    const situationSummary = generateSituationSummary(ctx);
    const domainMode = (body as { mode?: unknown }).mode as string | undefined;
    const config = getDomainConfig(domainMode);
    console.log("[HADE MODE]", config.id);

    const callerCategories = (body as { candidate_categories?: unknown }).candidate_categories;
    const callerCategoryList = Array.isArray(callerCategories)
      ? callerCategories
          .filter((category): category is string => typeof category === "string")
          .map((category) => category.trim())
          .filter(Boolean)
      : undefined;
    const categories =
      callerCategoryList && callerCategoryList.length > 0
        ? callerCategoryList
        : config.categoryResolver(ctx);
    const primaryCategory = categories[0] ?? "broad";
    console.log("[HADE DEBUG] categories:", categories);

    // ── Pre-extract rejected IDs — reused in Places pre-filter and Step 3 ──────
    const rawRejections = (body as { rejection_history?: unknown }).rejection_history;
    const rejectedIds = new Set<string>(
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

    // Name-based exclusion set — catches SDK-style entries that omit venue_id.
    // Normalised to lowercase trim for case-insensitive matching.
    const rejectedNames = new Set<string>(
      Array.isArray(rawRejections)
        ? rawRejections.flatMap((entry) => {
            if (entry && typeof entry === "object" && "venue_name" in entry) {
              const n = (entry as { venue_name: unknown }).venue_name;
              return typeof n === "string" && n.trim() ? [n.trim().toLowerCase()] : [];
            }
            return [];
          })
        : [],
    );

    // Category exclusion set — populated from RejectionEntry.category (added in Task 4).
    // Used by selectWithDiversity() to avoid same-category repetition.
    const rejectedCategories = new Set<string>(
      Array.isArray(rawRejections)
        ? rawRejections.flatMap((entry) => {
            if (entry && typeof entry === "object" && "category" in entry) {
              const c = (entry as { category: unknown }).category;
              return typeof c === "string" && c.trim() ? [c.trim().toLowerCase()] : [];
            }
            return [];
          })
        : [],
    );

    const rejectionCount = Array.isArray(rawRejections) ? rawRejections.length : 0;

    console.log(`[HADE Tier 2] domain=${config.id} intent="${intent ?? "any"}" category="${primaryCategory}"`);

    // ── Step 1: Fetch UGC (primary) and Places (fallback) ─────────────────────
    const now = Date.now();
    const ugcCandidates = await getUGCObjects(body, geoHint, radius, now);

    const domainRadius = DOMAIN_RADIUS_M[config.id] ?? radius;
    const domainBuckets = DOMAIN_CATEGORY_BUCKETS[config.id];
    const lensBuckets = callerCategoryList ? buildLensCategoryBuckets(callerCategoryList) : undefined;

    console.log(
      `[hade-synthetic ${reqId}] fetching places` +
        ` (intent=${intent ?? "any"}, radius=${domainRadius}m, category=${primaryCategory})`,
    );

    let places: PlaceOption[];
    try {
      places = lensBuckets && lensBuckets.length > 0 && geoHint
        ? await fetchMultiQueryGrounded({ geo: geoHint, categoryBuckets: lensBuckets, radius_meters: domainRadius })
        : domainBuckets && geoHint
          ? await fetchMultiQueryGrounded({ geo: geoHint, categoryBuckets: domainBuckets, radius_meters: domainRadius })
        : await getPlacesCandidates(ctx, categories);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[hade-synthetic ${reqId}] Places fetch failed (${detail}) — continuing with UGC-only`);
      places = [];
    }
    const rawPlacesCount = places.length;

    console.log("[HADE PLACES RAW]", {
      count: rawPlacesCount,
      sample: places.slice(0, 3).map((p) => ({
        id: p.id,
        name: p.name,
        hasLocation: !!(p.geo?.lat && p.geo?.lng),
        lat: p.geo?.lat ?? null,
        lng: p.geo?.lng ?? null,
        rating: p.rating ?? null,
        types: (p.types ?? []).slice(0, 5),
      })),
    });

    const filteredPlaces = filterPlacesByDomainWithLens(places, config.id, callerCategoryList);

    console.log("[HADE FILTER ENFORCED]", {
      mode: config.id,
      input: rawPlacesCount,
      output: filteredPlaces.length,
    });

    // ── Last-resort bypass ────────────────────────────────────────────────────
    // When the domain type-filter drops EVERY candidate but Google returned real
    // data, fall back to blacklist-only filtering rather than giving up entirely.
    // This prevents cold_start_fallback when valid Places data is available but
    // doesn't match the strict domain/lens whitelist (e.g. restaurants returned
    // for a travel-mode Urban Mobility query).
    let candidatePlaces = filteredPlaces;
    let isLastResort = false;

    if (filteredPlaces.length === 0 && rawPlacesCount > 0) {
      const blacklistOnly = places.filter(
        (p) => !p.types?.some((t) => DOMAIN_TYPE_BLACKLIST.has(t)),
      );
      console.warn("[HADE FALLBACK REASON]", {
        reason: "places_returned_but_zero_valid_candidates",
        raw_places_count: rawPlacesCount,
        normalized_count: 0,
        scored_count: 0,
        rejection_summary: {
          domain_filter_dropped_all: rawPlacesCount,
          blacklist_only_survivors: blacklistOnly.length,
        },
      });
      if (blacklistOnly.length > 0) {
        candidatePlaces = blacklistOnly;
        isLastResort = true;
        console.log(
          `[hade-synthetic ${reqId}] last-resort: domain filter dropped all ${rawPlacesCount}` +
            ` place(s) — using ${blacklistOnly.length} blacklist-only survivor(s)`,
        );
      }
    }

    if (candidatePlaces.length === 0 && ugcCandidates.length === 0) {
      return { ok: false, reason: "no_domain_candidates" };
    }
    if (candidatePlaces.length === 0 && !isLastResort) {
      console.log(`[hade-synthetic ${reqId}] no Places results — proceeding with ${ugcCandidates.length} UGC candidate(s)`);
    }

    // ── Rejection pre-filter: strip already-rejected Places before conversion ──
    // Two signals: ID (primary, always present from hooks.ts) + normalised name
    // (fallback for SDK-style entries that omit venue_id).
    const freshCandidates =
      rejectedIds.size > 0 || rejectedNames.size > 0
        ? candidatePlaces.filter(
            (p) =>
              !rejectedIds.has(p.id) &&
              !rejectedNames.has(p.name.toLowerCase().trim()),
          )
        : candidatePlaces;

    console.log("[HADE FRESH COUNT]", freshCandidates.length);

    if (freshCandidates.length === 0 && ugcCandidates.length === 0) {
      console.warn("[HADE] No fresh candidates after rejection — aborting decision");
      return { ok: false };
    }

    const placeCandidates = freshCandidates
      .map((place) => placeToCandidate(place, geoHint, now))
      .filter((candidate): candidate is RankedCandidate => candidate !== null);

    const googleCount = placeCandidates.length;
    const ugcInjectedCount = ugcCandidates.length;

    console.log("[HADE CANDIDATE NORMALIZED]", {
      input_count: freshCandidates.length,
      output_count: googleCount,
      rejected_count: freshCandidates.length - googleCount,
      rejected_reasons: freshCandidates.length > googleCount ? ["missing_location_or_id"] : [],
      is_last_resort: isLastResort,
    });

    // ── Step 2: Merge SpontaneousObject arrays ────────────────────────────────
    // In last-resort mode the domain type-gate is already bypassed upstream —
    // running filterCandidatesByDomain here would re-apply the same whitelist
    // and drop the survivors again. Skip it; only UGC candidates need gating.
    const mergedCandidates = isLastResort
      ? mergeCandidates(ugcCandidates, placeCandidates)
      : filterCandidatesByDomain(
          mergeCandidates(ugcCandidates, placeCandidates),
          config,
          callerCategoryList,
        );

    // ── Step 3: HARD EXCLUSION of rejected objects ────────────────────────────
    // "Not This" must guarantee a rejected venue is NEVER returned again in the
    // same session. ID filter is the primary signal; name filter is the fallback
    // for SDK-style entries and any UGC candidate that slipped through the merge.
    const admittedCandidates =
      rejectedIds.size > 0 || rejectedNames.size > 0
        ? mergedCandidates.filter(
            (candidate) =>
              !rejectedIds.has(candidate.obj.id) &&
              !rejectedNames.has(candidate.obj.title.toLowerCase().trim()),
          )
        : mergedCandidates;

    if (admittedCandidates.length === 0) {
      console.warn(
        `[hade-synthetic ${reqId}] all ${mergedCandidates.length} candidate(s) rejected` +
          ` (rejection_history size=${rejectedIds.size}) — falling through to Tier 3`,
      );
      return { ok: false };
    }

    if (rejectedIds.size > 0) {
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

    // ── Step 4.5: Apply rejection sensitivity ────────────────────────────────
    // Each rejection entry's pivot_reason may shift scoring weights so the
    // engine steers away from the same failure mode on subsequent requests.
    // "Not This" entries also ratchet up exploration_bias, making successive
    // rankings progressively less deterministic.
    let effectiveWeights = { ...config.scoringWeights };
    if (Array.isArray(rawRejections)) {
      for (const entry of rawRejections) {
        const reason =
          entry && typeof entry === "object" && "pivot_reason" in entry
            ? (entry as { pivot_reason: unknown }).pivot_reason
            : null;
        if (typeof reason === "string") {
          const transformer = config.rejectionSensitivity[reason];
          if (transformer) effectiveWeights = transformer(effectiveWeights);
        }
      }
    }

    // If any transformer wrote exploration_bias into the weights, use it;
    // otherwise fall back to the domain's static explorationBias.
    const effectiveExplorationBias =
      effectiveWeights.exploration_bias ?? config.explorationBias;

    // ── Step 5: Score and rank ────────────────────────────────────────────────
    console.log("[HADE SCORING INPUT COUNT]", timeWindowCandidates.length);
    console.log("[HADE SCORING]", {
      candidate_count: timeWindowCandidates.length,
      scored_count: timeWindowCandidates.length,
      is_last_resort: isLastResort,
      top_candidates: timeWindowCandidates.slice(0, 3).map((c) => ({
        id: c.obj.id,
        title: c.obj.title,
        distance_meters: c.distance_meters ?? null,
        category: c.category,
        types: (c.types ?? []).slice(0, 4),
      })),
    });
    const sorted = await rankSpontaneousObjects(
      timeWindowCandidates,
      now,
      effectiveWeights,
      effectiveExplorationBias,
      config.id,
      ctx.social?.group_size,
      categories,
    );

    if (!sorted[0]) return { ok: false };
    const best = selectWithDiversity(sorted, rejectedCategories, rejectionCount);

    if (process.env.NODE_ENV !== "production") {
      console.log("[HADE TOP RESULT TYPES]", best.candidate.types ?? []);
      console.log("[HADE LENS SCORE]", {
        categories,
        selected: best.candidate.obj.id,
        lensCategoryBoost: r3(best.breakdown.lensCategoryBoost),
      });
    }

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
      ...config.narrative(
        { title: bestObj.title, category: bestCategory, distance_meters: bestDistance, vibe_tag: bestObj.vibe_tag, address: best.candidate.address },
        ctx,
      ),
      confidence: best.breakdown.finalScore,
      confidence_label: deriveConfidenceLabel(best.breakdown.finalScore, false),
      situation_summary: situationSummary,
      ...(best.candidate.address ? { neighborhood: best.candidate.address } : {}),
      ...ugcMeta,
      ...(process.env.NODE_ENV !== "production"
        ? {
            score_debug: {
              distance_fit:     r3(best.breakdown.distanceScore),
              timing_fit:       r3(best.breakdown.timeProximityScore),
              intent_fit:       r3(best.breakdown.vibeScore + best.breakdown.lensCategoryBoost),
              novelty:          r3(best.breakdown.uniquenessBonus),
              social_signal:    r3(best.breakdown.socialScore),
              fallback_penalty: 0,
              final_score:      r3(best.breakdown.finalScore),
            },
          }
        : {}),
    };

    if (process.env.NODE_ENV !== "production") {
      console.log("[HADE FINAL MODE RESULT]", {
        mode: config.id,
        name: decision.venue_name,
        types: best.candidate.types ?? [],
      });
    }

    // ── Assemble DecideResponse ───────────────────────────────────────────────
    // fallbackObjects derives from timeWindowCandidates, which is the terminal
    // end of the filtered pipeline:
    //   filteredPlaces → freshCandidates → placeCandidates
    //   → mergedCandidates (filterCandidatesByDomain) → admittedCandidates
    //   → timeWindowCandidates
    // No unfiltered data can reach this point — the guard at the filterByDomain
    // call site returns { ok: false } before we get here if filteredPlaces is empty.
    const fallbackObjects = filteredPlaces.length > 0
      ? timeWindowCandidates.map((c) => c.obj)
      : [];

    console.log("[HADE FALLBACK SOURCE]", {
      usingFiltered: true,
      count: fallbackObjects.length,
    });

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
        weights: effectiveWeights,
        explorationBias: config.explorationBias,
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
        domainTypeBonus:    r3(breakdown.domainTypeBonus),
        groupFitBonus:      r3(breakdown.groupFitBonus),
        uniquenessBonus:    r3(breakdown.uniquenessBonus),
        lensCategoryBoost:  r3(breakdown.lensCategoryBoost),
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
      rejection_applied: rejectedIds.size > 0,
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
