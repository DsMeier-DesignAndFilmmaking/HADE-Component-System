import { describe, expect, it } from "vitest";
import { inferTravelerState } from "../travelerState";
import type { Signal } from "@/types/hade";

function signal(content: string): Signal {
  return {
    id: crypto.randomUUID(),
    type: "INTENT",
    venue_id: null,
    content,
    strength: 1,
    emitted_at: new Date(0).toISOString(),
    expires_at: new Date(60_000).toISOString(),
    geo: { lat: 0, lng: 0 },
  };
}

describe("inferTravelerState", () => {
  it("infers waiting and time_constrained when time_available_minutes is 20 or less", () => {
    const result = inferTravelerState({
      constraints: { time_available_minutes: 20 },
      situation: { intent: "anything", urgency: "high" },
    });

    expect(result.primary_state).toBe("waiting");
    expect(result.secondary_states).toContain("time_constrained");
  });

  it("infers micro_adventure_ready when time_available_minutes is 45 or less", () => {
    const result = inferTravelerState({
      constraints: { time_available_minutes: 45 },
      situation: { intent: "anything", urgency: "medium" },
    });

    expect(result.primary_state).toBe("micro_adventure_ready");
  });

  it("infers decision_fatigue when rejection_history has two or more entries", () => {
    const result = inferTravelerState({
      situation: { intent: "eat", urgency: "low" },
      rejection_history: [
        { venue_id: "a", venue_name: "A", pivot_reason: "Not This" },
        { venue_id: "b", venue_name: "B", pivot_reason: "Wrong vibe" },
      ],
    });

    expect(result.primary_state).toBe("decision_fatigue");
  });

  it("infers open_to_surprise when there is no intent and no signals", () => {
    const result = inferTravelerState({
      situation: { intent: null, urgency: "low" },
      signals: [],
    });

    expect(result.primary_state).toBe("open_to_surprise");
  });

  it("infers recovering from wellness mode", () => {
    const result = inferTravelerState({
      mode: "wellness",
      situation: { intent: "chill", urgency: "low" },
    });

    expect(result.primary_state).toBe("recovering");
  });

  it("infers socializing from social mode", () => {
    const result = inferTravelerState({
      mode: "social",
      situation: { intent: "scene", urgency: "medium" },
    });

    expect(result.primary_state).toBe("socializing");
  });

  it("infers low_energy from explicit state or signal wording", () => {
    const explicit = inferTravelerState({
      state: { energy: "low" },
      situation: { intent: "anything", urgency: "low" },
    });
    const fromSignal = inferTravelerState({
      situation: { intent: "anything", urgency: "low" },
      signals: [signal("I'm exhausted and need something quiet")],
    });

    expect(explicit.primary_state).toBe("low_energy");
    expect(fromSignal.primary_state).toBe("low_energy");
  });

  it("infers high_energy or adventurous from adventure wording and signals", () => {
    const explicit = inferTravelerState({
      state: { energy: "high", openness: "adventurous" },
      situation: { intent: "anything", urgency: "low" },
    });
    const fromSignal = inferTravelerState({
      situation: { intent: "anything", urgency: "low" },
      signals: [signal("I want to explore and discover something new")],
    });

    expect(explicit.primary_state).toBe("high_energy");
    expect(["high_energy", "adventurous"]).toContain(fromSignal.primary_state);
  });

  it("is safe with missing fields", () => {
    const result = inferTravelerState();

    expect(result.primary_state).toBe("open_to_surprise");
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it("applies explicit priority when multiple states are inferred", () => {
    const result = inferTravelerState({
      mode: "wellness",
      constraints: { time_available_minutes: 15 },
      state: { energy: "low" },
      signals: [signal("social scene with friends")],
      rejection_history: [
        { venue_id: "a", venue_name: "A", pivot_reason: "Not This" },
        { venue_id: "b", venue_name: "B", pivot_reason: "Wrong vibe" },
      ],
    });

    expect(result.primary_state).toBe("decision_fatigue");
    expect(result.secondary_states.slice(0, 4)).toEqual([
      "recovering",
      "socializing",
      "waiting",
      "time_constrained",
    ]);
  });
});
