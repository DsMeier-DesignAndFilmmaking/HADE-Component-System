/**
 * trust.test.ts
 *
 * Covers the Device Trust Scoring layer at four levels:
 *
 *   1. Unit — safeGetTrustMultiplier / updateDeviceTrust in isolation
 *   2. Regression protection — parity, failure fallback, no-deviceId path
 *   3. Performance guard — synchronous read verifiable at the type level
 *   4. Functional — trust changes scoring output; clamp enforced
 *
 * Safety invariant that runs through every test:
 *   If trust infrastructure is unavailable → multiplier = 1.0 → behaviour
 *   identical to the pre-trust codebase. No test should be able to make the
 *   system crash by exercising the trust layer.
 *
 * ── Key math ─────────────────────────────────────────────────────────────────
 * strength=0.3, source="user", emitted_at=now →
 *   delta = 0.3 × UGC_TRUST_FACTOR(0.8) × timeFactor(≈1.0) = 0.24
 *
 * From neutral start (0.5), negative signal "too_crowded":
 *   trust=1.0 → 0.5 − 0.24 × 1.0 = 0.26
 *   trust=0.8 → 0.5 − 0.24 × 0.8 = 0.308
 *   trust=1.3 → 0.5 − 0.24 × 1.3 = 0.188
 */

import { describe, it, expect } from "vitest";
import type { VibeSignal } from "@/types/hade";
import {
  getTrustMultiplier,
  safeGetTrustMultiplier,
  updateDeviceTrust,
  INITIAL_TRUST,
  MIN_TRUST,
  MAX_TRUST,
} from "../trust";
import { computeWeightDelta, upsertLocationNode } from "../weights";

// ─── Test ID factory ──────────────────────────────────────────────────────────
// Each test gets unique venue + device IDs so the shared globalThis registries
// never carry state between tests.

let _c = 0;
const nextIds = () => ({ venueId: `tv-${++_c}`, deviceId: `td-${_c}` });

// ─── Signal factory ───────────────────────────────────────────────────────────

function makeSignal(
  venueId:   string,
  deviceId:  string,
  sentiment: VibeSignal["sentiment"] = "negative",
  strength   = 0.3,
): VibeSignal {
  const now = new Date().toISOString();
  return {
    id:               `vsig-test-${Date.now()}`,
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
    vibe_tags:        sentiment === "negative" ? ["too_crowded"] : ["perfect_vibe"],
    sentiment,
    source_user_id:   deviceId,
  };
}

// ─── 1. Unit tests — safeGetTrustMultiplier ───────────────────────────────────

describe("safeGetTrustMultiplier — fail-safe guarantees", () => {
  it("returns 1.0 when deviceId is undefined", () => {
    expect(safeGetTrustMultiplier(undefined)).toBe(1.0);
  });

  it("returns 1.0 when deviceId is empty string", () => {
    expect(safeGetTrustMultiplier("")).toBe(1.0);
  });

  it("returns INITIAL_TRUST (1.0) for an unknown (new) device", () => {
    const { deviceId } = nextIds();
    expect(safeGetTrustMultiplier(deviceId)).toBe(INITIAL_TRUST);
  });

  it("is synchronous — returns a plain number (never a Promise)", () => {
    const result = safeGetTrustMultiplier("any-device");
  
    // Must be a primitive number
    expect(typeof result).toBe("number");
  
    // Explicitly ensure it's not thenable (stronger than instanceof check)
    expect(result).not.toHaveProperty("then");
  
    // Defensive: Promise.resolve should NOT wrap it differently
    expect(Promise.resolve(result)).resolves.toBe(result);
  });

  it("always returns a finite number regardless of input", () => {
    for (const input of [undefined, "", "server", "unknown", "real-device-xyz"]) {
      const result = safeGetTrustMultiplier(input);
      expect(Number.isFinite(result)).toBe(true);
      expect(Number.isNaN(result)).toBe(false);
    }
  });

  it("returns 1.0 for placeholder 'server' (SSR origin)", () => {
    // "server" is the value getDeviceId() returns in SSR — must never accumulate
    expect(safeGetTrustMultiplier("server")).toBe(INITIAL_TRUST);
  });

  it("returns 1.0 for placeholder 'unknown' (localStorage blocked)", () => {
    expect(safeGetTrustMultiplier("unknown")).toBe(INITIAL_TRUST);
  });
});

// ─── 2. Unit tests — updateDeviceTrust ───────────────────────────────────────

