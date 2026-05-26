/**
 * Regression tests for geo_source propagation through the HADE pipeline.
 *
 * Root cause that was fixed: buildContext() in engine.ts did not include
 * geo_source in its return, silently dropping it. Every updateContext({ geo_source })
 * call was a no-op — ctx.geo_source was always undefined, so the decide() POST
 * body omitted the field, and the backend defaulted to "unknown", skipping Places.
 */

import { describe, it, expect } from "vitest";
import { buildContext } from "../engine";

// ── buildContext: geo_source must survive the builder ─────────────────────────

describe("buildContext — geo_source preservation (regression)", () => {
  it("preserves geo_source='browser'", () => {
    const ctx = buildContext({
      geo: { lat: 37.7749, lng: -122.4194 },
      geo_source: "browser",
    });
    expect(ctx.geo_source).toBe("browser");
  });

  it("preserves geo_source='ip'", () => {
    const ctx = buildContext({ geo_source: "ip" });
    expect(ctx.geo_source).toBe("ip");
  });

  it("preserves geo_source='stored'", () => {
    const ctx = buildContext({ geo_source: "stored" });
    expect(ctx.geo_source).toBe("stored");
  });

  it("preserves geo_source='scenario'", () => {
    const ctx = buildContext({ geo_source: "scenario" });
    expect(ctx.geo_source).toBe("scenario");
  });

  it("preserves geo_source='unknown'", () => {
    const ctx = buildContext({ geo_source: "unknown" });
    expect(ctx.geo_source).toBe("unknown");
  });

  it("returns undefined geo_source when not provided", () => {
    const ctx = buildContext({ geo: { lat: 37.7749, lng: -122.4194 } });
    expect(ctx.geo_source).toBeUndefined();
  });

  it("round-trips through update — geo_source not lost after sequential buildContext calls", () => {
    const initial = buildContext({ geo: { lat: 37.7749, lng: -122.4194 } });
    // Simulate updateContext({ geo_source: "browser" }) — which does buildContext({...prev, geo_source})
    const updated = buildContext({ ...initial, geo_source: "browser" });
    expect(updated.geo_source).toBe("browser");
    // Simulate a second updateContext call that does NOT mention geo_source
    const again = buildContext({ ...updated, situation: { intent: "eat", urgency: "medium" } });
    expect(again.geo_source).toBe("browser");
  });
});

// ── extractGeoSource path coverage (pure logic mirror of route.ts) ────────────
// extractGeoSource is private to route.ts; these tests mirror its logic using
// the same lookup precedence: geo_source → geo.source → context.geo_source

const VALID = new Set(["browser", "ip", "stored", "scenario"]);

function extractGeoSourceMirror(
  body: Record<string, unknown> | null | undefined,
): string {
  if (!body) return "unknown";
  const b = body as {
    geo_source?: unknown;
    geo?: { source?: unknown };
    context?: { geo_source?: unknown };
  };
  const raw = b.geo_source ?? b.geo?.source ?? b.context?.geo_source;
  return VALID.has(raw as string) ? (raw as string) : "unknown";
}

describe("extractGeoSource — field path coverage", () => {
  it("reads top-level geo_source='browser'", () => {
    expect(extractGeoSourceMirror({ geo_source: "browser" })).toBe("browser");
  });

  it("reads nested geo.source='browser' when top-level absent", () => {
    expect(extractGeoSourceMirror({ geo: { source: "browser" } })).toBe("browser");
  });

  it("reads context.geo_source='browser' as last resort", () => {
    expect(extractGeoSourceMirror({ context: { geo_source: "browser" } })).toBe("browser");
  });

  it("prefers top-level over nested alternatives", () => {
    expect(
      extractGeoSourceMirror({ geo_source: "ip", geo: { source: "browser" } }),
    ).toBe("ip");
  });

  it("returns 'unknown' when field is absent", () => {
    expect(extractGeoSourceMirror({})).toBe("unknown");
  });

  it("returns 'unknown' for null body", () => {
    expect(extractGeoSourceMirror(null)).toBe("unknown");
  });

  it("returns 'unknown' for an unrecognized value", () => {
    expect(extractGeoSourceMirror({ geo_source: "gps" })).toBe("unknown");
  });

  it("cold-start Places guard does NOT skip when geo_source='browser'", () => {
    const geoSource = extractGeoSourceMirror({ geo_source: "browser" });
    // The guard in generateDecision: if (geoHint && geoSource !== "unknown")
    const hasGeoHint = true;
    const wouldAttemptPlaces = hasGeoHint && geoSource !== "unknown";
    expect(wouldAttemptPlaces).toBe(true);
  });

  it("cold-start Places guard DOES skip when geo_source is missing (old regression)", () => {
    const geoSource = extractGeoSourceMirror({});
    const hasGeoHint = true;
    const wouldAttemptPlaces = hasGeoHint && geoSource !== "unknown";
    expect(wouldAttemptPlaces).toBe(false);
  });
});
