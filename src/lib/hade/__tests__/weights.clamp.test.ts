/**
 * weights.clamp.test.ts
 *
 * Verifies that LocationNode weight_map values are always clamped to [0.1, 0.9]
 * regardless of signal volume, and that the scoring layer treats those bounds as
 * soft limits rather than absolute rejection / guaranteed-champion signals.
 *
 * All tests use the in-memory registry (no Redis env vars in test environment).
 * Each test gets a unique venue ID via a monotonic counter so the shared
 * globalThis.__hadeNodeRegistry is never read from a previous test's writes.
 *
 * ── Key math ─────────────────────────────────────────────────────────────────
 * source = "user"  → UGC_TRUST_FACTOR = 0.8
 * emitted_at = now → timeFactor = exp(-0.1 * 0) = 1.0
 * strength   = 1.0 → delta = 1.0 * 0.8 * 1.0 = 0.8
 *
 * From neutral (0.5):
 *   negative: 0.5 + (−1) × 0.8 = −0.3  → clamp → 0.1  (floor, 1 signal)
 *   positive: 0.5 + ( 1) × 0.8 =  1.3  → clamp → 0.9  (ceiling, 1 signal)
 *
 * Every subsequent signal of the same polarity keeps the value at the bound.
 */

import { describe, it, expect } from "vitest";
import type { LocationNode, VibeSignal, VibeTag } from "@/types/hade";
import {
  computeWeightDelta,
  upsertLocationNode,
  getNodeVibeScore,
} from "../weights";

// ─── Unique venue ID factory ──────────────────────────────────────────────────

let _counter = 0;
const uid = (): string => `clamp-venue-${++_counter}`;

// ─── Signal factory ───────────────────────────────────────────────────────────

/**
 * Builds a minimal valid VibeSignal for the given venue.
 * source="user" applies UGC_TRUST_FACTOR (0.8).
 * emitted_at=now means time decay ≈ 1.0 (zero staleness penalty).
 */