describe("updateDeviceTrust — storage and clamping", () => {
  it("positive delta increases trust above INITIAL_TRUST", async () => {
    const { deviceId } = nextIds();
    await updateDeviceTrust(deviceId, 0.3);
    expect(getTrustMultiplier(deviceId)).toBeCloseTo(1.3, 5);
  });

  it("negative delta decreases trust below INITIAL_TRUST", async () => {
    const { deviceId } = nextIds();
    await updateDeviceTrust(deviceId, -0.3);
    expect(getTrustMultiplier(deviceId)).toBeCloseTo(0.7, 5);
  });

  it("multiple calls accumulate correctly", async () => {
    const { deviceId } = nextIds();
    await updateDeviceTrust(deviceId, 0.1);
    await updateDeviceTrust(deviceId, 0.1);
    await updateDeviceTrust(deviceId, 0.1);
    expect(getTrustMultiplier(deviceId)).toBeCloseTo(1.3, 5);
  });

  it("trust is clamped to MAX_TRUST (1.5) regardless of cumulative delta", async () => {
    const { deviceId } = nextIds();
    await updateDeviceTrust(deviceId, 10); // extreme positive
    expect(getTrustMultiplier(deviceId)).toBe(MAX_TRUST);
    expect(getTrustMultiplier(deviceId)).toBeLessThanOrEqual(1.5);
  });

  it("trust is clamped to MIN_TRUST (0.5) regardless of cumulative delta", async () => {
    const { deviceId } = nextIds();
    await updateDeviceTrust(deviceId, -10); // extreme negative
    expect(getTrustMultiplier(deviceId)).toBe(MIN_TRUST);
    expect(getTrustMultiplier(deviceId)).toBeGreaterThanOrEqual(0.5);
  });

  it("placeholder 'server' is silently ignored — no registry entry created", async () => {
    const before = safeGetTrustMultiplier("server");
    await updateDeviceTrust("server", 0.5);
    expect(safeGetTrustMultiplier("server")).toBe(before); // still 1.0
  });

  it("placeholder 'unknown' is silently ignored", async () => {
    const before = safeGetTrustMultiplier("unknown");
    await updateDeviceTrust("unknown", 0.5);
    expect(safeGetTrustMultiplier("unknown")).toBe(before);
  });

  it("empty string deviceId is silently ignored", async () => {
    const before = safeGetTrustMultiplier("");
    await updateDeviceTrust("", 0.5);
    expect(safeGetTrustMultiplier("")).toBe(before);
  });

  it("never throws for any input combination", async () => {
    const weirdInputs: Array<[string, number]> = [
      ["",        NaN],
      ["server",  Infinity],
      ["unknown", -Infinity],
      ["device",  0],
    ];
    for (const [id, delta] of weirdInputs) {
      await expect(updateDeviceTrust(id, delta)).resolves.toBeUndefined();
    }
  });
});

// ─── 3. Regression protection ─────────────────────────────────────────────────

describe("Regression protection — baseline parity", () => {
  it(
    "new device (trust = 1.0) produces the same weight as the pre-trust baseline",
    async () => {
      const { venueId, deviceId } = nextIds();
      // Verify device is genuinely unknown (trust = 1.0)
      expect(safeGetTrustMultiplier(deviceId)).toBe(1.0);

      const signal = makeSignal(venueId, deviceId, "negative", 0.3);
      const delta  = computeWeightDelta(signal); // ≈ 0.24
      const node   = await upsertLocationNode(venueId, signal, delta);

      // Expected weight with trust = 1.0: 0.5 − delta × 1.0 = 0.5 − 0.24 = 0.26
      const expected = 0.5 - delta * 1.0;
      expect(node.weight_map["too_crowded"]).toBeCloseTo(expected, 5);
    },
  );

  it("trust multiplier = 1.0 leaves weight delta mathematically unchanged", async () => {
    const { venueId, deviceId } = nextIds();

    // Compute expected weight independently (no trust involved)
    const signal = makeSignal(venueId, deviceId, "negative", 0.3);
    const delta  = computeWeightDelta(signal);
    const expectedWeight = 0.5 - delta; // trust = 1.0 → ×1.0 = no change

    const node = await upsertLocationNode(venueId, signal, delta);
    expect(node.weight_map["too_crowded"]).toBeCloseTo(expectedWeight, 5);
  });
});

describe("Regression protection — failure fallback", () => {
  it("safeGetTrustMultiplier returns 1.0 for any unrecognised device", () => {
    // Simulates the trust registry being empty (e.g., after a server restart)
    // without needing to mock any internals.
    const unknownDevice = `never-seen-device-${Date.now()}`;
    expect(safeGetTrustMultiplier(unknownDevice)).toBe(1.0);
  });

  it("upsertLocationNode succeeds and returns a valid node when device has no trust record", async () => {
    const { venueId, deviceId } = nextIds();
    const signal = makeSignal(venueId, deviceId, "negative", 0.3);
    const delta  = computeWeightDelta(signal);

    // Device has no trust record → safeGetTrustMultiplier returns 1.0 internally
    const node = await upsertLocationNode(venueId, signal, delta);

    expect(node).toBeDefined();
    expect(node.venue_id).toBe(venueId);
    expect(node.signal_count).toBe(1);
    expect(Object.keys(node.weight_map).length).toBeGreaterThan(0);
  });
});

