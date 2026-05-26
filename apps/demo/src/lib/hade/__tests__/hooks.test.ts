import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAdaptive } from "../hooks";
import type { AgentPersona, DecideResponse } from "@/types/hade";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockGeo = { lat: 37.7749, lng: -122.4194 };

const mockPersona: AgentPersona = {
  id: "TestAgent",
  role: "Test persona for unit tests",
  tone: ["Concise"],
  guardrails: [],
  last_updated: new Date().toISOString(),
};

function makeDecideResponse(venueId = "venue-real"): DecideResponse {
  return {
    decision: {
      id: venueId,
      venue_name: "Test Venue",
      category: "bar",
      geo: mockGeo,
      distance_meters: 300,
      eta_minutes: 5,
      rationale: "Good fit.",
      why_now: "Friday evening.",
      why_this: "Open tonight and a 5-min walk.",
      decision_frame: "Solid pick for this evening — easy and close.",
      confidence: 0.85,
      confidence_label: "Strong pick",
      situation_summary: "Evening on a weekday, solo, medium energy.",
    },
    context_snapshot: {
      situation_summary: "Evening on a weekday.",
      interpreted_intent: "drink",
      decision_basis: "llm",
      candidates_evaluated: 5,
    },
    session_id: "sess-test-123",
  };
}

function makeSignalOkResponse(): Response {
  return new Response(
    JSON.stringify({ accepted: 1, rejected: 0, signal_ids: ["s1"], node_versions: {} }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function findDecideCall(
  calls: ReturnType<typeof vi.fn>["mock"]["calls"],
): [string, RequestInit] | undefined {
  return calls.find((args) => (args[0] as string).includes("/api/hade/decide")) as
    | [string, RequestInit]
    | undefined;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useAdaptive — emitVibeSignal fallback ID rejection", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/hade/signal")) return Promise.resolve(makeSignalOkResponse());
      if (url.includes("/api/hade/decide")) {
        return Promise.resolve(
          new Response(JSON.stringify(makeDecideResponse()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects fallback-* venue ID from pendingNodeHints — node_hints absent in decide POST", async () => {
    const { result } = renderHook(() => useAdaptive());

    act(() => {
      result.current.emitVibeSignal("fallback-123", ["too_crowded"], "negative", 0.8);
    });

    await act(async () => {
      await result.current.decide({ geo: mockGeo, persona: mockPersona });
    });

    const decideCall = findDecideCall(fetchSpy.mock.calls);
    expect(decideCall).toBeDefined();
    const body = JSON.parse(decideCall![1].body as string) as { node_hints?: string[] };
    expect(body.node_hints).toBeUndefined();
  });

  it("rejects offline-* venue ID from pendingNodeHints — node_hints absent in decide POST", async () => {
    const { result } = renderHook(() => useAdaptive());

    act(() => {
      result.current.emitVibeSignal("offline-xyz", ["skip_it"], "negative", 0.7);
    });

    await act(async () => {
      await result.current.decide({ geo: mockGeo, persona: mockPersona });
    });

    const decideCall = findDecideCall(fetchSpy.mock.calls);
    expect(decideCall).toBeDefined();
    const body = JSON.parse(decideCall![1].body as string) as { node_hints?: string[] };
    expect(body.node_hints).toBeUndefined();
  });

  it("accepts a real venue ID in pendingNodeHints — node_hints present in decide POST", async () => {
    const realVenueId = "ChIJN1t_tDeuEmsRUsoyG83frY4";
    const { result } = renderHook(() => useAdaptive());

    act(() => {
      result.current.emitVibeSignal(realVenueId, ["perfect_vibe"], "positive", 0.9);
    });

    await act(async () => {
      await result.current.decide({ geo: mockGeo, persona: mockPersona });
    });

    const decideCall = findDecideCall(fetchSpy.mock.calls);
    expect(decideCall).toBeDefined();
    const body = JSON.parse(decideCall![1].body as string) as { node_hints?: string[] };
    expect(body.node_hints).toContain(realVenueId);
  });
});

describe("useAdaptive — decision request timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aborts a slow decide request and surfaces a degraded local decision", async () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const fetchSpy = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/hade/signal")) return Promise.resolve(makeSignalOkResponse());
      if (url.includes("/api/hade/decide")) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useAdaptive());
    let decidePromise!: Promise<void>;

    act(() => {
      decidePromise = result.current.decide({ geo: mockGeo, persona: mockPersona });
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
      await decidePromise;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isDegraded).toBe(true);
    expect(result.current.response?.decision).toBeTruthy();
    expect(result.current.response?.decision.is_fallback).toBe(true);
    expect(result.current.response?.source).toBe("static_fallback");
    expect(result.current.response?.context_snapshot.decision_basis).toBe("fallback");

    expect(logSpy).toHaveBeenCalledWith(
      "[HADE FRONTEND] decision_request_started",
      expect.objectContaining({ timeout_ms: 7_000 }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[HADE FRONTEND] decision_request_timeout",
      expect.objectContaining({ timeout_ms: 7_000 }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      "[HADE FRONTEND] degraded_decision_used",
      expect.objectContaining({ reason: "decision_request_timeout" }),
    );
  });
});
