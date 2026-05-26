import { describe, it, expect } from "vitest";
import { computeConfidence, syntheticConfidence } from "../confidence";
import { buildExplanation } from "../explanation";

type TestNode = {
  signal_count: number;
  weight_map: Record<string, number>;
  last_updated: string;
};

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

describe("confidence + explanation", () => {
  it("No UGC returns baseline confidence and default explanation", () => {
    const node: TestNode = {
      signal_count: 0,
      weight_map: {},
      last_updated: new Date().toISOString(),
    };

    const confidence = computeConfidence(node);
    const explanation = buildExplanation(node);

    expect(confidence).toBe(0.5);
    expect(explanation).toEqual(["Based on general data"]);
  });

  it("Conflicting signals (wide spread) produce lower confidence", () => {
    const conflictingNode: TestNode = {
      signal_count: 12,
      weight_map: {
        good_energy: 0.95,
        too_crowded: 0.95,
      },
      last_updated: isoHoursAgo(1),
    };

    const agreementNode: TestNode = {
      signal_count: 12,
      weight_map: {
        good_energy: 0.62,
        chill: 0.61,
      },
      last_updated: isoHoursAgo(1),
    };

    const conflictingConfidence = computeConfidence(conflictingNode);
    const agreementConfidence = computeConfidence(agreementNode);

    expect(conflictingConfidence).toBeLessThan(agreementConfidence);
  });

  it("Stale data (>24h) lowers confidence", () => {
    const freshNode: TestNode = {
      signal_count: 10,
      weight_map: { good_energy: 1.1, chill: 0.1 },
      last_updated: isoHoursAgo(1),
    };

    const staleNode: TestNode = {
      signal_count: 10,
      weight_map: { good_energy: 1.1, chill: 0.1 },
      last_updated: isoHoursAgo(30),
    };

    const freshConfidence = computeConfidence(freshNode);
    const staleConfidence = computeConfidence(staleNode);

    expect(staleConfidence).toBeLessThan(freshConfidence);
  });

  it("Missing node does not crash and returns defaults", () => {
    expect(() => computeConfidence(undefined)).not.toThrow();
    expect(() => buildExplanation(undefined)).not.toThrow();

    expect(computeConfidence(undefined)).toBe(0.5);
    expect(buildExplanation(undefined)).toEqual(["Based on general data"]);
  });

  it("Strong signals (high agreement + high count) yield confidence > 0.75", () => {
    const strongNode: TestNode = {
      signal_count: 25,
      weight_map: {
        good_energy: 1.2,
        chill: 1.1,
        too_crowded: 0.1,
      },
      last_updated: isoHoursAgo(1),
    };

    const confidence = computeConfidence(strongNode);

    expect(confidence).toBeGreaterThan(0.75);
  });
});

describe("syntheticConfidence", () => {
  it("low finalScore maps to low-end confidence (>= 0.30, < 0.50)", () => {
    const result = syntheticConfidence(0.1);
    expect(result).toBeGreaterThanOrEqual(0.30);
    expect(result).toBeLessThan(0.50);
  });

  it("high finalScore maps to high-end confidence (<= 0.95, > 0.75)", () => {
    const result = syntheticConfidence(0.9);
    expect(result).toBeGreaterThan(0.75);
    expect(result).toBeLessThanOrEqual(0.95);
  });

  it("NaN input returns safety fallback 0.5", () => {
    expect(syntheticConfidence(NaN)).toBe(0.5);
  });

  it("boundary values clamp correctly: 0 → 0.30, 1 → 0.95", () => {
    expect(syntheticConfidence(0)).toBe(0.30);
    expect(syntheticConfidence(1)).toBe(0.95);
  });
});
