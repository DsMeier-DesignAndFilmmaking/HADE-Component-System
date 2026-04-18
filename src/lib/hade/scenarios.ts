import type { DecideRequest, HadeSettings } from "@/types/hade";

export type ScenarioId = "exploration" | "quick" | "social";

interface ScenarioConfig {
  request: Partial<DecideRequest>;
  settings: Partial<HadeSettings>;
}

const SCENARIOS: Record<ScenarioId, ScenarioConfig> = {
  exploration: {
    request: {
      situation: { intent: null, urgency: "low" },
      state: { energy: "medium", openness: "adventurous" },
      social: { group_size: 1, group_type: "solo" },
    },
    settings: { mode: "explorative" },
  },
  quick: {
    request: {
      situation: { intent: "eat", urgency: "high" },
      state: { energy: "high", openness: "comfort" },
      social: { group_size: 1, group_type: "solo" },
      constraints: { distance_tolerance: "walking" },
    },
    settings: { mode: "precise" },
  },
  social: {
    request: {
      situation: { intent: "scene", urgency: "medium" },
      state: { energy: "high", openness: "adventurous" },
      social: { group_size: 4, group_type: "friends" },
    },
    settings: { mode: "balanced" },
  },
};

export function getScenario(id: string): ScenarioConfig | null {
  return SCENARIOS[id as ScenarioId] ?? null;
}
