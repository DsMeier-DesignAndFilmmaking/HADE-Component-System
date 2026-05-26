import type { DomainMode } from "./useHade";

export type LensProfileId =
  | "food_dining"
  | "retail_shopping"
  | "urban_mobility"
  | "entertainment"
  | "social_interaction"
  | "wellness";

export interface LensProfile {
  id: LensProfileId;
  label: string;
  mode: DomainMode;
  emoji: string;
  headline: string;
  subtext: string;
  decisionSupportText?: string;
  /** Compatibility alias for older call sites that read lens.context. */
  context: string;
  candidateCategories: readonly string[];
  preferredPlaceTypes: readonly string[];
  uiCopy: {
    triggerLabel: string;
    activeLabel: string;
    transitionCopy: string;
  };
  fallbackHints: readonly string[];
}

const DEFAULT_LENS_ID: LensProfileId = "urban_mobility";

export const LENS_PROFILES: Record<LensProfileId, LensProfile> = {
  food_dining: {
    id: "food_dining",
    label: "Food & Dining",
    mode: "dining",
    emoji: "🍽",
    headline: "Reduce decision fatigue nearby.",
    subtext: "Low-friction nearby food decision.",
    context: "Reduce decision fatigue nearby.",
    candidateCategories: ["restaurant", "cafe", "bakery", "meal_takeaway", "food"],
    preferredPlaceTypes: ["restaurant", "cafe", "bakery", "meal_takeaway", "bar"],
    uiCopy: {
      triggerLabel: "Other directions",
      activeLabel: "Food nearby",
      transitionCopy: "Optimizing for simplicity nearby",
    },
    fallbackHints: [
      "Find a casual nearby cafe for a low-effort bite",
      "Try a bakery or coffee counter within walking distance",
      "Choose a quick local lunch spot",
    ],
  },
  retail_shopping: {
    id: "retail_shopping",
    label: "Retail & Shopping",
    mode: "dining",
    emoji: "🛍",
    headline: "Find a browse worth stepping into.",
    subtext: "A nearby retail detour with less endless searching.",
    context: "Find a browse worth stepping into.",
    candidateCategories: ["bookstore", "clothing_store", "store", "shopping_mall", "market"],
    preferredPlaceTypes: ["book_store", "clothing_store", "store", "shopping_mall", "market"],
    uiCopy: {
      triggerLabel: "Other directions",
      activeLabel: "Retail discovery",
      transitionCopy: "Looking for something worth discovering",
    },
    fallbackHints: [
      "Browse a nearby bookstore or small shop",
      "Step into a local market for a quick discovery loop",
      "Check out a vintage or specialty shop nearby",
    ],
  },
  urban_mobility: {
    id: "urban_mobility",
    label: "Urban Mobility",
    mode: "travel",
    emoji: "🚇",
    headline: "Make the next move easier.",
    subtext: "A practical nearby decision based on where you are now.",
    decisionSupportText: "Best nearby move based on distance, timing, and current context.",
    context: "Make the next move easier.",
    candidateCategories: ["transit_station", "park", "point_of_interest", "tourist_attraction", "route"],
    preferredPlaceTypes: ["transit_station", "park", "tourist_attraction", "point_of_interest"],
    uiCopy: {
      triggerLabel: "Other directions",
      activeLabel: "Urban mobility",
      transitionCopy: "Reading movement and density nearby",
    },
    fallbackHints: [
      "Take the simplest useful walkable move nearby",
      "Head toward a transit-friendly nearby stop",
      "Choose a short scenic route that keeps momentum",
    ],
  },
  entertainment: {
    id: "entertainment",
    label: "Entertainment",
    mode: "social",
    emoji: "🎭",
    headline: "Find something worth doing tonight.",
    subtext: "A nearby plan with low planning friction.",
    context: "Find something worth doing tonight.",
    candidateCategories: ["movie_theater", "art_gallery", "museum", "bar", "night_club", "event"],
    preferredPlaceTypes: ["movie_theater", "art_gallery", "museum", "bar", "night_club", "event_venue"],
    uiCopy: {
      triggerLabel: "Other directions",
      activeLabel: "Entertainment",
      transitionCopy: "Looking for something happening now",
    },
    fallbackHints: [
      "Look for a small venue, gallery, or live event nearby",
      "Try a low-commitment open mic, theater, or music spot",
      "Find a nearby evening activity with minimal planning",
    ],
  },
  social_interaction: {
    id: "social_interaction",
    label: "Social Interaction",
    mode: "social",
    emoji: "👥",
    headline: "Make social energy easier.",
    subtext: "A low-pressure place where interaction is possible.",
    context: "Make social energy easier.",
    candidateCategories: ["cafe", "bar", "community_center", "event", "restaurant"],
    preferredPlaceTypes: ["cafe", "bar", "community_center", "event_venue", "restaurant"],
    uiCopy: {
      triggerLabel: "Other directions",
      activeLabel: "Social energy",
      transitionCopy: "Finding socially compatible energy",
    },
    fallbackHints: [
      "Pick a low-pressure cafe or bar with casual seating",
      "Look for a community-friendly place nearby",
      "Choose a social environment where interaction is optional",
    ],
  },
  wellness: {
    id: "wellness",
    label: "Wellness",
    mode: "travel",
    emoji: "🌿",
    headline: "Reset without overthinking it.",
    subtext: "A nearby wellness move matched to your energy, time, and season.",
    decisionSupportText: "Chosen for a low-friction reset based on time, location, and current conditions.",
    context: "Reset without overthinking it.",
    candidateCategories: ["gym", "spa", "park", "health", "yoga", "wellness"],
    preferredPlaceTypes: ["gym", "spa", "park", "fitness_center", "yoga_studio"],
    uiCopy: {
      triggerLabel: "Other directions",
      activeLabel: "Wellness reset",
      transitionCopy: "Optimizing for a healthier next move",
    },
    fallbackHints: [
      "Reset with a nearby park walk",
      "Find a yoga, gym, spa, or sauna-style reset",
      "Choose a health cafe or quiet recovery spot",
    ],
  },
} as const;

const LENS_ID_ALIASES: Record<string, LensProfileId> = {
  food: "food_dining",
  food_dining: "food_dining",
  dining: "food_dining",
  retail: "retail_shopping",
  retail_shopping: "retail_shopping",
  shopping: "retail_shopping",
  mobility: "urban_mobility",
  urban_mobility: "urban_mobility",
  travel: "urban_mobility",
  entertainment: "entertainment",
  social: "social_interaction",
  social_interaction: "social_interaction",
  wellness: "wellness",
};

export function normalizeLensId(input: unknown): LensProfileId {
  if (typeof input !== "string") return DEFAULT_LENS_ID;
  const normalized = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return LENS_ID_ALIASES[normalized] ?? DEFAULT_LENS_ID;
}

export function getLensProfile(lensId: unknown): LensProfile {
  return LENS_PROFILES[normalizeLensId(lensId)];
}

export function getLensCandidateCategories(lensId: unknown): readonly string[] {
  return getLensProfile(lensId).candidateCategories;
}
