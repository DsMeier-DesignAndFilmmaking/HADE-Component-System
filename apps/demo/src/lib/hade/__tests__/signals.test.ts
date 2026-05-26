import { describe, it, expect } from "vitest";
import { aggregateSignals } from "../signals";
import type { Signal } from "@/types/hade";

function makeVibeSignal(
  id: string,
  tags: string[],
  strength: number,
  emittedAt = "2026-04-22T00:00:00.000Z",
): Signal {
  return {
    id,
    type: "AMBIENT",
    venue_id: "venue-123",
    content: "vibe",
    strength,
    emitted_at: emittedAt,
    expires_at: "2026-04-23T00:00:00.000Z",
    geo: { lat: 37.7749, lng: -122.4194 },
    source: "user",
    category: "vibe",
    shareable: false,
    validation_status: "approved",
    location_node_id: "venue-123",
    vibe_tags: tags,
    sentiment: "neutral",
  } as Signal;
}

describe("aggregateSignals vibe bucketing", () => {
  it("keeps different tags in separate buckets", () => {
    const signals = [
      makeVibeSignal("a", ["chill"], 0.7),
      makeVibeSignal("b", ["lively"], 0.8),
    ];

    const aggregated = aggregateSignals(signals);

    expect(aggregated).toHaveLength(2);
  });

  it("merges same tags regardless of order", () => {
    const signals = [
      makeVibeSignal("a", ["chill", "social"], 0.7),
      makeVibeSignal("b", ["social", "chill"], 0.9),
    ];

    const aggregated = aggregateSignals(signals);

    expect(aggregated).toHaveLength(1);
  });

  it("merges exact tag matches and averages strength", () => {
    const signals = [
      makeVibeSignal("a", ["chill", "social"], 0.4),
      makeVibeSignal("b", ["chill", "social"], 0.8),
    ];

    const aggregated = aggregateSignals(signals);

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]?.strength).toBeCloseTo(0.6, 5);
  });
});
