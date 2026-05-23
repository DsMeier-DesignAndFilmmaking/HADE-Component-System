import { describe, expect, it, vi } from "vitest";
import {
  buildCommitmentInputFromRequest,
  enrichDecisionWithCommitment,
} from "../commitment";
import type { HadeDecision } from "@/types/hade";

function baseDecision(overrides: Partial<HadeDecision> = {}): HadeDecision {
  return {
    id: "place-1",
    venue_name: "Corner Cafe",
    category: "cafe",
    geo: { lat: 37.77, lng: -122.42 },
    distance_meters: 200,
    eta_minutes: 3,
    rationale: "Good fit.",
    why_now: "Open now.",
    why_this: "Close by.",
    decision_frame: "Quick stop.",
    confidence: 0.8,
    confidence_label: "Strong pick",
    situation_summary: "Test.",
    source: "google_places",
    ...overrides,
  };
}

describe("enrichDecisionWithCommitment", () => {
  it("attaches commitment for a valid places-backed decision", () => {
    const enriched = enrichDecisionWithCommitment(
      baseDecision(),
      {
        situation: { intent: "eat" },
        constraints: { time_available_minutes: 30 },
        mode: "dining",
      },
    );

    expect(enriched.commitment).toBeDefined();
    expect(enriched.commitment?.action_title).toBe("Use this as a quick food reset");
    expect(enriched.commitment?.action_steps.length).toBeGreaterThan(0);
    expect(enriched.commitment?.time_box_minutes).toBe(24);
    expect(enriched.id).toBe("place-1");
    expect(enriched.rationale).toBe("Good fit.");
  });

  it("does not crash when category and constraints are missing", () => {
    const decision = baseDecision({
      category: "",
      venue_name: "Pop-up",
    });

    const enriched = enrichDecisionWithCommitment(decision, {});

    expect(enriched.id).toBe("place-1");
    expect(enriched.commitment).toBeDefined();
    expect(enriched.commitment?.time_box_minutes).toBeGreaterThan(0);
  });

  it("does not throw when buildCommitmentAction fails", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = baseDecision();
    Object.defineProperty(broken, "eta_minutes", {
      get() {
        throw new Error("broken eta");
      },
    });

    const enriched = enrichDecisionWithCommitment(broken, {
      situation: { intent: "eat" },
    });

    expect(enriched.commitment).toBeUndefined();
    expect(enriched.id).toBe("place-1");
    spy.mockRestore();
  });

  it("maps request body into commitment builder input", () => {
    const input = buildCommitmentInputFromRequest(baseDecision(), {
      situation: { intent: "scene" },
      constraints: { time_available_minutes: 45 },
      mode: "social",
      candidate_categories: ["bar"],
    });

    expect(input.traveler_state?.primary_state).toBeDefined();
    expect(input.lens).toBe("social_interaction");
    expect(input.venue_name).toBe("Corner Cafe");
    expect(input.constraints?.time_available_minutes).toBe(45);
  });

  it("uses title when venue_name is absent (fallback-shaped decision)", () => {
    const input = buildCommitmentInputFromRequest(
      baseDecision({ venue_name: undefined as unknown as string, title: "Grab coffee nearby" }),
      { situation: { intent: null } },
    );

    expect(input.venue_name).toBe("Grab coffee nearby");
  });
});
