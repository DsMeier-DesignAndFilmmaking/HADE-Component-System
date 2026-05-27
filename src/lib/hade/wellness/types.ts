/**
 * Wellness module — core type primitives.
 *
 * These types are spec-locked. The `AmbientSignals` shape (5-bucket timeOfDay,
 * weekday/weekend, etc.) is intentionally narrower than HADE's broader
 * adaptive context system so the wellness engine can remain fully
 * self-contained and demo-driven.
 */

export type Weather =
  | "sunny"
  | "rainy"
  | "cold"
  | "overcast"
  | "heatwave"
  /** Used when no weather sensor / API is available (default in this demo). */
  | "unknown";

export type TimeOfDay =
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night";

export type DayOfWeek = "weekday" | "weekend";

export type UserStressSignal =
  | "high"
  | "baseline"
  | "fatigued"
  /** Used when no biometric proxy is available (default in this demo). */
  | "unknown";

export interface AmbientSignals {
  weather: Weather;
  timeOfDay: TimeOfDay;
  dayOfWeek: DayOfWeek;
  /** Computed from a biometric proxy (mock for demo). */
  userStressSignal: UserStressSignal;
}

export type WellnessPillar =
  | "Mindfulness"
  | "Longevity"
  | "Somatic Movement"
  | "Nourishment";

export interface WellnessPlace {
  id: string;
  name: string;
  /** Pre-formatted display string, e.g. "0.4 mi". */
  distance: string;
  /** 0–5 scale, allows half stars. */
  rating: number;
  pillar: WellnessPillar;
  /** Experiential "Why" copy, signal-aware. */
  contextualWhy: string;
  /** Short signal-aware validation tag (e.g. "Cortisol Decompression"). */
  validationTag: string;
  /** Mock Google Places `types[0]` value (spa | park | gym | health | food | cafe | store …). */
  googlePlaceType: string;
  coordinates: { lat: number; lng: number };
  /** Optional sub-keyword tags layered on top of name for the keyword validator. */
  tags?: string[];
}

/**
 * Output of the deterministic matrix resolver. `matchedRule` (1–9)
 * tracks WHICH precedence rule fired so the UI can surface why this
 * pillar won (great for the experiential "why" copy and reviewer transparency).
 */
export interface ResolvedQuery {
  pillar: WellnessPillar;
  /**
   * Rule number — semantics depend on `source`:
   *   - source === "intent":   1–6 (one per WellnessIntent)
   *   - source === "ambient":  1–9 (per resolveWellnessQuery precedence ladder)
   *   - source === "default":  0
   */
  matchedRule: number;
  matchedRuleLabel: string;
  /** Tracks which pipeline produced this resolution for UI provenance. */
  source: "intent" | "ambient" | "default";
  googlePlaceTypes: readonly string[];
  keywords: readonly string[];
}

/**
 * User-facing wellness intent (the visible control surface).
 *
 * Intent always beats ambient context — ambient signals are invisible
 * infrastructure supporting the recommendation, not a parallel input channel.
 */
export type WellnessIntent =
  | "clear_head"
  | "decompress"
  | "gentle_movement"
  | "healthy_nearby"
  | "restore_energy"
  | "low_effort_reset";

export interface PillBadge {
  emoji: string;
  label: string;
  /** Tailwind class string applied to the badge container. */
  className: string;
}