describe("Regression protection — no device ID", () => {
  it("upsertLocationNode succeeds when source_user_id is absent from signal", async () => {
    const { venueId } = nextIds();
    const signal = makeSignal(venueId, "");
    // Remove source_user_id to simulate a signal without device attribution
    const { source_user_id: _omitted, ...signalWithoutId } = signal as VibeSignal & {
      source_user_id?: string;
    };
    void _omitted;

    const delta = computeWeightDelta(signalWithoutId as VibeSignal);
    const node  = await upsertLocationNode(venueId, signalWithoutId as VibeSignal, delta);

    expect(node.signal_count).toBe(1);
    expect(node.weight_map["too_crowded"]).toBeCloseTo(0.5 - delta, 5);
  });

  it("safeGetTrustMultiplier with undefined never affects scoring (returns 1.0)", () => {
    const multiplier = safeGetTrustMultiplier(undefined);
    expect(multiplier).toBe(1.0);
    // Multiplying any delta by 1.0 is a no-op — scoring unchanged
    const anyDelta = 0.42;
    expect(anyDelta * multiplier).toBeCloseTo(anyDelta, 10);
  });
});

// ─── 4. Functional — trust changes scoring output ─────────────────────────────

describe("Functional — trust multiplier changes weight delta (MANDATORY)", () => {
  it("trust < 1.0 produces a SMALLER weight change than neutral trust", async () => {
    const venue_neutral  = nextIds();
    const venue_lowtrust = nextIds();

    const strength = 0.5; // larger to avoid clamping
    const sig_neutral  = makeSignal(venue_neutral.venueId,  venue_neutral.deviceId,  "negative", strength);
    const sig_lowtrust = makeSignal(venue_lowtrust.venueId, venue_lowtrust.deviceId, "negative", strength);

    // Establish trust = 0.8 for the low-trust device
    await updateDeviceTrust(venue_lowtrust.deviceId, -0.2); // 1.0 → 0.8
    expect(getTrustMultiplier(venue_lowtrust.deviceId)).toBeCloseTo(0.8, 5);

    const delta = computeWeightDelta(sig_neutral); // same delta used for both

    const [node_neutral, node_lowtrust] = await Promise.all([
      upsertLocationNode(venue_neutral.venueId,  sig_neutral,  delta),
      upsertLocationNode(venue_lowtrust.venueId, sig_lowtrust, delta),
    ]);

    const w_neutral  = node_neutral.weight_map["too_crowded"]!;
    const w_lowtrust = node_lowtrust.weight_map["too_crowded"]!;

    // Negative signal with lower trust → LESS negative impact → weight is HIGHER
    expect(w_lowtrust).toBeGreaterThan(w_neutral);

    // Exact values: neutral = 0.5 − delta × 1.0; low-trust = 0.5 − delta × 0.8
    const delta24 = delta;
    expect(w_neutral).toBeCloseTo(0.5 - delta24 * 1.0, 4);
    expect(w_lowtrust).toBeCloseTo(0.5 - delta24 * 0.8, 4);
  });

  it("trust > 1.0 produces a LARGER weight change than neutral trust", async () => {
    const venue_neutral   = nextIds();
    const venue_hightrust = nextIds();

    const strength = 0.3; // small enough not to saturate at either trust level
    const sig_neutral   = makeSignal(venue_neutral.venueId,   venue_neutral.deviceId,   "negative", strength);
    const sig_hightrust = makeSignal(venue_hightrust.venueId, venue_hightrust.deviceId, "negative", strength);

    // Establish trust = 1.3 for the high-trust device
    await updateDeviceTrust(venue_hightrust.deviceId, 0.3); // 1.0 → 1.3
    expect(getTrustMultiplier(venue_hightrust.deviceId)).toBeCloseTo(1.3, 5);

    const delta = computeWeightDelta(sig_neutral);

    const [node_neutral, node_hightrust] = await Promise.all([
      upsertLocationNode(venue_neutral.venueId,   sig_neutral,   delta),
      upsertLocationNode(venue_hightrust.venueId, sig_hightrust, delta),
    ]);

    const w_neutral   = node_neutral.weight_map["too_crowded"]!;
    const w_hightrust = node_hightrust.weight_map["too_crowded"]!;

    // Negative signal with higher trust → MORE negative impact → weight is LOWER
    expect(w_hightrust).toBeLessThan(w_neutral);

    expect(w_neutral).toBeCloseTo(0.5 - delta * 1.0, 4);
    expect(w_hightrust).toBeCloseTo(0.5 - delta * 1.3, 4);
  });
});

