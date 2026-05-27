/**
 * Per-pillar configuration: Google Places types, query keywords, the
 * sub-keyword whitelist used by the negative filter, and presentation tokens.
 *
 * The sub-keyword whitelist is the "cleanliness rule": a generic place
 * (e.g. a standard municipal park) whose name and tags lack any whitelist
 * token gets filtered out — preventing data pollution of wellness results.
 */

import type { WellnessPillar } from "./types";

export const PILLARS = [
  "Mindfulness",
  "Longevity",
  "Somatic Movement",
  "Nourishment",
] as const satisfies readonly WellnessPillar[];

export interface PillarConfig {
  /** Mock Google Places type filters per spec. */
  googlePlaceTypes: readonly string[];
  /** Search keywords supplied to a Places Text Search-style query. */
  keywords: readonly string[];
  /**
   * Negative-filter whitelist. A WellnessPlace passes validation for this
   * pillar iff `name.toLowerCase()` OR any tag contains ≥1 of these tokens.
   * Tokens are lowercased.
   */
  subKeywordWhitelist: readonly string[];
  /** Single emoji shown on the pillar filter chip. */
  chipEmoji: string;
  /** Short label for header use. */
  headerLabel: string;
}

export const PILLAR_CONFIG: Record<WellnessPillar, PillarConfig> = {
  Mindfulness: {
    googlePlaceTypes: ["spa", "park"],
    keywords: [
      "Zen garden",
      "sound healing sanctuary",
      "meditation center",
      "herbal tea house",
    ],
    subKeywordWhitelist: [
      "trail",
      "garden",
      "labyrinth",
      "meditation",
      "zen",
      "sanctuary",
      "tea house",
      "mindfulness",
      "sound healing",
    ],
    chipEmoji: "🧘",
    headerLabel: "Mindfulness Reset",
  },
  Longevity: {
    googlePlaceTypes: ["spa", "health"],
    keywords: [
      "bathhouse",
      "sauna",
      "cold plunge",
      "cryotherapy",
      "float tank",
    ],
    subKeywordWhitelist: [
      "bathhouse",
      "sauna",
      "plunge",
      "cryo",
      "float",
      "onsen",
      "recovery",
      "thermal",
    ],
    chipEmoji: "🛁",
    headerLabel: "Recovery & Longevity",
  },
  "Somatic Movement": {
    googlePlaceTypes: ["gym", "park"],
    keywords: [
      "Pilates studio",
      "holistic movement",
      "mindfulness trail",
      "yoga shala",
    ],
    subKeywordWhitelist: [
      "shala",
      "studio",
      "pilates",
      "yoga",
      "movement",
      "climbing",
      "trail",
      "holistic",
    ],
    chipEmoji: "🧎",
    headerLabel: "Somatic Movement",
  },
  Nourishment: {
    googlePlaceTypes: ["food", "cafe", "store"],
    keywords: [
      "adaptogenic juice bar",
      "functional mushroom cafe",
      "apothecary",
      "organic market",
    ],
    subKeywordWhitelist: [
      "adaptogenic",
      "adaptogen",
      "apothecary",
      "juice",
      "mushroom",
      "market",
      "herbal",
      "tonic",
      "functional",
    ],
    chipEmoji: "🍵",
    headerLabel: "Holistic Nourishment",
  },
};
