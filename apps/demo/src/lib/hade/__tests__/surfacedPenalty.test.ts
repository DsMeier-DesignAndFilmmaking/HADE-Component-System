import { describe, it, expect } from "vitest";
import {
  computeSurfacedPenalty,
  SURFACED_ONCE_PENALTY,
  SURFACED_TWICE_PENALTY,
} from "../surfacedPenalty";

describe("computeSurfacedPenalty", () => {
  it("returns 0 for a candidate never surfaced this session", () => {
    expect(computeSurfacedPenalty(0)).toBe(0);
  });

  it("returns -0.08 for a candidate surfaced exactly once", () => {
    expect(computeSurfacedPenalty(1)).toBe(SURFACED_ONCE_PENALTY);
    expect(computeSurfacedPenalty(1)).toBe(-0.08);
  });

  it("returns -0.14 for a candidate surfaced twice", () => {
    expect(computeSurfacedPenalty(2)).toBe(SURFACED_TWICE_PENALTY);
    expect(computeSurfacedPenalty(2)).toBe(-0.14);
  });

  it("returns -0.14 for a candidate surfaced three or more times (penalty does not grow further)", () => {
    expect(computeSurfacedPenalty(3)).toBe(-0.14);
    expect(computeSurfacedPenalty(10)).toBe(-0.14);
  });

  it("penalty is strictly weaker than rejection (which hard-excludes)", () => {
    // Rejection removes a candidate entirely; the worst surfaced penalty is -0.14.
    // A candidate with a baseline score of 0.15 still survives as a non-zero result.
    const baseline = 0.15;
    const worstPenalty = SURFACED_TWICE_PENALTY; // -0.14
    expect(Math.max(0, baseline + worstPenalty)).toBeGreaterThan(0);
  });

  it("twice-surfaced penalty is larger than once-surfaced penalty", () => {
    expect(Math.abs(computeSurfacedPenalty(2))).toBeGreaterThan(Math.abs(computeSurfacedPenalty(1)));
  });
});

describe("soft repeat-penalty ordering", () => {
  function applyPenalty(baseScore: number, surfacedCount: number): number {
    return Math.max(0, Math.min(1, baseScore + computeSurfacedPenalty(surfacedCount)));
  }

  it("a surfaced candidate scores lower than an identical unsurfaced candidate", () => {
    const score = 0.70;
    expect(applyPenalty(score, 1)).toBeLessThan(applyPenalty(score, 0));
    expect(applyPenalty(score, 2)).toBeLessThan(applyPenalty(score, 1));
  });

  it("a high-confidence candidate is not suppressed to zero after two surfacings", () => {
    // A very strong result (score 0.90) should still rank above zero after max penalty.
    expect(applyPenalty(0.90, 2)).toBeGreaterThan(0);
    expect(applyPenalty(0.90, 2)).toBeCloseTo(0.90 + SURFACED_TWICE_PENALTY, 5);
  });

  it("unsurfaced candidate beats twice-surfaced candidate with same base score", () => {
    const base = 0.65;
    expect(applyPenalty(base, 0)).toBeGreaterThan(applyPenalty(base, 2));
  });

  it("once-surfaced candidate beats twice-surfaced candidate with same base score", () => {
    const base = 0.65;
    expect(applyPenalty(base, 1)).toBeGreaterThan(applyPenalty(base, 2));
  });
});
