import type { HadeSettings } from "@/types/hade";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HadePreset {
  id: string;
  label: string;
  emoji: string;
  description: string;
  settings: Partial<HadeSettings>;
}

// ─── Preset Definitions ───────────────────────────────────────────────────────

export const HADE_PRESETS: HadePreset[] = [
  {
    id: "balanced",
    label: "Balanced",
    emoji: "⚖️",
    description: "Even weighting — good default",
    settings: {
      exploration_temp: 0.35,
      confidence_threshold: 0.0,
      intent_weight: 0.5,
      mode: "balanced",
      strict_constraints: false,
    },
  },
  {
    id: "spontaneous",
    label: "Spontaneous",
    emoji: "⚡",
    description: "High exploration, low filter — surprises you",
    settings: {
      exploration_temp: 0.7,
      confidence_threshold: 0.0,
      intent_weight: 0.4,
      mode: "explorative",
      strict_constraints: false,
    },
  },
  {
    id: "chill",
    label: "Chill",
    emoji: "🧊",
    description: "Low exploration, high confidence — careful picks",
    settings: {
      exploration_temp: 0.1,
      confidence_threshold: 0.7,
      intent_weight: 0.3,
      mode: "precise",
      strict_constraints: false,
    },
  },
  {
    id: "social",
    label: "Social",
    emoji: "👥",
    description: "Intent-heavy, group-aware",
    settings: {
      exploration_temp: 0.3,
      confidence_threshold: 0.2,
      intent_weight: 0.6,
      mode: "balanced",
      strict_constraints: false,
    },
  },
  {
    id: "focused",
    label: "Focused",
    emoji: "🎯",
    description: "Strict, intent-driven, no surprises",
    settings: {
      exploration_temp: 0.0,
      confidence_threshold: 0.8,
      intent_weight: 0.75,
      mode: "precise",
      strict_constraints: true,
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the matching preset ID, or "custom" if current settings don't match
 * any preset. Only compares the fields defined within each preset's settings
 * object — unrelated fields (e.g. model_target, persona_id, debug) are ignored.
 */
export function matchPreset(settings: HadeSettings): string {
  for (const preset of HADE_PRESETS) {
    const match = (
      Object.entries(preset.settings) as [keyof HadeSettings, unknown][]
    ).every(([key, val]) => settings[key] === val);
    if (match) return preset.id;
  }
  return "custom";
}
