import { describe, expect, it } from "vitest";
import type { HadeContext } from "@/types/hade";
import { resolveDecisionSupportText, type DecisionSupportLens } from "../supportText";

const entertainmentLens: DecisionSupportLens = {
  id: "entertainment",
  label: "Entertainment",
  context: "Something worth doing tonight",
  frame: "Something nearby worth doing tonight.",
};

const wellnessLens: DecisionSupportLens = {
  id: "wellness",
  label: "Wellness",
  context: "Context-aware nudges and resets",
  frame: "A reset that fits your current energy and location.",
};

const foodLens: DecisionSupportLens = {
  id: "food",
  label: "Food & Dining",
  context: "Reduce decision fatigue nearby",
  frame: "Low-friction nearby food decision.",
};

const context: HadeContext = {
  geo: { lat: 39.7392, lng: -104.9903 },
  time_of_day: "evening",
  day_type: "weekday_evening",
  situation: { intent: null, urgency: "medium" },
  state: { energy: "medium", openness: "open" },
  social: { group_size: 1, group_type: "solo" },
  constraints: {},
  radius_meters: 1200,
  session_id: "support-text-test",
  signals: [],
  rejection_history: [],
};

describe("resolveDecisionSupportText", () => {
  it("does not use lens marketing slogans for UGC support", () => {
    const support = resolveDecisionSupportText({
      lens: entertainmentLens,
      source: "user",
      candidateType: "ugc",
      confidence: 0.7,
      isFallback: false,
      isUGC: true,
      context,
    });

    expect(support.label).not.toContain("Something worth doing tonight");
    expect(support.label).toMatch(/Community|Added|added/);
    expect(support.detail).toBeUndefined();
  });

  it("uses contextual venue support instead of repeated entertainment framing", () => {
    const support = resolveDecisionSupportText({
      lens: entertainmentLens,
      source: "synthetic",
      candidateType: "venue",
      confidence: 0.68,
      isFallback: false,
      isUGC: false,
      context,
      decisionFrame: "Something nearby worth doing tonight.",
    });

    expect(support.label).toBe("Nearby activity with low planning friction.");
    expect(support.detail).toBeUndefined();
  });

  it("keeps food support explicitly food-related across context branches", () => {
    const support = resolveDecisionSupportText({
      lens: foodLens,
      source: "synthetic",
      candidateType: "venue",
      confidence: 0.66,
      isFallback: false,
      isUGC: false,
      context: {
        ...context,
        situation: { ...context.situation, urgency: "high" },
      },
    });

    expect(support.label).toBe("Closest useful food option right now.");
    expect(support.label.toLowerCase()).toContain("food");
  });

  it("keeps wellness support away from nightlife phrasing", () => {
    const support = resolveDecisionSupportText({
      lens: wellnessLens,
      source: "synthetic",
      candidateType: "venue",
      confidence: 0.72,
      isFallback: false,
      isUGC: false,
      context,
    });

    expect(support.label).toBe("Nearby reset that fits your current energy.");
    expect(support.label.toLowerCase()).not.toContain("tonight");
  });

  it("uses honest fallback copy for degraded cards", () => {
    const support = resolveDecisionSupportText({
      lens: entertainmentLens,
      source: "static_fallback",
      candidateType: "fallback",
      confidence: 0.4,
      isFallback: true,
      isUGC: false,
      context,
    });

    expect(support.label).toBe("Best nearby match while live context is limited.");
  });
});
