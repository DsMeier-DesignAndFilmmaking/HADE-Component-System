import { mapIntentToPlacesCategory } from "@/core/utils/intentMapper";

// ─── DomainConfig ─────────────────────────────────────────────────────────────

export type RationaleParams = {
  vibe: string;
  category: string;
  distance_meters: number;
};

export type DomainConfig = {
  /** Stable identifier for this domain. */
  id: string;

  /**
   * Optional static allowlist of HADE category tokens supported by this domain.
   * When set, used as a guard during scoring. When absent, all categories pass.
   */
  categories?: string[];

  /**
   * Derives the ordered list of Google Place types to request for a given
   * context. Return an empty array to request the broadest possible search.
   */
  categoryResolver: (context: any) => string[];

  /** Relative weights for the Tier 2 spontaneous-object scoring formula. */
  scoringWeights: {
    time:     number;
    distance: number;
    social:   number;
    trust:    number;
  };

  copy: {
    /** One-line "why right now" rationale. Intent and time-aware. */
    buildWhyNow: (context: any) => string;
    /** One-line venue description injected into the decision card. */
    buildRationale: (params: RationaleParams) => string;
    /** Ordered list of last-resort static decision titles (Tier 3). */
    fallbackTitles: string[];
  };

  features: {
    /**
     * True when candidates carry meaningful time_window data (start/end ms).
     * When false, the time proximity scorer should be ignored or zeroed out.
     */
    usesTimeWindow:   boolean;
    /**
     * True when candidates carry going_count / maybe_count social proof.
     * When false, the social score component contributes nothing.
     */
    usesSocialProof:  boolean;
    /**
     * True when decisions are anchored to the user's physical location.
     * When false, geo validation is relaxed and distance scoring is skipped.
     */
    usesGeo:          boolean;
  };
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

function intentFromContext(context: any): string | undefined {
  return context?.situation?.intent as string | undefined;
}

function timeOfDayFromContext(context: any): string | undefined {
  return context?.time_of_day as string | undefined;
}

/** "320m" → "320m away" / "1.2km" → "1.2km away" / under 80m → "steps away" */
function distanceLabel(meters: number): string {
  if (meters < 80)    return "steps away";
  if (meters < 1000)  return `${Math.round(meters)}m away`;
  return `${(meters / 1000).toFixed(1)}km away`;
}

// ─── DINING domain ────────────────────────────────────────────────────────────
//
// Dominant signal: distance (0.50)
// Tone: convenient, immediate, low-friction
//
// The closest good option wins. Copy should feel effortless — no hype, no FOMO.

function diningCategoryResolver(context: any): string[] {
  const intent    = intentFromContext(context);
  const timeOfDay = timeOfDayFromContext(context);
  return mapIntentToPlacesCategory(intent ?? "", timeOfDay);
}

function diningBuildWhyNow(context: any): string {
  const intent = intentFromContext(context);
  switch (intent) {
    case "eat":   return "Just around the corner and open now — go grab a bite.";
    case "drink": return "Right nearby — good moment for a drink.";
    case "chill": return "A calm spot close enough to walk to. Easy choice.";
    case "scene": return "Lively atmosphere, just around the corner.";
    default:      return "Close by and open. Good moment to go.";
  }
}

function diningBuildRationale({ vibe, category, distance_meters }: RationaleParams): string {
  return `A ${vibe} ${category} ${distanceLabel(distance_meters)}.`;
}

const DINING_CONFIG: DomainConfig = {
  id: "dining",

  categoryResolver: diningCategoryResolver,

  // Proximity is everything for dining — eat where you are, not where you wish you were.
  scoringWeights: {
    distance: 0.50,
    trust:    0.30,
    time:     0.10,
    social:   0.10,
  },

  copy: {
    buildWhyNow:    diningBuildWhyNow,
    buildRationale: diningBuildRationale,
    fallbackTitles: [
      "Grab a bite nearby",
      "Find a coffee spot",
      "Explore local eats",
    ],
  },

  features: {
    usesTimeWindow:  true,
    usesSocialProof: false, // going_count irrelevant for dining; proximity wins
    usesGeo:         true,
  },
};

// ─── SOCIAL domain ────────────────────────────────────────────────────────────
//
// Dominant signal: social proof (0.60)
// Tone: urgent, live, FOMO-driven
//
// The busiest place wins. Copy should feel like you're missing out if you don't go now.

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

function socialBuildWhyNow(context: any): string {
  const intent = intentFromContext(context);
  switch (intent) {
    case "scene": return "It's live right now — people are already heading there.";
    case "drink": return "The crowd is here. Go now before it peaks.";
    case "eat":   return "Packed and electric — join the energy.";
    case "chill": return "Surprisingly buzzing — more alive than it looks.";
    default:      return "High energy right now. Don't sit this one out.";
  }
}

function socialBuildRationale({ category, distance_meters }: RationaleParams): string {
  return `${capitalize(category)} with a crowd — ${distanceLabel(distance_meters)} and heating up.`;
}

const SOCIAL_CONFIG: DomainConfig = {
  id: "social",

  // Social proof dominates — going_count is the primary signal.
  categoryResolver: (context: any) => {
    const intent = intentFromContext(context);
    if (intent === "eat") return ["restaurant", "food_court", "bar"];
    return [...SOCIAL_PLACE_TYPES];
  },

  scoringWeights: {
    social:   0.60,
    time:     0.20,
    distance: 0.10,
    trust:    0.10,
  },

  copy: {
    buildWhyNow:    socialBuildWhyNow,
    buildRationale: socialBuildRationale,
    fallbackTitles: [
      "Find where people are going",
      "Join the scene nearby",
      "Something's happening close by",
    ],
  },

  features: {
    usesTimeWindow:  true,  // Events are time-sensitive
    usesSocialProof: true,  // Core signal for this domain
    usesGeo:         true,
  },
};

// ─── TRAVEL domain ────────────────────────────────────────────────────────────
//
// Dominant signal: trust / rating (0.60)
// Tone: considered, authoritative, worth-it
//
// The best-rated place wins. Copy should justify the trip — not the distance.

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

function travelBuildWhyNow(_context: any): string {
  return "Highly rated and worth the trip — best choice in range.";
}

function travelBuildRationale({ vibe, category, distance_meters }: RationaleParams): string {
  return `Top-rated ${vibe} ${category} — ${distanceLabel(distance_meters)}.`;
}

const TRAVEL_CONFIG: DomainConfig = {
  id: "travel",

  // Travel is venue-type driven — intent doesn't narrow the category list.
  categoryResolver: () => [...TRAVEL_PLACE_TYPES],

  // Rating and trust dominate; proximity is secondary.
  scoringWeights: {
    trust:    0.60,
    distance: 0.20,
    social:   0.10,
    time:     0.10,
  },

  copy: {
    buildWhyNow:    travelBuildWhyNow,
    buildRationale: travelBuildRationale,
    fallbackTitles: [
      "Explore something nearby",
      "Check out a local landmark",
      "Take a walk somewhere new",
    ],
  },

  features: {
    usesTimeWindow:  false, // Attractions don't have tight time windows
    usesSocialProof: false, // Ratings matter more than going_count for travel
    usesGeo:         true,
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const DOMAIN_REGISTRY: Record<string, DomainConfig> = {
  dining:  DINING_CONFIG,
  social:  SOCIAL_CONFIG,
  travel:  TRAVEL_CONFIG,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the DomainConfig for a given mode identifier.
 *
 * Supported domain modes: "dining" | "social" | "travel"
 * Defaults to DINING_CONFIG when mode is absent or unrecognised.
 * The persona modes "balanced"|"precise"|"explorative" fall through to dining.
 */
export function getDomainConfig(mode?: string): DomainConfig {
  if (mode && Object.prototype.hasOwnProperty.call(DOMAIN_REGISTRY, mode)) {
    return DOMAIN_REGISTRY[mode];
  }
  return DINING_CONFIG;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Legacy re-export ─────────────────────────────────────────────────────────
// Kept so any existing import of DEFAULT_DOMAIN_CONFIG compiles without change.

export const DEFAULT_DOMAIN_CONFIG: DomainConfig = DINING_CONFIG;