function makeSignal(
  venueId: string,
  tags:     VibeTag[],
  sentiment: VibeSignal["sentiment"],
  strength  = 1.0,
): VibeSignal {
  const now = new Date().toISOString();
  return {
    id:               `vsig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type:             "AMBIENT",
    venue_id:         venueId,
    location_node_id: venueId,
    content:          null,
    strength,
    emitted_at:       now,
    expires_at:       now,
    geo:              { lat: 37.7749, lng: -122.4194 },
    source:           "user",
    category:         "vibe",
    vibe_tags:        tags,
    sentiment,
    shareable:        false,
    validation_status: "approved",
  };
}

/**
 * Applies N identical signals to a venue using the real computeWeightDelta +
 * upsertLocationNode pipeline, and returns the final LocationNode state.
 */
async function applyN(
  venueId:   string,
  tags:      VibeTag[],
  sentiment: VibeSignal["sentiment"],
  n:         number,
  strength   = 1.0,
): Promise<LocationNode> {
  let node!: LocationNode;
  for (let i = 0; i < n; i++) {
    const signal = makeSignal(venueId, tags, sentiment, strength);
    const delta  = computeWeightDelta(signal);
    node         = await upsertLocationNode(venueId, signal, delta);
  }
  return node;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Weight clamp — lower bound [0.1]", () => {
  it("1000 negative signals cannot push any weight below 0.1", async () => {
    const venueId = uid();

    // One signal drives too_crowded from 0.5 to 0.1. All 999 subsequent
    // signals keep it there — the floor is a hard stop, not soft decay.
    const node = await applyN(venueId, ["too_crowded"], "negative", 1000, 1.0);

    const weights = Object.values(node.weight_map) as number[];
    expect(weights.length).toBeGreaterThan(0);
    expect(Math.min(...weights)).toBeGreaterThanOrEqual(0.1);
    expect(node.weight_map["too_crowded"]).toBe(0.1);
  });

  it("floor holds across multiple negative tags applied simultaneously", async () => {
    const venueId = uid();
    const tags: VibeTag[] = ["too_crowded", "overpriced", "skip_it"];

    const node = await applyN(venueId, tags, "negative", 500, 1.0);

    for (const tag of tags) {
      expect(node.weight_map[tag]).toBeGreaterThanOrEqual(0.1);
      expect(node.weight_map[tag]).toBe(0.1); // saturated at floor
    }
  });
});

describe("Weight clamp — upper bound [0.9]", () => {
  it("1000 positive signals cannot push any weight above 0.9", async () => {
    const venueId = uid();

    // One signal drives perfect_vibe from 0.5 to 0.9. All 999 subsequent
    // signals keep it there — the ceiling is a hard stop.
    const node = await applyN(venueId, ["perfect_vibe"], "positive", 1000, 1.0);

    const weights = Object.values(node.weight_map) as number[];
    expect(weights.length).toBeGreaterThan(0);
    expect(Math.max(...weights)).toBeLessThanOrEqual(0.9);
    expect(node.weight_map["perfect_vibe"]).toBe(0.9);
  });

  it("ceiling holds across multiple positive tags applied simultaneously", async () => {
    const venueId = uid();
    const tags: VibeTag[] = ["perfect_vibe", "hidden_gem", "good_energy"];

    const node = await applyN(venueId, tags, "positive", 500, 1.0);

    for (const tag of tags) {
      expect(node.weight_map[tag]).toBeLessThanOrEqual(0.9);
      expect(node.weight_map[tag]).toBe(0.9); // saturated at ceiling
    }
  });
});

describe("Weight clamp — recoverability", () => {
  it(
    "venue saturated at floor recovers with subsequent positive signals",
    async () => {
      const venueId = uid();

      // Phase 1: saturate too_crowded at the floor
      await applyN(venueId, ["too_crowded"], "negative", 1000, 1.0);
      const scoreFloor = await getNodeVibeScore(venueId);
      expect(scoreFloor).toBeCloseTo(0.1, 5);

      // Phase 2: introduce 100 positive signals for a distinct tag
      await applyN(venueId, ["perfect_vibe"], "positive", 100, 1.0);
      const scoreRecovered = await getNodeVibeScore(venueId);

      // too_crowded = 0.1, perfect_vibe = 0.9 → mean = 0.5
      expect(scoreRecovered).toBeGreaterThan(scoreFloor);
      expect(scoreRecovered).toBeGreaterThan(0.1);
      expect(scoreRecovered).toBeCloseTo(0.5, 5);
    },
  );

  it(
    "venue saturated at ceiling is tempered by subsequent negative signals",
    async () => {
      const venueId = uid();

      // Phase 1: saturate perfect_vibe at the ceiling
      await applyN(venueId, ["perfect_vibe"], "positive", 1000, 1.0);
      const scoreCeiling = await getNodeVibeScore(venueId);
      expect(scoreCeiling).toBeCloseTo(0.9, 5);

      // Phase 2: introduce 100 negative signals for a distinct tag
      await applyN(venueId, ["too_crowded"], "negative", 100, 1.0);
      const scoreTempered = await getNodeVibeScore(venueId);

      // perfect_vibe = 0.9, too_crowded = 0.1 → mean = 0.5
      expect(scoreTempered).toBeLessThan(scoreCeiling);
      expect(scoreTempered).toBeLessThan(0.9);
      expect(scoreTempered).toBeCloseTo(0.5, 5);
    },
  );
});

describe("Weight clamp — symmetry", () => {
  it(
    "equal positive and negative signal volume across distinct tags → score ≈ 0.5",
    async () => {
      const venueId = uid();
      const N = 50;

      // After saturation: too_crowded = 0.1, perfect_vibe = 0.9
      // getNodeVibeScore() = mean(0.1, 0.9) = exactly 0.5
      await applyN(venueId, ["too_crowded"],  "negative", N, 1.0);
      await applyN(venueId, ["perfect_vibe"], "positive", N, 1.0);

      const score = await getNodeVibeScore(venueId);
      expect(Math.abs(score - 0.5)).toBeLessThan(0.01);
      expect(score).toBeCloseTo(0.5, 5);
    },
  );

  it(
    "symmetry midpoint is invariant to signal volume (50 vs 1000 each)",
    async () => {
      const venue50   = uid();
      const venue1000 = uid();

      await applyN(venue50,   ["too_crowded"],  "negative",   50, 1.0);
      await applyN(venue50,   ["perfect_vibe"], "positive",   50, 1.0);

      await applyN(venue1000, ["too_crowded"],  "negative", 1000, 1.0);
      await applyN(venue1000, ["perfect_vibe"], "positive", 1000, 1.0);

      const score50   = await getNodeVibeScore(venue50);
      const score1000 = await getNodeVibeScore(venue1000);

      // Both converge to 0.5 regardless of volume — clamp saturation is
      // idempotent; piling on more signals doesn't shift the midpoint
      expect(score50).toBeCloseTo(0.5, 5);
      expect(score1000).toBeCloseTo(0.5, 5);
      expect(Math.abs(score50 - score1000)).toBeLessThan(0.01);
    },
  );
});

describe("Weight clamp — scoring integration", () => {
  it("getNodeVibeScore() always returns a value within [0.1, 0.9] after signals", async () => {
    const venueNeg = uid();
    const venuePos = uid();
    const venueMix = uid();

    await applyN(venueNeg, ["too_crowded"],  "negative", 1000, 1.0);
    await applyN(venuePos, ["perfect_vibe"], "positive", 1000, 1.0);
    await applyN(venueMix, ["too_crowded"],  "negative",  500, 1.0);
    await applyN(venueMix, ["perfect_vibe"], "positive",  500, 1.0);

    const scoreNeg = await getNodeVibeScore(venueNeg);
    const scorePos = await getNodeVibeScore(venuePos);
    const scoreMix = await getNodeVibeScore(venueMix);

    for (const score of [scoreNeg, scorePos, scoreMix]) {
      expect(score).toBeGreaterThanOrEqual(0.1);
      expect(score).toBeLessThanOrEqual(0.9);
    }

    // Fully positive must rank strictly higher than fully negative —
    // the system discriminates rather than collapsing to a flat output
    expect(scorePos).toBeGreaterThan(scoreNeg);
  });

  it(
    "floor-clamped venue (0.1) is NOT treated as absolute rejection — score is positive and finite",
    async () => {
      const venueId = uid();
      await applyN(venueId, ["too_crowded"], "negative", 1000, 1.0);

      const score = await getNodeVibeScore(venueId);

      // 0.1 is minimum influence, not zero — venue can still rank (softly penalised).
      // toBeCloseTo(0.1, 4) rather than toBe(0.1): temporal decay applies a recencyFactor
      // of exp(-0.15 × elapsed_hours) even for freshly-written nodes; the microsecond
      // elapsed between upsertLocationNode and getNodeVibeScore introduces a ~1e-7 error
      // that is within 4-decimal tolerance but breaks strict Object.is equality.
      expect(score).toBeCloseTo(0.1, 4);
      expect(score).toBeGreaterThan(0);
      expect(Number.isFinite(score)).toBe(true);
      expect(Number.isNaN(score)).toBe(false);
    },
  );

  it(
    "ceiling-clamped venue (0.9) is NOT an absolute champion — score is bounded below 1",
    async () => {
      const venueId = uid();
      await applyN(venueId, ["perfect_vibe"], "positive", 1000, 1.0);

      const score = await getNodeVibeScore(venueId);

      // 0.9 is maximum influence, not 1.0 — other ranking factors still apply.
      // toBeCloseTo(0.9, 4): same reason as the 0.1 floor test above — recencyFactor
      // is not exactly 1.0 for any non-zero elapsed time, causing a ~1e-7 deviation.
      expect(score).toBeCloseTo(0.9, 4);
      expect(score).toBeLessThan(1.0);
      expect(Number.isFinite(score)).toBe(true);
      expect(Number.isNaN(score)).toBe(false);
    },
  );

  it("venue with no signals returns neutral score (0.5)", async () => {
    const venueId = uid();

    const score = await getNodeVibeScore(venueId);
    expect(score).toBe(0.5);
  });
});
