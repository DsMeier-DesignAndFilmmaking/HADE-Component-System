/**
 * decision.behavior.test.ts
 *
 * Level 2 — Integration: signal POST always precedes decide POST
 * Level 3 — Behavioral: UGC signals change scoring output (MANDATORY P0 gate)
 * Level 4 — Failure mode: invalid IDs produce no LocationNode / no dead data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAdaptive } from "../hooks";
import { scoreOpportunity, buildContext } from "../engine";
import type { AgentPersona, DecideResponse, Opportunity } from "@/types/hade";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockGeo = { lat: 37.7749, lng: -122.4194 };

const mockPersona: AgentPersona = {
  id: "TestAgent",
  role: "Test persona for behavioral tests",
  tone: ["Concise"],
  guardrails: [],
  last_updated: new Date().toISOString(),
};

function makeDecideResponse(venueId = "venue-A"): DecideResponse {
  return {
    decision: {
      id: venueId,
      venue_name: `Venue ${venueId}`,
      category: "bar",
      geo: mockGeo,
      distance_meters: 300,
      eta_minutes: 5,
      rationale: "Good fit.",
      why_now: "Friday evening.",
      confidence: 0.8,
      situation_summary: "Evening on a weekday, solo.",
    },
    context_snapshot: {
      situation_summary: "Evening on a weekday.",
      interpreted_intent: "drink",
      decision_basis: "llm",
      candidates_evaluated: 5,
    },
    session_id: "sess-behavior-test",
  };
}

function makeSignalOkResponse(venueId = "venue-A"): Response {
  return new Response(
    JSON.stringify({
      accepted: 1,
      rejected: 0,
      signal_ids: ["vsig-1"],
      node_versions: { [venueId]: 2 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL 2 — Integration: signal POST occurs BEFORE decide POST
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration — signal ordering", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signal POST occurs before decide POST after pivot()", async () => {
    const callOrder: string[] = [];

    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/hade/signal")) {
        callOrder.push("signal");
        return Promise.resolve(makeSignalOkResponse("venue-A"));
      }
      if (url.includes("/api/hade/decide")) {
        callOrder.push("decide");
        return Promise.resolve(
          new Response(JSON.stringify(makeDecideResponse("venue-A")), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useAdaptive());

    // Set geo in context so pivot()'s internal decide() can read ctx.geo
    act(() => {
      result.current.setGeo(mockGeo);
    });

    // Step 1: Get an initial decision so pivot() has something to pivot from
    await act(async () => {
      await result.current.decide({ geo: mockGeo, persona: mockPersona });
    });

    // Reset tracking — only care about the pivot cycle
    callOrder.length = 0;

    // Step 2: Emit vibe signal
    act(() => {
      result.current.emitVibeSignal("venue-A", ["too_crowded"], "negative", 0.8);
    });

    // Step 3: Pivot — internally calls flushAsync() then decide()
    act(() => {
      result.current.pivot("not_this");
    });

    // Wait for both network calls to complete
    await waitFor(() => {
      expect(callOrder).toContain("decide");
    });

    // ASSERT: signal was first, decide was second
    expect(callOrder[0]).toBe("signal");
    expect(callOrder[1]).toBe("decide");
  });

  it("decide POST includes node_hints for the emitted venue", async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];

    const fetchSpy = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      if (url.includes("/api/hade/decide")) {
        capturedBodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
        return Promise.resolve(
          new Response(JSON.stringify(makeDecideResponse("venue-B")), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(makeSignalOkResponse("venue-A"));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useAdaptive());

    act(() => {
      result.current.setGeo(mockGeo);
    });

    // Get initial decision
    await act(async () => {
      await result.current.decide({ geo: mockGeo, persona: mockPersona });
    });
    capturedBodies.length = 0; // reset

    // Emit vibe signal for venue-A, then pivot
    act(() => {
      result.current.emitVibeSignal("venue-A", ["too_crowded"], "negative", 0.8);
    });

    act(() => {
      result.current.pivot("not_this");
    });

    await waitFor(() => {
      expect(capturedBodies.length).toBeGreaterThan(0);
    });

    const pivotDecideBody = capturedBodies[capturedBodies.length - 1] as {
      node_hints?: string[];
    };
    expect(pivotDecideBody.node_hints).toContain("venue-A");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL 3 — Behavioral: UGC changes scoring output (MANDATORY P0 gate)
// ─────────────────────────────────────────────────────────────────────────────

describe("Behavioral — UGC changes scoring output (MANDATORY)", () => {
  /**
   * scoreOpportunity(opp, ctx) = proximityScore * 0.4 + signalScore * 0.35 + intentScore * 0.25
   *
   * For two venues at identical distance and category:
   *   - The ONLY variable is trust_attributions[].edge_weight → signalScore
   *   - Neutral A: edge_weight 0.5  → signalScore = 0.5
   *   - Slightly better B: edge_weight 0.6 → signalScore = 0.6
   *   - A after too_crowded UGC: edge_weight 0.1 → signalScore = 0.1
   */

  const baseCtx = buildContext({
    geo: mockGeo,
    time_of_day: "evening",
    day_type: "weekday_evening",
    situation: { intent: "drink", urgency: "medium" },
    state: { energy: "medium", openness: "open" },
    social: { group_size: 1, group_type: "solo" },
  });

  const makeOpportunity = (edgeWeight: number, id = "v"): Opportunity => ({
    id,
    venue_name: `Venue ${id}`,
    category: "bar",
    distance_meters: 300,
    eta_minutes: 5,
    rationale: "",
    trust_attributions: [
      {
        user_id: "u1",
        display_name: "User",
        edge_weight: edgeWeight,
        time_ago: "1h ago",
      },
    ],
    geo: mockGeo,
    is_primary: false,
    event: null,
    primary_signal: null,
  });

  it("negative vibe signal decreases venue A score (P0 MANDATORY)", () => {
    const venueA_before = makeOpportunity(0.5, "A"); // neutral
    const venueA_after = makeOpportunity(0.1, "A");  // after too_crowded UGC
    const venueB = makeOpportunity(0.6, "B");        // slightly better baseline

    const scoreA_before = scoreOpportunity(venueA_before, baseCtx);
    const scoreA_after = scoreOpportunity(venueA_after, baseCtx);
    const scoreB = scoreOpportunity(venueB, baseCtx);

    // Baseline: B is the winner
    expect(scoreB).toBeGreaterThan(scoreA_before);

    // CRITICAL: UGC must make A's score decrease
    expect(scoreA_after).toBeLessThan(scoreA_before);

    // After UGC: B's dominance increases
    expect(scoreB).toBeGreaterThan(scoreA_after);

    // Quantify the gap to prove it's meaningful (not floating-point noise)
    const gapBefore = scoreB - scoreA_before;
    const gapAfter = scoreB - scoreA_after;
    expect(gapAfter).toBeGreaterThan(gapBefore);
  });

  it("score decrease magnitude matches signal weight × 0.35 (signal weight component)", () => {
    const venueA_before = makeOpportunity(0.5, "A");
    const venueA_after = makeOpportunity(0.1, "A");

    const scoreA_before = scoreOpportunity(venueA_before, baseCtx);
    const scoreA_after = scoreOpportunity(venueA_after, baseCtx);

    // Expected delta = (0.5 - 0.1) * signalWeight = 0.4 * 0.35 = 0.14
    const expectedDelta = (0.5 - 0.1) * 0.35;
    const actualDelta = scoreA_before - scoreA_after;
    expect(actualDelta).toBeCloseTo(expectedDelta, 5);
  });

  it("positive vibe signal increases venue score", () => {
    const venueBefore = makeOpportunity(0.5, "V");
    const venueAfter = makeOpportunity(0.9, "V"); // after hidden_gem/perfect_vibe UGC

    const scoreBefore = scoreOpportunity(venueBefore, baseCtx);
    const scoreAfter = scoreOpportunity(venueAfter, baseCtx);

    expect(scoreAfter).toBeGreaterThan(scoreBefore);
  });

  it("venue with no trust_attributions uses primary_signal strength as fallback", () => {
    const venueWithPrimary: Opportunity = {
      id: "VP",
      venue_name: "Venue VP",
      category: "bar",
      distance_meters: 300,
      eta_minutes: 5,
      rationale: "",
      trust_attributions: [], // empty — falls through to primary_signal
      geo: mockGeo,
      is_primary: true,
      event: null,
      primary_signal: { type: "PRESENCE", strength: 0.75, content: null },
    };

    const venueNeutral = makeOpportunity(0.5, "N");

    const scoreWithPrimary = scoreOpportunity(venueWithPrimary, baseCtx);
    const scoreNeutral = scoreOpportunity(venueNeutral, baseCtx);

    // primary_signal.strength = 0.75 > trust_attribution edge_weight = 0.5
    // so scoreWithPrimary's signal component should be higher
    expect(scoreWithPrimary).toBeGreaterThan(scoreNeutral);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL 4 — Failure mode: no dead data from invalid IDs
// ─────────────────────────────────────────────────────────────────────────────

describe("Failure mode — dead data rejection (no registry pollution)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupFetch = (captureDecide?: (b: Record<string, unknown>) => void) =>
    vi.fn().mockImplementation((url: string, init: RequestInit) => {
      if (url.includes("/api/hade/signal")) {
        return Promise.resolve(makeSignalOkResponse());
      }
      if (url.includes("/api/hade/decide")) {
        captureDecide?.(JSON.parse(init.body as string) as Record<string, unknown>);
        return Promise.resolve(
          new Response(JSON.stringify(makeDecideResponse("venue-real")), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

  it("fallback-* signal: node_hints absent in pivot decide POST", async () => {
    let pivotDecideBody: Record<string, unknown> | null = null;
    const fetchSpy = setupFetch((b) => {
      pivotDecideBody = b;
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useAdaptive());

    act(() => {
      result.current.setGeo(mockGeo);
    });

    // Get initial decision
    await act(async () => {
      await result.current.decide({ geo: mockGeo, persona: mockPersona });
    });
    pivotDecideBody = null; // reset after initial decide

    // Emit fallback ID signal then pivot
    act(() => {
      result.current.emitVibeSignal("fallback-abc123", ["too_crowded"], "negative", 0.8);
    });

    act(() => {
      result.current.pivot("not_this");
    });

    await waitFor(() => {
      expect(pivotDecideBody).not.toBeNull();
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect((pivotDecideBody! as { node_hints?: string[] }).node_hints).toBeUndefined();
  });

  it("offline-* signal: node_hints absent in pivot decide POST", async () => {
    let pivotDecideBody: Record<string, unknown> | null = null;
    const fetchSpy = setupFetch((b) => {
      pivotDecideBody = b;
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useAdaptive());

    act(() => {
      result.current.setGeo(mockGeo);
    });

    await act(async () => {
      await result.current.decide({ geo: mockGeo, persona: mockPersona });
    });
    pivotDecideBody = null;

    act(() => {
      result.current.emitVibeSignal("offline-xyz", ["skip_it"], "negative", 0.7);
    });

    act(() => {
      result.current.pivot("not_this");
    });

    await waitFor(() => {
      expect(pivotDecideBody).not.toBeNull();
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect((pivotDecideBody! as { node_hints?: string[] }).node_hints).toBeUndefined();
  });

  it("invalid ID does not appear in rejection_history", async () => {
    const fetchSpy = setupFetch();
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useAdaptive());

    act(() => {
      result.current.setGeo(mockGeo);
    });

    // Get initial decision for a real venue
    await act(async () => {
      await result.current.decide({ geo: mockGeo, persona: mockPersona });
    });

    // Emit signal for a fallback ID (does NOT add to pendingNodeHints)
    act(() => {
      result.current.emitVibeSignal("fallback-dead-data", ["too_crowded"], "negative", 0.8);
    });

    // Pivot records the current DECISION in rejection_history, not the signal venue
    act(() => {
      result.current.pivot("not_this");
    });

    await waitFor(() => {
      expect(result.current.context.rejection_history.length).toBeGreaterThan(0);
    });

    const rejectedIds = result.current.context.rejection_history.map((e) => e.venue_id);
    // The decision that was rejected is "venue-real" (from the mock), not "fallback-dead-data"
    expect(rejectedIds).not.toContain("fallback-dead-data");
    expect(rejectedIds).not.toContain("offline-xyz");

    // And no rejection entry should start with a synthetic prefix
    for (const id of rejectedIds) {
      expect(id).not.toMatch(/^(fallback-|offline-)/);
    }
  });

  it("multiple invalid IDs do not accumulate in node_hints across calls", async () => {
    const capturedNodeHints: Array<string[] | undefined> = [];
    const fetchSpy = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      if (url.includes("/api/hade/signal")) return Promise.resolve(makeSignalOkResponse());
      if (url.includes("/api/hade/decide")) {
        const body = JSON.parse(init.body as string) as { node_hints?: string[] };
        capturedNodeHints.push(body.node_hints);
        return Promise.resolve(
          new Response(JSON.stringify(makeDecideResponse("venue-real")), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useAdaptive());

    act(() => {
      result.current.setGeo(mockGeo);
    });

    await act(async () => {
      await result.current.decide({ geo: mockGeo, persona: mockPersona });
    });
    capturedNodeHints.length = 0;

    // Emit three invalid signals
    act(() => {
      result.current.emitVibeSignal("fallback-1", ["too_crowded"], "negative");
      result.current.emitVibeSignal("fallback-2", ["skip_it"], "negative");
      result.current.emitVibeSignal("offline-3", ["dead"], "negative");
    });

    act(() => {
      result.current.pivot("not_this");
    });

    await waitFor(() => {
      expect(capturedNodeHints.length).toBeGreaterThan(0);
    });

    const pivotBody = capturedNodeHints[capturedNodeHints.length - 1];
    // All three were invalid — node_hints must be absent
    expect(pivotBody).toBeUndefined();
  });
});
