import { describe, expect, it } from "vitest";
import { adaptWellnessDecisionToCardModel } from "@/lib/hade/wellness/adaptWellnessDecision";
import type { UseWellnessEngineResult } from "@/lib/hade/wellness/useWellnessEngine";
import type {
  AmbientSignals,
  PillBadge,
  ResolvedQuery,
  WellnessIntent,
  WellnessPillar,
  WellnessPlace,
} from "@/lib/hade/wellness/types";

const signals: AmbientSignals = {
  weather: "unknown",
  timeOfDay: "midday",
  dayOfWeek: "weekday",
  userStressSignal: "unknown",
};

function makeResolved(pillar: WellnessPillar): ResolvedQuery {
  return {
    pillar,
    matchedRule: 1,
    matchedRuleLabel: "Intent — decompression",
    source: "intent",
    googlePlaceTypes: ["spa"],
    keywords: ["meditation"],
  };
}

function makePlace(
  overrides: Partial<WellnessPlace> & Pick<WellnessPlace, "id" | "name">,
): WellnessPlace {
  return {
    distance: "0.5 mi",
    rating: 4.5,
    pillar: "Mindfulness",
    contextualWhy: "Quiet block, good for a reset.",
    validationTag: "Meditation Center",
    googlePlaceType: "spa",
    coordinates: { lat: 0, lng: 0 },
    ...overrides,
  };
}

function makeEngineResult(
  overrides: Partial<UseWellnessEngineResult>,
): UseWellnessEngineResult {
  const resolved = overrides.resolved ?? makeResolved("Mindfulness");
  return {
    selectedIntent: "decompress" satisfies WellnessIntent,
    resolved,
    contextHint: { ...resolved, source: "ambient" },
    ambientSignals: signals,
    activePillar: resolved.pillar,
    places: [],
    rejectedCount: 0,
    rejectedNames: [],
    loading: false,
    badges: [] as PillBadge[],
    ...overrides,
  };
}

describe("adaptWellnessDecisionToCardModel", () => {
  it("maps the top wellness place (highest rating) to the card title", () => {
    const result = makeEngineResult({
      places: [
        makePlace({ id: "a", name: "Quiet Cafe", rating: 4.2, distance: "0.5 mi" }),
        makePlace({ id: "b", name: "Sora Sound Healing", rating: 4.9, distance: "1.1 mi" }),
        makePlace({ id: "c", name: "Kotonoha Tea", rating: 4.6, distance: "0.3 mi" }),
      ],
    });
    const model = adaptWellnessDecisionToCardModel(result);
    expect(model.title).toBe("Sora Sound Healing");
    expect(model.distance).toBe("1.1 mi");
    expect(model.keptCount).toBe(3);
  });

  it("breaks ties on rating by shortest distance", () => {
    const result = makeEngineResult({
      places: [
        makePlace({ id: "a", name: "Far Plunge", rating: 4.8, distance: "1.4 mi" }),
        makePlace({ id: "b", name: "Close Plunge", rating: 4.8, distance: "0.2 mi" }),
      ],
    });
    const model = adaptWellnessDecisionToCardModel(result);
    expect(model.title).toBe("Close Plunge");
  });

  it("includes intent + context + filtering reasons in whyThis", () => {
    const result = makeEngineResult({
      places: [makePlace({ id: "a", name: "Kotonoha Tea", rating: 4.6 })],
      rejectedCount: 2,
      rejectedNames: ["Governors Park", "Westside Generic Gym"],
    });
    const model = adaptWellnessDecisionToCardModel(result);
    // Intent reason
    expect(model.whyThis.some((s) => s.toLowerCase().includes("decompress"))).toBe(true);
    // Context reason (intent matches context hint by default)
    expect(model.whyThis.some((s) => s.includes("weekday midday"))).toBe(true);
    // Filtering reason ("Left out N vague options so the pick stays specific.")
    expect(model.whyThis.some((s) => s.toLowerCase().includes("left out"))).toBe(true);
    // Per-place rationale
    expect(model.whyThis.some((s) => s.includes("Quiet block"))).toBe(true);
  });

  it("communicates the 'intent overrides context' case in whyThis", () => {
    const result = makeEngineResult({
      resolved: makeResolved("Mindfulness"),
      contextHint: {
        ...makeResolved("Nourishment"),
        source: "ambient",
      },
      places: [makePlace({ id: "a", name: "Sora Sanctuary", rating: 4.8 })],
    });
    const model = adaptWellnessDecisionToCardModel(result);
    // "The moment also leans nourishment, but your choice keeps this mindfulness."
    expect(
      model.whyThis.some((s) =>
        s.toLowerCase().includes("leans nourishment"),
      ),
    ).toBe(true);
    // Should NOT include the "good fit" line when intent and context disagree
    expect(model.whyThis.some((s) => s.toLowerCase().includes("good fit"))).toBe(false);
  });

  it("handles empty kept places without crashing", () => {
    const result = makeEngineResult({ places: [] });
    const model = adaptWellnessDecisionToCardModel(result);
    expect(model.title).toBeNull();
    expect(model.distance).toBeNull();
    expect(model.keptCount).toBe(0);
    expect(model.subtitle).toBe("Mindfulness Reset");
    // Intent reason should still appear when intent is selected even with no places.
    expect(model.whyThis.some((s) => s.toLowerCase().includes("decompress"))).toBe(true);
  });

  it("source is always wellness_local_engine", () => {
    const model = adaptWellnessDecisionToCardModel(makeEngineResult({}));
    expect(model.source).toBe("wellness_local_engine");
  });

  it("handles undefined intent (ambient-only fallback path)", () => {
    const result = makeEngineResult({
      selectedIntent: undefined,
      places: [makePlace({ id: "a", name: "Some Place", rating: 4.3 })],
    });
    const model = adaptWellnessDecisionToCardModel(result);
    expect(model.intent).toBeUndefined();
    // No intent → no "Matched to your X intent" line, but still has context + per-place reasons.
    expect(model.whyThis.every((s) => !s.includes("intent"))).toBe(true);
  });
});
