import { describe, expect, it } from "vitest";
import {
  buildDecisionEngineOutput,
  confidenceBand,
  confidenceLabelId,
  fromDecideResponse,
  fromHadeDecision,
  normalizeDecisionSource,
  type HadeDecisionLike,
} from "../buildOutput.js";
import { DECISION_ENGINE_OUTPUT_VERSION } from "../../types/DecisionEngineOutput.js";

function sampleDecision(overrides: Partial<HadeDecisionLike> = {}): HadeDecisionLike {
  return {
    id: "places/ChIJ12345abcde",
    venue_name: "Hart's",
    category: "wine_bar",
    geo: { lat: 40.6818, lng: -73.9591 },
    distance_meters: 420,
    eta_minutes: 6,
    neighborhood: "Bed-Stuy",
    address: "457 Nostrand Ave, Brooklyn, NY",
    rationale: "Three friends checked in here in the last hour.",
    why_now: "Good energy right now.",
    why_this: "Matches your scene vibe.",
    decision_frame: "Strong local pick for tonight.",
    confidence_label: "Strong pick",
    confidence: 0.78,
    situation_summary: "Looking for a scene nearby.",
    is_fallback: false,
    ...overrides,
  };
}

describe("normalizeDecisionSource", () => {
  it("maps engine and legacy aliases to the audit union", () => {
    expect(normalizeDecisionSource("synthetic")).toBe("synthetic");
    expect(normalizeDecisionSource("cold_start_synthetic")).toBe("cold_start_synthetic");
    expect(normalizeDecisionSource("offline_cache")).toBe("offline_cache");
    expect(normalizeDecisionSource("cold_start_fallback")).toBe("static_fallback");
    expect(normalizeDecisionSource("static_synthetic:default_walks")).toBe("static_fallback");
    expect(normalizeDecisionSource(undefined, undefined, true)).toBe("static_fallback");
  });
});

describe("confidenceBand", () => {
  it("uses default 0.7 / 0.4 thresholds when threshold is 0", () => {
    expect(confidenceBand(0.78)).toBe("high");
    expect(confidenceBand(0.55)).toBe("medium");
    expect(confidenceBand(0.25)).toBe("low");
  });

  it("shifts bars when confidence_threshold is raised", () => {
    expect(confidenceBand(0.78, 0.5)).toBe("medium");
  });
});

describe("confidenceLabelId", () => {
  it("maps display labels to stable ids", () => {
    expect(confidenceLabelId("Strong pick", 0.9)).toBe("strong_pick");
    expect(confidenceLabelId("Good fit", 0.5)).toBe("good_fit");
    expect(confidenceLabelId("Exploratory", 0.2)).toBe("exploratory");
  });

  it("falls back to score cutoffs for unknown labels", () => {
    expect(confidenceLabelId("Custom", 0.7)).toBe("strong_pick");
    expect(confidenceLabelId("Custom", 0.45)).toBe("good_fit");
  });
});

describe("buildDecisionEngineOutput", () => {
  it("produces audit-shaped output with version and decision fields", () => {
    const output = buildDecisionEngineOutput(sampleDecision(), {
      request_id: "req_test",
      source: "synthetic",
      config_hash: "sha256:test",
    });

    expect(output.output_version).toBe(DECISION_ENGINE_OUTPUT_VERSION);
    expect(output.request_id).toBe("req_test");
    expect(output.source).toBe("synthetic");
    expect(output.is_fallback).toBe(false);
    expect(output.decision.venue_name).toBe("Hart's");
    expect(output.decision.geo).toEqual({ lat: 40.6818, lng: -73.9591 });
    expect(output.confidence).toEqual({
      score: 0.78,
      label_id: "strong_pick",
      band: "high",
    });
    expect(output.rationale.primary_text).toBe(
      "Three friends checked in here in the last hour.",
    );
    expect(output.action_tokens.primary.kind).toBe("navigate");
    expect(output.action_tokens.primary.payload).toMatchObject({
      lat: 40.6818,
      lng: -73.9591,
      mode: "walking",
    });
    expect(output.ux_state.next_action).toBe("commit");
    expect(output.analytics.config_hash).toBe("sha256:test");
    expect(output.analytics.engine_tier).toBe("synthetic");
  });

  it("routes medium confidence to expand_radius (demo CTA behavior)", () => {
    const output = buildDecisionEngineOutput(
      sampleDecision({ confidence: 0.55, confidence_label: "Good fit" }),
    );
    expect(output.confidence.band).toBe("medium");
    expect(output.ux_state.next_action).toBe("expand_radius");
    expect(output.action_tokens.secondary[0]?.label_id).toBe("action.explore_nearby");
  });

  it("routes low confidence to refine sheet", () => {
    const output = buildDecisionEngineOutput(
      sampleDecision({ confidence: 0.25, confidence_label: "Exploratory" }),
    );
    expect(output.confidence.band).toBe("low");
    expect(output.ux_state.next_action).toBe("refine");
    expect(output.ux_state.suggested_sheet).toBe("refine");
  });

  it("marks fallback decisions and static sources", () => {
    const output = buildDecisionEngineOutput(
      sampleDecision({
        is_fallback: true,
        source: "static_fallback",
        confidence: 0.3,
        confidence_label: "Exploratory",
      }),
      { source: "static_fallback" },
    );
    expect(output.is_fallback).toBe(true);
    expect(output.source).toBe("static_fallback");
    expect(output.theme_tokens.semantic.confidence_color_id).toBe("color.signal.weak");
  });

  it("includes commitment_preview slot when commitment is present", () => {
    const output = buildDecisionEngineOutput(
      sampleDecision({ commitment: { steps: [] } }),
    );
    expect(output.layout_tokens.show_slots).toContain("commitment_preview");
  });
});

describe("fromHadeDecision", () => {
  it("is an alias for buildDecisionEngineOutput", () => {
    const decision = sampleDecision();
    const a = fromHadeDecision(decision, { request_id: "req_alias" });
    const b = buildDecisionEngineOutput(decision, { request_id: "req_alias" });
    expect(a).toEqual(b);
  });
});

describe("fromDecideResponse", () => {
  it("uses response source and candidates_evaluated for analytics", () => {
    const output = fromDecideResponse({
      decision: sampleDecision(),
      source: "cold_start_synthetic",
      context_snapshot: {
        decision_basis: "fallback",
        candidates_evaluated: 12,
      },
    });

    expect(output.source).toBe("cold_start_synthetic");
    expect(output.analytics.candidates_considered).toBe(12);
    expect(output.analytics.engine_tier).toBe("cold_start_synthetic");
  });

  it("respects client-provided ux.ui_state over confidence-derived UX", () => {
    const output = fromDecideResponse({
      decision: sampleDecision({ confidence: 0.9 }),
      ux: { ui_state: "low" },
    });

    expect(output.ux_state.next_action).toBe("refine");
    expect(output.ux_state.suggested_sheet).toBe("refine");
  });
});
