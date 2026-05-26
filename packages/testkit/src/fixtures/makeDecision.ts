import type { HadeDecisionLike } from "@hade/core";

/**
 * Builds a {@link HadeDecisionLike} (the input shape `fromHadeDecision` and
 * `fromDecideResponse` accept) with sensible defaults. Useful when testing
 * downstream consumers that work off a built `DecisionEngineOutput`.
 */
let counter = 0;

export function makeDecision(overrides: Partial<HadeDecisionLike> = {}): HadeDecisionLike {
  const id = `decision-${++counter}`;
  return {
    id,
    venue_name: `Test Venue ${counter}`,
    category: "restaurant",
    geo: { lat: 40.7128, lng: -74.006 },
    distance_meters: 250,
    eta_minutes: 5,
    rationale: "A solid pick that matches your situation.",
    why_now: "Right time of day for this kind of place.",
    why_this: "Strong fit with your stated intent.",
    decision_frame: "We weighed proximity vs. signal strength.",
    confidence_label: "Good fit",
    confidence: 0.72,
    situation_summary: "Looking for a place to eat nearby.",
    is_fallback: false,
    ...overrides,
  };
}

/** Resets the auto-incrementing ID counter. Call in test setup for determinism. */
export function resetDecisionCounter(): void {
  counter = 0;
}
