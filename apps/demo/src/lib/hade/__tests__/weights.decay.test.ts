/**
 * weights.decay.test.ts
 *
 * Verifies the read-time temporal decay behaviour introduced in getNodeVibeScore().
 *
 * Decay formula:
 *   recencyFactor = exp(-0.15 × hoursSinceUpdate)
 *   score         = 0.5 + (rawMean − 0.5) × recencyFactor
 *
 * The weight_map is never mutated — decay is a pure read-time transformation.
 *
 * ── Key math (λ = 0.15 / hour) ───────────────────────────────────────────────
 *   fresh (0h): exp(-0.15 × 0)   = 1.0    → score = rawMean           ✓
 *   12h:        exp(-0.15 × 12)  ≈ 0.165  → score = 0.5 + Δ × 0.165  ✓
 *   48h:        exp(-0.15 × 48)  ≈ 0.0008 → score ≈ 0.5003 (<0.05)   ✓
 *
 * ── Test-setup pattern ───────────────────────────────────────────────────────
 * upsertLocationNode always writes last_updated = now. To simulate aged nodes,
 * tests backdate last_updated directly in the shared in-memory registry
 * (globalThis.__hadeNodeRegistry) after the node is written — no Date.now()
 * mocking required.
 */

import { describe, it, expect } from "vitest";
import type { LocationNode, VibeSignal, VibeTag } from "@/types/hade";
import { computeWeightDelta, upsertLocationNode, getNodeVibeScore } from "../weights";

// ─── Test ID factory ──────────────────────────────────────────────────────────

let _counter = 0;
const uid = (): string => `decay-venue-${++_counter}`;

// ─── Registry access ──────────────────────────────────────────────────────────
// Shared in-process Map — allows backdating last_updated without mocking.

