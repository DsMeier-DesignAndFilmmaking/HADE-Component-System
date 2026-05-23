import { describe, expect, it } from "vitest";
import { assertDecisionValid } from "../validateDecision";
import { enrichDecisionWithCommitment } from "@/lib/hade/commitment";
import type { HadeDecision } from "@/types/hade";

function validDecision(overrides: Partial<HadeDecision> = {}): HadeDecision {
  return {
    id: "venue-abc",
    venue_name: "Test Venue",
    category: "cafe",
    geo: { lat: 1, lng: 2 },
    distance_meters: 100,
    eta_minutes: 2,
    rationale: "Because.",
    why_now: "Now.",
    why_this: "Here.",
    decision_frame: "Go.",
    confidence: 0.7,
    confidence_label: "Good fit",
    situation_summary: "Summary.",
    source: "google_places",
    ...overrides,
  };
}

describe("assertDecisionValid", () => {
  it("passes without commitment metadata", () => {
    const decision = validDecision();
    expect(assertDecisionValid(decision, decision.id, "test-req")).toBe(true);
    expect(decision.commitment).toBeUndefined();
  });

  it("passes when commitment was attached after validation", () => {
    const base = validDecision({ category: "cafe" });
    expect(assertDecisionValid(base, base.id, "test-req")).toBe(true);

    const enriched = enrichDecisionWithCommitment(base, {
      situation: { intent: "eat" },
      constraints: { time_available_minutes: 25 },
    });

    expect(enriched.commitment).toBeDefined();
    expect(assertDecisionValid(enriched, enriched.id, "test-req")).toBe(true);
  });

  it("rejects decisions missing required card fields regardless of commitment", () => {
    const invalid = validDecision({ venue_name: "" });
    expect(assertDecisionValid(invalid, invalid.id, "test-req")).toBe(false);
  });
});
