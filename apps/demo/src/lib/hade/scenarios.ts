import type { DecideRequest, GeoLocation, HadeSettings } from "@/types/hade";

export type ScenarioId = "exploration" | "quick" | "social";

interface ScenarioConfig {
  request: Partial<DecideRequest>;
  settings: Partial<HadeSettings>;
  /** Demo geo injected when the real device location is unavailable (preview / CI). */
  geo?: GeoLocation;
}

// Capitol Hill, Seattle — dense mixed-use block suitable for all three scenarios.
const DEMO_GEO: GeoLocation = { lat: 47.6131, lng: -122.3200 };

const SCENARIOS: Record<ScenarioId, ScenarioConfig> = {
  exploration: {
    request: {
      situation: { intent: null, urgency: "low" },
      state: { energy: "medium", openness: "adventurous" },
      social: { group_size: 1, group_type: "solo" },
    },
    settings: { mode: "explorative" },
    geo: DEMO_GEO,
  },
  quick: {
    request: {
      situation: { intent: "eat", urgency: "high" },
      state: { energy: "high", openness: "comfort" },
      social: { group_size: 1, group_type: "solo" },
      constraints: { distance_tolerance: "walking" },
    },
    settings: { mode: "precise" },
    geo: DEMO_GEO,
  },
  social: {
    request: {
      situation: { intent: "scene", urgency: "medium" },
      state: { energy: "high", openness: "adventurous" },
      social: { group_size: 4, group_type: "friends" },
    },
    settings: { mode: "balanced" },
    geo: DEMO_GEO,
  },
};

export function getScenario(id: string): ScenarioConfig | null {
  return SCENARIOS[id as ScenarioId] ?? null;
}