describe("Functional — alignment detection via upsertLocationNode", () => {
  it("aligned signal (same direction as venue trend) increases device trust", async () => {
    const setupDeviceId = `setup-${++_c}`;
    const { venueId, deviceId } = nextIds();

    // Phase 1: push the venue strongly positive using a separate setup device
    const setupSignal = makeSignal(venueId, setupDeviceId, "positive", 1.0);
    const setupDelta  = computeWeightDelta(setupSignal);
    await upsertLocationNode(venueId, setupSignal, setupDelta);
    // preMean for venue is now ≈ 0.9 (positive-leaning)

    // Phase 2: the test device applies an ALIGNED positive signal
    const trustBefore = safeGetTrustMultiplier(deviceId); // 1.0 (new device)
    expect(trustBefore).toBe(1.0);

    const alignedSignal = makeSignal(venueId, deviceId, "positive", 0.3);
    const delta = computeWeightDelta(alignedSignal);
    await upsertLocationNode(venueId, alignedSignal, delta);

    // Trust should have increased (aligned = positive signal on positive venue)
    const trustAfter = getTrustMultiplier(deviceId);
    expect(trustAfter).toBeGreaterThan(trustBefore);
    expect(trustAfter).toBeCloseTo(1.05, 5); // INITIAL_TRUST + 0.05
  });

  it("conflicting signal (opposite direction to venue trend) decreases device trust", async () => {
    const setupDeviceId = `setup-${++_c}`;
    const { venueId, deviceId } = nextIds();

    // Phase 1: push the venue strongly positive using a separate setup device
    const setupSignal = makeSignal(venueId, setupDeviceId, "positive", 1.0);
    const setupDelta  = computeWeightDelta(setupSignal);
    await upsertLocationNode(venueId, setupSignal, setupDelta);
    // preMean for venue is now ≈ 0.9 (positive-leaning)

    // Phase 2: the test device applies a CONFLICTING negative signal
    const trustBefore = safeGetTrustMultiplier(deviceId); // 1.0 (new device)
    expect(trustBefore).toBe(1.0);

    const conflictSignal = makeSignal(venueId, deviceId, "negative", 0.3);
    const delta = computeWeightDelta(conflictSignal);
    await upsertLocationNode(venueId, conflictSignal, delta);

    // Trust should have decreased (conflict = negative signal on positive venue)
    const trustAfter = getTrustMultiplier(deviceId);
    expect(trustAfter).toBeLessThan(trustBefore);
    expect(trustAfter).toBeCloseTo(0.95, 5); // INITIAL_TRUST − 0.05
  });

  it("first signal on a brand-new venue is always treated as aligned (neutral preMean)", async () => {
    const { venueId, deviceId } = nextIds();

    // Apply first-ever signal — venue has no prior history (preMean = 0.5)
    const signal = makeSignal(venueId, deviceId, "negative", 0.3);
    const delta  = computeWeightDelta(signal);
    await upsertLocationNode(venueId, signal, delta);

    // preMean was 0.5 (neutral) → negative signal: 0.5 <= 0.5 = true → aligned
    const trustAfter = getTrustMultiplier(deviceId);
    expect(trustAfter).toBeCloseTo(1.05, 5); // trust went UP, not down
  });
});

describe("Functional — trust clamping", () => {
  it("accumulating many aligned signals never exceeds MAX_TRUST (1.5)", async () => {
    const setupDeviceId = `setup-${++_c}`;
    const { venueId, deviceId } = nextIds();

    // Establish positive venue so all subsequent positive signals are aligned
    const setup = makeSignal(venueId, setupDeviceId, "positive", 1.0);
    await upsertLocationNode(venueId, setup, computeWeightDelta(setup));

    // Apply 100 aligned positive signals for the test device
    for (let i = 0; i < 100; i++) {
      const sig   = makeSignal(venueId, deviceId, "positive", 0.3);
      const delta = computeWeightDelta(sig);
      await upsertLocationNode(venueId, sig, delta);
    }

    expect(getTrustMultiplier(deviceId)).toBeLessThanOrEqual(MAX_TRUST);
    expect(getTrustMultiplier(deviceId)).toBe(MAX_TRUST);
  });

  it("repeated negative trust deltas clamp to MIN_TRUST (0.5) and never go below", async () => {
    // Tests the hard floor directly via updateDeviceTrust — the alignment
    // heuristic in upsertLocationNode shifts as venue weights evolve, so
    // the cleanest way to verify MIN_TRUST clamping is to drive it directly.
    const { deviceId } = nextIds();

    for (let i = 0; i < 100; i++) {
      await updateDeviceTrust(deviceId, -0.05);
    }

    expect(getTrustMultiplier(deviceId)).toBeGreaterThanOrEqual(MIN_TRUST);
    expect(getTrustMultiplier(deviceId)).toBe(MIN_TRUST);
  });
});
