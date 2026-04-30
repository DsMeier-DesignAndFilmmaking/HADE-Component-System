import { mapIntentToPlacesCategory } from "@/core/utils/intentMapper";

// ─── DomainConfig ─────────────────────────────────────────────────────────────

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
    /** Returns the one-line "why right now" rationale for a given context. */
    buildWhyNow: (context: any) => string;
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

// ─── DINING domain (= existing default behavior) ──────────────────────────────

function diningCategoryResolver(context: any): string[] {
  const intent    = intentFromContext(context);
  const timeOfDay = timeOfDayFromContext(context);
  return mapIntentToPlacesCategory(intent ?? "", timeOfDay);
}

function diningBuildWhyNow(context: any): string {
  const intent = intentFromContext(context);
  switch (intent) {
    case "eat":   return "Time to eat — this one's close and open now.";
    case "drink": return "Time for a drink — this one's right nearby.";
    case "chill": return "Good moment to unwind — this spot fits.";
    case "scene": return "Looking for a scene — this one's live right now.";
    default:      return "Good moment for a break — this one's close and open.";
  }
}

const DINING_CONFIG: DomainConfig = {
  id: "dining",

  categoryResolver: diningCategoryResolver,

  // Time proximity is the dominant signal for dining — meals are time-sensitive.
  scoringWeights: {
    time:     0.60,
    social:   0.25,
    distance: 0.10,
    trust:    0.05,
  },

  copy: {
    buildWhyNow:    diningBuildWhyNow,
    fallbackTitles: [
      "Grab a bite nearby",
      "Find a coffee spot",
      "Explore local eats",
    ],
  },

  features: {
    usesTimeWindow:  true,
    usesSocialProof: true,
    usesGeo:         true,
  },
};

// ─── TRAVEL domain (broader exploration, distance-driven) ─────────────────────

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
  return "Worth the detour — this one's close and highly rated.";
}

const TRAVEL_CONFIG: DomainConfig = {
  id: "travel",

  // Travel spots are venue-type driven, not intent driven — ignore intent.
  categoryResolver: () => [...TRAVEL_PLACE_TYPES],

  // Distance and trust dominate; timing is less relevant for exploration.
  scoringWeights: {
    distance: 0.45,
    trust:    0.25,
    time:     0.20,
    social:   0.10,
  },

  copy: {
    buildWhyNow:    travelBuildWhyNow,
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

// ─── SOCIAL domain (event/nightlife, social-proof-driven) ─────────────────────

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
    case "scene": return "People are heading here — great scene right now.";
    case "drink": return "Lively crowd — good spot to join the night.";
    default:      return "Energy is high here — good moment to go.";
  }
}

const SOCIAL_CONFIG: DomainConfig = {
  id: "social",

  // Social venues — bars, clubs, event spaces. Intent refines within this set.
  categoryResolver: (context: any) => {
    const intent = intentFromContext(context);
    if (intent === "eat") return ["restaurant", "food_court", "bar"];
    return [...SOCIAL_PLACE_TYPES];
  },

  // Social proof is the dominant signal — going_count drives the decision.
  scoringWeights: {
    social:   0.45,
    time:     0.35,
    distance: 0.10,
    trust:    0.10,
  },

  copy: {
    buildWhyNow:    socialBuildWhyNow,
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

// ─── Default: dining behavior (travel/social legacy) ─────────────────────────

export const DEFAULT_DOMAIN_CONFIG: DomainConfig = {
  id: "default",

  categoryResolver: diningCategoryResolver,

  scoringWeights: {
    time:     0.60,
    social:   0.25,
    distance: 0.10,
    trust:    0.05,
  },

  copy: {
    buildWhyNow:    diningBuildWhyNow,
    fallbackTitles: [
      "Take a walk nearby",
      "Grab coffee nearby",
      "Explore this area",
    ],
  },

  features: {
    usesTimeWindow:  true,
    usesSocialProof: true,
    usesGeo:         true,
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const DOMAIN_REGISTRY: Record<string, DomainConfig> = {
  dining:  DINING_CONFIG,
  travel:  TRAVEL_CONFIG,
  social:  SOCIAL_CONFIG,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the DomainConfig for a given mode identifier.
 *
 * Supported domain modes: "dining" | "travel" | "social"
 * Any other value (including the persona modes "balanced"|"precise"|"explorative")
 * returns DEFAULT_DOMAIN_CONFIG so existing behavior is unchanged.
 */
export function getDomainConfig(mode?: string): DomainConfig {
  if (mode && Object.prototype.hasOwnProperty.call(DOMAIN_REGISTRY, mode)) {
    return DOMAIN_REGISTRY[mode];
  }
  return DEFAULT_DOMAIN_CONFIG;
}
