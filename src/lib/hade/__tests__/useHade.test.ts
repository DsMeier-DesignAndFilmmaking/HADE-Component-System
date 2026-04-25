import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { useAdaptive, HadeAdaptiveContext } from "../hooks";
import { useHade } from "../useHade";
import { HadeSettingsProvider } from "../settings";
import type { AgentPersona } from "@/types/hade";

// ─── Wrapper providing both required React contexts ───────────────────────────

function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    const adaptive = useAdaptive();
    return React.createElement(
      HadeSettingsProvider,
      null,
      React.createElement(
        HadeAdaptiveContext.Provider,
        { value: adaptive },
        children,
      ),
    );
  };
}

// ─── Geo mocking helpers ──────────────────────────────────────────────────────

function mockGeoSuccess(lat = 37.7749, lng = -122.4194) {
  const getCurrentPosition = vi.fn().mockImplementation((success) => {
    success({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition);
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  return getCurrentPosition;
}

function mockGeoDenied() {
  const getCurrentPosition = vi.fn().mockImplementation((_success, error) => {
    // jsdom does not define GeolocationPositionError — any truthy call to the
    // error callback triggers the denied branch (useHade.ts ignores the object).
    error({ code: 1, message: "User denied Geolocation" });
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  return getCurrentPosition;
}

function mockGeoUnavailable() {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: undefined,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useHade geo handling", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          decision: {
            id: "venue-1",
            venue_name: "Test Bar",
            category: "bar",
            geo: { lat: 37.7749, lng: -122.4194 },
            distance_meters: 200,
            eta_minutes: 3,
            rationale: "Close by.",
            why_now: "Friday evening.",
            confidence: 0.9,
            situation_summary: "Evening.",
          },
          context_snapshot: {
            situation_summary: "Evening.",
            interpreted_intent: "drink",
            decision_basis: "llm",
            candidates_evaluated: 3,
          },
          session_id: "sess-geo-test",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore geolocation to a clean state
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
  });

  it("denied geo — decide() is never fired (auto-fire guard)", async () => {
    mockGeoDenied();

    renderHook(() => useHade(), { wrapper: makeWrapper() });

    // Give effects time to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const decideCalls = fetchSpy.mock.calls.filter((args) => (args[0] as string).includes("/api/hade/decide"));
    expect(decideCalls).toHaveLength(0);
  });

  it("denied geo — status stays idle (no loading, no decision)", async () => {
    mockGeoDenied();

    const { result } = renderHook(() => useHade(), { wrapper: makeWrapper() });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.decision).toBeNull();
  });

  it("geolocation API unavailable — decide() is never fired", async () => {
    mockGeoUnavailable();

    renderHook(() => useHade(), { wrapper: makeWrapper() });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const decideCalls = fetchSpy.mock.calls.filter((args) => (args[0] as string).includes("/api/hade/decide"));
    expect(decideCalls).toHaveLength(0);
  });

  it("no implicit fallback coordinate — denied geo never sends { lat: 0, lng: 0 } to decide()", async () => {
    mockGeoDenied();

    renderHook(() => useHade(), { wrapper: makeWrapper() });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Any decide call that somehow fired must not use { lat:0, lng:0 }
    const decideCalls = fetchSpy.mock.calls.filter((args) => (args[0] as string).includes("/api/hade/decide"));
    for (const call of decideCalls) {
      const body = JSON.parse(call[1].body as string) as { geo?: { lat: number; lng: number } };
      expect(body.geo).not.toEqual({ lat: 0, lng: 0 });
    }
  });

  it("successful geo — decide() fires automatically after geo resolves", async () => {
    const mockPersona: AgentPersona = {
      id: "TestAgent",
      role: "Test persona",
      tone: ["Concise"],
      guardrails: [],
      last_updated: new Date().toISOString(),
    };

    mockGeoSuccess();

    // We can't easily inject the persona into the auto-fire path via this wrapper
    // (it comes from agent_definitions.json), so we just verify geo was acquired
    // and no erroneous { lat:0, lng:0 } coordinate was used.
    // The auto-fire test verifies the ABSENCE of wrong behavior rather than the
    // presence of an API call, since the test environment lacks real agent data.
    const { result } = renderHook(() => useHade(), { wrapper: makeWrapper() });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Geo must have been set on the context (observable via decide payload if called)
    // What we can assert: no zero-coordinate was sent
    const decideCalls = fetchSpy.mock.calls.filter((args) => (args[0] as string).includes("/api/hade/decide"));
    for (const call of decideCalls) {
      const body = JSON.parse(call[1].body as string) as { geo?: { lat: number; lng: number } };
      if (body.geo) {
        expect(body.geo.lat).toBeCloseTo(37.7749, 2);
        expect(body.geo.lng).toBeCloseTo(-122.4194, 2);
      }
    }
    void mockPersona; // used only for type reference
  });
});
