import { describe, expect, it } from "vitest";
import { buildCommitmentAction } from "../commitment";
import type { TravelerState } from "@/types/hade";

function travelerState(primary: TravelerState["primary_state"]): TravelerState {
  return {
    primary_state: primary,
    secondary_states: [],
    confidence: 0.8,
    explanation: "test",
  };
}

describe("buildCommitmentAction", () => {
  it("returns food reset copy for cafe with a 30-minute window", () => {
    const result = buildCommitmentAction({
      category: "cafe",
      constraints: { time_available_minutes: 30 },
    });

    expect(result.action_title).toBe("Use this as a quick food reset");
    expect(result.action_steps).toEqual([
      "Head there now.",
      "Order something simple.",
      "Stay within your available time window.",
    ]);
    expect(result.time_box_minutes).toBe(30);
    expect(result.primary_cta_label).toBe("Start 30-minute plan");
  });

  it("returns outdoor walk copy for park category", () => {
    const result = buildCommitmentAction({
      category: "park",
      constraints: { time_available_minutes: 30 },
    });

    expect(result.action_title).toBe("Take a low-effort reset walk");
    expect(result.action_steps).toEqual([
      "Walk one simple loop.",
      "Keep it relaxed.",
      "Head back before your next stop.",
    ]);
    expect(result.time_box_minutes).toBe(30);
  });

  it("returns spontaneous move copy for open_to_surprise traveler state", () => {
    const result = buildCommitmentAction({
      traveler_state: travelerState("open_to_surprise"),
      category: "bookstore",
    });

    expect(result.action_title).toBe("Turn this into a small spontaneous move");
    expect(result.action_steps[0]).toBe("Go with this pick.");
  });

  it("is safe with empty input", () => {
    const result = buildCommitmentAction();

    expect(result.action_title).toBe("Turn this into a small spontaneous move");
    expect(result.action_steps.length).toBe(3);
    expect(result.time_box_minutes).toBeGreaterThanOrEqual(10);
    expect(result.primary_cta_label.length).toBeGreaterThan(0);
  });

  it("uses food template when intent is eat without category", () => {
    const result = buildCommitmentAction({
      situation: { intent: "eat" },
    });

    expect(result.action_title).toBe("Use this as a quick food reset");
    expect(result.time_box_minutes).toBe(25);
  });

  it("clamps time_box_minutes to at least 10 when budget is very small", () => {
    const result = buildCommitmentAction({
      category: "cafe",
      constraints: { time_available_minutes: 12 },
      eta_minutes: 5,
    });

    expect(result.time_box_minutes).toBe(10);
  });

  it("personalizes the first step when venue_name is provided", () => {
    const result = buildCommitmentAction({
      category: "cafe",
      venue_name: "Blue Bottle",
      constraints: { time_available_minutes: 25 },
    });

    expect(result.action_steps[0]).toBe("Head to Blue Bottle now.");
  });

  it("uses title as venue name fallback", () => {
    const result = buildCommitmentAction({
      category: "restaurant",
      title: "Corner Bistro",
    });

    expect(result.action_steps[0]).toBe("Head to Corner Bistro now.");
  });

  it("returns social copy for scene intent", () => {
    const result = buildCommitmentAction({
      situation: { intent: "scene" },
      category: "event_venue",
    });

    expect(result.action_title).toBe("Drop in for a low-key social moment");
  });

  it("prefers food template over surprise when category is restaurant", () => {
    const result = buildCommitmentAction({
      traveler_state: travelerState("open_to_surprise"),
      category: "restaurant",
      situation: { intent: "eat" },
    });

    expect(result.action_title).toBe("Use this as a quick food reset");
  });

  it("uses default template for unrelated category without surprise signals", () => {
    const result = buildCommitmentAction({
      category: "museum",
      situation: { intent: "chill" },
      traveler_state: travelerState("low_energy"),
    });

    expect(result.action_title).toBe("Make this your next move");
  });
});
