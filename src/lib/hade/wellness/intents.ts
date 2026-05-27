/**
 * Wellness intents — the user-facing control surface.
 *
 * Each intent maps to a primary wellness pillar (with an optional secondary)
 * and carries copy + an emoji for chip rendering. This is the single source
 * of truth for the WellnessIntentSelector UI and the resolveWellnessIntent
 * logic.
 */

import type { WellnessIntent, WellnessPillar } from "./types";

export interface WellnessIntentMeta {
  id: WellnessIntent;
  /** Chip-visible label. */
  label: string;
  /** Short subtext (a11y title + active-chip subtitle). */
  description: string;
  primaryPillar: WellnessPillar;
  /** Secondary pillar used when the primary yields no matches. */
  secondaryPillar?: WellnessPillar;
  /** Human-readable reason label surfaced in wellness cards. */
  ruleLabel: string;
  /** 1-sentence "Matched to your X intent" explainer. */
  rationale: string;
  emoji: string;
}

export const WELLNESS_INTENTS: readonly WellnessIntentMeta[] = [
  {
    id: "clear_head",
    label: "Clear my head",
    description: "A walk, a quiet pause, or a little mental space.",
    primaryPillar: "Mindfulness",
    secondaryPillar: "Somatic Movement",
    ruleLabel: "Clear head",
    rationale: "A light reset that gets you out of the loop.",
    emoji: "🧘",
  },
  {
    id: "decompress",
    label: "Decompress",
    description: "Somewhere quieter when your nervous system needs room.",
    primaryPillar: "Mindfulness",
    ruleLabel: "Decompress",
    rationale: "A quieter place to come down a notch.",
    emoji: "🌬",
  },
  {
    id: "gentle_movement",
    label: "Gentle movement",
    description: "Stretching, yoga, or a softer way to move.",
    primaryPillar: "Somatic Movement",
    ruleLabel: "Gentle movement",
    rationale: "Movement without turning it into a workout.",
    emoji: "🧎",
  },
  {
    id: "healthy_nearby",
    label: "Healthy nearby",
    description: "Tea, juice, or food that feels restorative.",
    primaryPillar: "Nourishment",
    ruleLabel: "Nourishment",
    rationale: "A simple stop that gives you something back.",
    emoji: "🍵",
  },
  {
    id: "restore_energy",
    label: "Restore energy",
    description: "Recovery, warmth, or a slower reset.",
    primaryPillar: "Longevity",
    secondaryPillar: "Nourishment",
    ruleLabel: "Restore energy",
    rationale: "A recovery-leaning reset for when you need to refill.",
    emoji: "🛁",
  },
  {
    id: "low_effort_reset",
    label: "Low-effort reset",
    description: "Close, easy, and not a big production.",
    primaryPillar: "Mindfulness",
    secondaryPillar: "Nourishment",
    ruleLabel: "Low-effort reset",
    rationale: "The easiest reset that still feels worthwhile.",
    emoji: "✨",
  },
] as const;

export const DEFAULT_INTENT: WellnessIntent = "low_effort_reset";

export function getIntentMeta(intent: WellnessIntent): WellnessIntentMeta {
  const meta = WELLNESS_INTENTS.find((m) => m.id === intent);
  if (!meta) {
    // Defensive — the type system makes this unreachable, but a runtime
    // guard avoids a non-null assertion at call sites.
    throw new Error(`Unknown WellnessIntent: ${intent}`);
  }
  return meta;
}
