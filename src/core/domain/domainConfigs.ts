import "server-only";

import { mapIntentToPlacesCategory } from "@/core/utils/intentMapper";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScoringWeights = {
  time:     number;
  distance: number;
  social:   number;
  trust:    number;
};

export type WeightTransformer = (w: ScoringWeights) => ScoringWeights;

export type NarrativePlace = {
  title:          string;
  category:       string;
  distance_meters: number;
  vibe_tag?:      string;
  address?:       string;
};

export type NarrativeResult = {
  rationale: string;
  why_now:   string;
};

export type ExtendedDomainConfig = {
  id:               string;
  categoryResolver: (ctx: any) => string[];
  scoringWeights:   ScoringWeights;
  /**
   * Per-pivot-reason weight transformers.
   * Applied cumulatively for each matching entry in rejection_history.
   * Keys match `RejectionEntry.pivot_reason` values.
   */
  rejectionSensitivity: Partial<Record<string, WeightTransformer>>;
  /**
   * 0–1 multiplier on per-candidate score jitter.
   * Higher = more exploration, less determinism.
   * Dining: 0.05 (closest good option wins). Social: 0.15. Travel: 0.10.
   */
  explorationBias: number;
  /**
   * Required allowlist of raw Google Place type tokens.
   * Candidates whose types[] has no overlap with this list are removed before scoring.
   * UGC candidates (no types field) always pass through unconditionally.
   */
  allowedPlaceTypes: string[];
  /** Unified copy producer — replaces separate buildRationale + buildWhyNow. */
  narrative: (place: NarrativePlace, ctx: any) => NarrativeResult;
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

function distLabel(meters: number): string {
  if (meters < 80)   return "steps away";
  if (meters < 1000) return `${Math.round(meters)}m away`;
  return `${(meters / 1000).toFixed(1)}km away`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function intentOf(ctx: any): string | undefined {
  return ctx?.situation?.intent as string | undefined;
}

function timeOfDayOf(ctx: any): string | undefined {
  return ctx?.time_of_day as string | undefined;
}

// ─── Dining ──────────────────────────────────────────────────────────────────
//
// Dominant signal: distance (0.50) — the closest good option wins.
// Exploration: low — you want the nearest, not a surprise.
// Rejection sensitivity:
//   • "Too far"    → push distance weight up, find something closer
//   • "Overpriced" → push trust up, trust-score correlates with quality/value

const DINING_CONFIG: ExtendedDomainConfig = {
  id: "dining",

  categoryResolver(ctx) {
    const intent    = intentOf(ctx);
    const timeOfDay = timeOfDayOf(ctx);
    return mapIntentToPlacesCategory(intent ?? "", timeOfDay);
  },

  scoringWeights: { distance: 0.50, trust: 0.30, time: 0.10, social: 0.10 },

  explorationBias: 0.05,

  allowedPlaceTypes: [
    "restaurant",
    "cafe",
    "bakery",
    "meal_takeaway",
    "bar",
  ],

  rejectionSensitivity: {
    "Too far": (w) => ({
      ...w,
      distance: Math.min(0.70, w.distance + 0.10),
      trust:    Math.max(0.10, w.trust    - 0.05),
      time:     Math.max(0.05, w.time     - 0.05),
    }),
    "Overpriced": (w) => ({
      ...w,
      trust:    Math.min(0.50, w.trust    + 0.10),
      distance: Math.max(0.35, w.distance - 0.05),
      social:   Math.max(0.05, w.social   - 0.05),
    }),
  },

  narrative(place, ctx) {
    const dist = distLabel(place.distance_meters);
    const vibe = place.vibe_tag ?? place.category;
    const rationale = `A ${vibe} ${place.category} ${dist}.`;

    let why_now: string;
    switch (intentOf(ctx)) {
      case "eat":   why_now = "Right around the corner and open — go grab a bite."; break;
      case "drink": why_now = "Just nearby — good moment for a drink."; break;
      case "chill": why_now = "A calm spot close enough to walk to. Easy choice."; break;
      case "scene": why_now = "Lively atmosphere, just around the corner."; break;
      default:      why_now = "Close by and open. Good moment to go.";
    }
    return { rationale, why_now };
  },
};

// ─── Social ───────────────────────────────────────────────────────────────────
//
// Dominant signal: social proof (0.60) — the busiest place wins.
// Exploration: medium — social discovery benefits from variety.
// Rejection sensitivity:
//   • "Too crowded" → dial back social weight, shift toward distance
//   • "Wrong vibe"  → shift toward trust, away from pure crowd count

const SOCIAL_PLACE_TYPES = [
  "bar",
  "night_club",
  "live_music_venue",
  "event_venue",
  "cocktail_bar",
  "comedy_club",
  "performing_arts_theater",
  "wine_bar",
  "sports_bar",
] as const;

const SOCIAL_CONFIG: ExtendedDomainConfig = {
  id: "social",

  categoryResolver(ctx) {
    const intent = intentOf(ctx);
    if (intent === "eat") return ["restaurant", "food_court", "bar"];
    return [...SOCIAL_PLACE_TYPES];
  },

  scoringWeights: { social: 0.60, time: 0.20, distance: 0.10, trust: 0.10 },

  explorationBias: 0.15,

  allowedPlaceTypes: [
    "bar",
    "night_club",
    "park",
    "event_venue",
    "cafe",
  ],

  rejectionSensitivity: {
    "Too crowded": (w) => ({
      ...w,
      social:   Math.max(0.30, w.social   - 0.20),
      distance: Math.min(0.30, w.distance + 0.10),
      trust:    Math.min(0.25, w.trust    + 0.10),
    }),
    "Wrong vibe": (w) => ({
      ...w,
      trust:  Math.min(0.30, w.trust  + 0.10),
      social: Math.max(0.40, w.social - 0.10),
    }),
  },

  narrative(place, ctx) {
    const dist = distLabel(place.distance_meters);
    const cat  = capitalize(place.category);
    const rationale = `${cat} with a crowd — ${dist} and heating up.`;

    let why_now: string;
    switch (intentOf(ctx)) {
      case "scene": why_now = "It's live right now — people are already heading there."; break;
      case "drink": why_now = "The crowd is here. Go now before it peaks."; break;
      case "eat":   why_now = "Packed and electric — join the energy."; break;
      case "chill": why_now = "Surprisingly buzzing — more alive than it looks."; break;
      default:      why_now = "High energy right now. Don't sit this one out.";
    }
    return { rationale, why_now };
  },
};

// ─── Travel ───────────────────────────────────────────────────────────────────
//
// Dominant signal: trust / rating (0.60) — the best-rated place wins.
// Exploration: moderate — discovery mode accepts wider variety.
// Rejection sensitivity:
//   • "Too far"   → raise trust threshold (settle only for outstanding)
//   • "Wrong vibe"→ raise trust further, pull back distance

const TRAVEL_PLACE_TYPES = [
  "tourist_attraction",
  "museum",
  "art_gallery",
  "national_park",
  "park",
  "aquarium",
  "historical_landmark",
  "cultural_center",
  "city_park",
  "amusement_park",
] as const;

const TRAVEL_CONFIG: ExtendedDomainConfig = {
  id: "travel",

  categoryResolver() {
    return [...TRAVEL_PLACE_TYPES];
  },

  scoringWeights: { trust: 0.60, distance: 0.20, social: 0.10, time: 0.10 },

  explorationBias: 0.10,

  allowedPlaceTypes: [
    "tourist_attraction",
    "museum",
    "park",
    "landmark",
  ],

  rejectionSensitivity: {
    "Too far": (w) => ({
      ...w,
      trust:    Math.min(0.75, w.trust    + 0.05),
      distance: Math.max(0.10, w.distance - 0.05),
    }),
    "Wrong vibe": (w) => ({
      ...w,
      trust:    Math.min(0.80, w.trust    + 0.10),
      distance: Math.max(0.10, w.distance - 0.05),
      social:   Math.max(0.05, w.social   - 0.05),
    }),
  },

  narrative(place) {
    const dist = distLabel(place.distance_meters);
    const vibe = place.vibe_tag ?? place.category;
    const rationale = `Top-rated ${vibe} ${place.category} — ${dist}.`;
    const why_now   = "Highly rated and worth the trip — best choice in range.";
    return { rationale, why_now };
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const DOMAIN_CONFIGS: Record<string, ExtendedDomainConfig> = {
  dining: DINING_CONFIG,
  social: SOCIAL_CONFIG,
  travel: TRAVEL_CONFIG,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the ExtendedDomainConfig for a given mode string.
 * Accepts either "dining" | "social" | "travel" or the legacy persona modes
 * ("balanced" | "precise" | "explorative"), all of which fall through to dining.
 */
export function getDomainConfig(mode?: string): ExtendedDomainConfig {
  if (mode && Object.prototype.hasOwnProperty.call(DOMAIN_CONFIGS, mode)) {
    const config = DOMAIN_CONFIGS[mode];
    console.log("[HADE MODE]", config.id);
    return config;
  }
  console.log("[HADE MODE]", DINING_CONFIG.id);
  return DINING_CONFIG;
}