const registry = (globalThis as Record<string, unknown>)
  .__hadeNodeRegistry as Map<string, LocationNode>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSignal(
  venueId:   string,
  tags:      VibeTag[],
  sentiment: VibeSignal["sentiment"],
  strength   = 1.0,
): VibeSignal {
  const now = new Date().toISOString();
  return {
    id:               `vsig-decay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    shareable:        false,
    validation_status: "approved",
    vibe_tags:        tags,
    sentiment,
  };
}

/** Creates a venue node via the real pipeline and returns its rawMean. */
async function buildVenueNode(
  venueId:   string,
  tags:      VibeTag[],
  sentiment: VibeSignal["sentiment"],
  strength   = 1.0,
): Promise<{ node: LocationNode; rawMean: number }> {
  const signal = makeSignal(venueId, tags, sentiment, strength);
  const delta  = computeWeightDelta(signal);
  const node   = await upsertLocationNode(venueId, signal, delta);
  const values = Object.values(node.weight_map) as number[];
  const rawMean = values.reduce((s, v) => s + v, 0) / values.length;
  return { node, rawMean };
}

/** Backdates last_updated in the in-memory registry by the given number of hours. */
function backdateNode(venueId: string, hoursAgo: number): void {
  const node = registry.get(venueId);
  if (!node) throw new Error(`Node not found for ${venueId}`);
  node.last_updated = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  registry.set(venueId, node);
}

/** Inserts a hand-crafted node directly into the registry for edge-case tests. */
function injectNode(venueId: string, partial: Partial<LocationNode>): void {
  const node: LocationNode = {
    venue_id:     venueId,
    weight_map:   {} as Record<VibeTag, number>,
    trust_score:  0.5,
    signal_count: 1,
    last_updated: new Date().toISOString(),
    version:      1,
    ...partial,
  };
  registry.set(venueId, node);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Temporal decay — fresh node (recencyFactor ≈ 1.0)", () => {
  it("score equals rawMean when last_updated = now", async () => {
    const venueId = uid();
    const { rawMean } = await buildVenueNode(venueId, ["perfect_vibe"], "positive", 1.0);
    // rawMean ≈ 0.9 (one saturating positive signal)

    const score = await getNodeVibeScore(venueId);

    // recencyFactor for microseconds elapsed ≈ 1.0 → score ≈ rawMean
    expect(score).toBeCloseTo(rawMean, 3); // within 0.001
    expect(score).toBeGreaterThan(0.5);
  });

  it("fresh negative node scores close to its rawMean (below 0.5)", async () => {
    const venueId = uid();
    const { rawMean } = await buildVenueNode(venueId, ["too_crowded"], "negative", 1.0);
    // rawMean ≈ 0.1

    const score = await getNodeVibeScore(venueId);

    expect(score).toBeCloseTo(rawMean, 3);
    expect(score).toBeLessThan(0.5);
  });
});

describe("Temporal decay — partial decay at 12 hours", () => {
  it("score is strictly between rawMean and 0.5 (positive venue)", async () => {
    const venueId = uid();
    const { rawMean } = await buildVenueNode(venueId, ["perfect_vibe"], "positive", 1.0);
    // rawMean ≈ 0.9

    backdateNode(venueId, 12);

    const score = await getNodeVibeScore(venueId);

    // exp(-0.15 × 12) ≈ 0.165 → score = 0.5 + (0.9 − 0.5) × 0.165 ≈ 0.566
    expect(score).toBeGreaterThan(0.5);   // has not reached neutrality
    expect(score).toBeLessThan(rawMean);  // has decayed below rawMean
    expect(score).not.toBeCloseTo(0.5, 1); // not fully decayed yet (> 0.05 from 0.5)
    expect(score).toBeCloseTo(0.566, 2);   // ±0.005 of expected value
  });

  it("score is strictly between rawMean and 0.5 (negative venue)", async () => {
    const venueId = uid();
    const { rawMean } = await buildVenueNode(venueId, ["too_crowded"], "negative", 1.0);
    // rawMean ≈ 0.1

    backdateNode(venueId, 12);

    const score = await getNodeVibeScore(venueId);

    // exp(-0.15 × 12) ≈ 0.165 → score = 0.5 + (0.1 − 0.5) × 0.165 ≈ 0.434
    expect(score).toBeLessThan(0.5);    // has not reached neutrality
    expect(score).toBeGreaterThan(rawMean); // has decayed back toward 0.5
    expect(score).not.toBeCloseTo(0.5, 1); // not fully decayed yet
    expect(score).toBeCloseTo(0.434, 2);
  });
});

describe("Temporal decay — near-full decay at 48 hours", () => {
  it("positive venue: abs(score - 0.5) < 0.05", async () => {
    const venueId = uid();
    await buildVenueNode(venueId, ["perfect_vibe"], "positive", 1.0);
    // rawMean ≈ 0.9

    backdateNode(venueId, 48);

    const score = await getNodeVibeScore(venueId);

    // exp(-0.15 × 48) ≈ 0.0008 → score ≈ 0.5 + 0.4 × 0.0008 ≈ 0.5003
    expect(Math.abs(score - 0.5)).toBeLessThan(0.05);
    expect(score).toBeGreaterThan(0.5); // still slightly above — not overshot
  });

  it("negative venue: abs(score - 0.5) < 0.05", async () => {
    const venueId = uid();
    await buildVenueNode(venueId, ["too_crowded"], "negative", 1.0);
    // rawMean ≈ 0.1

    backdateNode(venueId, 48);

    const score = await getNodeVibeScore(venueId);

    // exp(-0.15 × 48) ≈ 0.0008 → score ≈ 0.5 + (-0.4) × 0.0008 ≈ 0.4997
    expect(Math.abs(score - 0.5)).toBeLessThan(0.05);
    expect(score).toBeLessThan(0.5); // still slightly below — not overshot
  });
});

describe("Temporal decay — monotonicity", () => {
  it("older nodes always score closer to 0.5 than newer ones (positive venue)", async () => {
    const v1h  = uid();
    const v12h = uid();
    const v48h = uid();

    // Same rawMean in all three
    await buildVenueNode(v1h,  ["perfect_vibe"], "positive", 1.0);
    await buildVenueNode(v12h, ["perfect_vibe"], "positive", 1.0);
    await buildVenueNode(v48h, ["perfect_vibe"], "positive", 1.0);

    backdateNode(v1h,  1);
    backdateNode(v12h, 12);
    backdateNode(v48h, 48);

    const [s1h, s12h, s48h] = await Promise.all([
      getNodeVibeScore(v1h),
      getNodeVibeScore(v12h),
      getNodeVibeScore(v48h),
    ]);

    const dist1h  = Math.abs(s1h  - 0.5);
    const dist12h = Math.abs(s12h - 0.5);
    const dist48h = Math.abs(s48h - 0.5);

    // Monotonically decaying toward 0.5
    expect(dist1h).toBeGreaterThan(dist12h);
    expect(dist12h).toBeGreaterThan(dist48h);
  });
});

describe("Edge cases — invalid inputs", () => {
  it("empty weight_map returns 0.5", async () => {
    const venueId = uid();
    injectNode(venueId, {
      weight_map:   {} as Record<VibeTag, number>,
      signal_count: 1, // signal_count > 0 so the first guard passes
    });

    const score = await getNodeVibeScore(venueId);
    expect(score).toBe(0.5);
  });

  it("missing last_updated (empty string) returns 0.5", async () => {
    const venueId = uid();
    injectNode(venueId, {
      weight_map:   { perfect_vibe: 0.9 } as Record<VibeTag, number>,
      last_updated: "", // new Date("").getTime() → NaN
    });

    const score = await getNodeVibeScore(venueId);
    expect(score).toBe(0.5);
  });

  it("unparseable last_updated returns 0.5", async () => {
    const venueId = uid();
    injectNode(venueId, {
      weight_map:   { perfect_vibe: 0.9 } as Record<VibeTag, number>,
      last_updated: "not-a-date",
    });

    const score = await getNodeVibeScore(venueId);
    expect(score).toBe(0.5);
  });

  it("score never leaves [0, 1] for extreme ages and extreme weights", async () => {
    const ages    = [0, 12, 48, 720]; // up to 30 days
    const rawMeans = [0.1, 0.9];      // floor and ceiling

    for (const rawMean of rawMeans) {
      const tag: VibeTag    = rawMean > 0.5 ? "perfect_vibe" : "too_crowded";
      const sentiment       = rawMean > 0.5 ? "positive" : "negative";

      for (const hoursAgo of ages) {
        const venueId = uid();
        await buildVenueNode(venueId, [tag], sentiment as VibeSignal["sentiment"], 1.0);
        if (hoursAgo > 0) backdateNode(venueId, hoursAgo);

        const score = await getNodeVibeScore(venueId);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
        expect(Number.isFinite(score)).toBe(true);
        expect(Number.isNaN(score)).toBe(false);
      }
    }
  });

  it("venue with signal_count === 0 returns 0.5 (pre-decay guard)", async () => {
    // Tests that the existing signal_count guard fires before the decay logic.
    const venueId = uid();
    injectNode(venueId, {
      weight_map:   { perfect_vibe: 0.9 } as Record<VibeTag, number>,
      signal_count: 0,
    });

    const score = await getNodeVibeScore(venueId);
    expect(score).toBe(0.5);
  });
});
