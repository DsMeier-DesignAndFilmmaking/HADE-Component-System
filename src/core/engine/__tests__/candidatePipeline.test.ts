/**
 * Regression tests for the candidate pipeline.
 *
 * These tests specifically guard against the production regression where
 * valid Google Places data was silently dropped by the domain type-filter,
 * causing cold_start_fallback even when real venues were available.
 *
 * All server-only modules are mocked so these tests run in jsdom/vitest.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock server-only boundary before any imports ──────────────────────────────
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  serverEnv: { googleApiKey: "test-key-123456789", openAiApiKey: "", hadeUpstreamUrl: "" },
}));
vi.mock("@/lib/hade/redis", () => ({ getRedisMode: () => "FULL" }));
vi.mock("@/lib/hade/logging", () => ({
  hadeLog: () => {},
  roundGeo: (g: unknown) => g,
  safeError: (e: unknown) => e,
  sanitizeLogText: (t: unknown) => t,
}));
vi.mock("@/lib/hade/weights", () => ({
  getNodeTrustScore: async () => 0.5,
  getNodeVibeScore: async () => 0.5,
  getLocationWeights: async () => [],
  locationNodeExists: async () => false,
  createLocationNode: async () => null,
}));
vi.mock("@/lib/hade/ugc", () => ({ getNearbyUGC: async () => [] }));
vi.mock("@/lib/hade/ugcCopy", () => ({
  getDistanceCopy: () => "nearby",
  computeTemporalState: () => "active",
  getUGCCta: () => "Go now",
}));
vi.mock("@/lib/hade/confidence", () => ({ computeConfidence: () => 0.7 }));
vi.mock("@/lib/hade/explanation", () => ({ buildExplanation: () => [] }));

// ── Types used in tests ───────────────────────────────────────────────────────

import { toPlaceOption } from "@/core/services/places";
import type { GeoLocation } from "@/types/hade";

const TEST_GEO: GeoLocation = { lat: 37.7749, lng: -122.4194 };

// ── C: Google Places New displayName.text schema normalizes correctly ──────────

describe("toPlaceOption — test C: schema normalization", () => {
  it("handles New API shape: displayName = { text, languageCode }", () => {
    const raw = {
      id: "ChIJtest001",
      displayName: { text: "Golden Gate Bridge", languageCode: "en" },
      types: ["tourist_attraction", "landmark"],
      location: { latitude: 37.8199, longitude: -122.4783 },
    };
    const result = toPlaceOption(raw as any, TEST_GEO, false);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Golden Gate Bridge");
    expect(result!.id).toBe("ChIJtest001");
    expect(result!.geo.lat).toBeCloseTo(37.8199);
    expect(result!.geo.lng).toBeCloseTo(-122.4783);
  });

  it("handles edge case: displayName is a bare string", () => {
    const raw = {
      id: "ChIJtest002",
      displayName: "Alamo Square Park" as any,
      types: ["park"],
      location: { latitude: 37.776, longitude: -122.434 },
    };
    const result = toPlaceOption(raw as any, TEST_GEO, false);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Alamo Square Park");
  });

  it("handles legacy: name field as fallback when displayName absent", () => {
    const raw = {
      id: "ChIJtest003",
      name: "Fisherman's Wharf",
      types: ["tourist_attraction"],
      location: { latitude: 37.808, longitude: -122.418 },
    };
    const result = toPlaceOption(raw as any, TEST_GEO, false);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Fisherman's Wharf");
  });

  it("returns null when id is missing", () => {
    const raw = {
      displayName: { text: "No ID Place" },
      types: ["restaurant"],
      location: { latitude: 37.77, longitude: -122.42 },
    };
    expect(toPlaceOption(raw as any, TEST_GEO, false)).toBeNull();
  });

  it("returns null when location is missing", () => {
    const raw = {
      id: "ChIJtest004",
      displayName: { text: "No Location" },
      types: ["restaurant"],
    };
    expect(toPlaceOption(raw as any, TEST_GEO, false)).toBeNull();
  });

  it("returns null when displayName AND name are both missing", () => {
    const raw = {
      id: "ChIJtest005",
      types: ["restaurant"],
      location: { latitude: 37.77, longitude: -122.42 },
    };
    expect(toPlaceOption(raw as any, TEST_GEO, false)).toBeNull();
  });
});

// ── D: Valid lat/lng candidates are not rejected ───────────────────────────────

describe("toPlaceOption — test D: valid geo is preserved", () => {
  it("passes through finite lat/lng coordinates", () => {
    const raw = {
      id: "ChIJtest010",
      displayName: { text: "Valid Place" },
      types: ["restaurant"],
      location: { latitude: 48.8566, longitude: 2.3522 },
    };
    const result = toPlaceOption(raw as any, { lat: 48.85, lng: 2.35 }, false);
    expect(result).not.toBeNull();
    expect(result!.geo.lat).toBeCloseTo(48.8566);
    expect(result!.geo.lng).toBeCloseTo(2.3522);
  });

  it("does not reject place based on optional fields being absent", () => {
    const raw = {
      id: "ChIJtest011",
      displayName: { text: "Minimal Valid Place" },
      types: ["cafe"],
      location: { latitude: 37.7749, longitude: -122.4194 },
      // No rating, no priceLevel, no shortFormattedAddress, no currentOpeningHours
    };
    const result = toPlaceOption(raw as any, TEST_GEO, false);
    expect(result).not.toBeNull();
    expect(result!.rating).toBeUndefined();
    expect(result!.price_level).toBeUndefined();
    expect(result!.address).toBeUndefined();
  });

  it("computes distance_meters using haversine (non-zero for different coords)", () => {
    const raw = {
      id: "ChIJtest012",
      displayName: { text: "Far Place" },
      types: ["restaurant"],
      location: { latitude: 37.9, longitude: -122.5 },
    };
    const result = toPlaceOption(raw as any, TEST_GEO, false);
    expect(result).not.toBeNull();
    expect(result!.distance_meters).toBeGreaterThan(0);
  });
});

// ── F: Production-style: 3 places → real venue_id, not fallback-static ────────

// Module-level mocks with mutable implementations — avoids vi.doMock cache issues.
const mockFetchMultiQueryGrounded = vi.fn();
const mockFetchNearbyGrounded = vi.fn();

vi.mock("@/core/services/places", async () => {
  const actual = await vi.importActual<typeof import("@/core/services/places")>("@/core/services/places");
  return {
    ...actual,
    fetchMultiQueryGrounded: (...args: unknown[]) => mockFetchMultiQueryGrounded(...args),
    fetchNearbyGrounded: (...args: unknown[]) => mockFetchNearbyGrounded(...args),
  };
});

describe("generateSyntheticDecision — test F: 3 places → real decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchNearbyGrounded.mockResolvedValue([]);
  });

  it("returns ok=true with a real venue_id when 3 valid travel Places are available", async () => {
    mockFetchMultiQueryGrounded.mockResolvedValue([
      { id: "real-place-001", name: "Golden Gate Bridge", category: "venue", vibe: "iconic", geo: { lat: 37.82, lng: -122.48 }, distance_meters: 5000, is_open: true, types: ["tourist_attraction", "landmark"] },
      { id: "real-place-002", name: "Alcatraz Island", category: "venue", vibe: "historic", geo: { lat: 37.83, lng: -122.42 }, distance_meters: 7000, is_open: true, types: ["tourist_attraction", "museum"] },
      { id: "real-place-003", name: "Fisherman's Wharf", category: "venue", vibe: "lively", geo: { lat: 37.81, lng: -122.41 }, distance_meters: 4500, is_open: true, types: ["tourist_attraction"] },
    ]);

    const { generateSyntheticDecision } = await import("@/core/engine/synthetic");
    const body = {
      mode: "travel",
      geo: { lat: 37.7749, lng: -122.4194 },
      geo_source: "browser",
      settings: { debug: false },
    };
    const result = await generateSyntheticDecision(body, "test-req-001", { lat: 37.7749, lng: -122.4194 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.decision.id).not.toMatch(/^fallback-static/);
      expect(result.data.decision.id).not.toMatch(/^offline-/);
      expect(result.data.decision.venue_name).toBeTruthy();
    }
  });

  it("returns ok=true for restaurants when domain filter drops them (last-resort path)", async () => {
    // Restaurants don't match travel whitelist → triggers last-resort bypass
    mockFetchMultiQueryGrounded.mockResolvedValue([
      { id: "restaurant-001", name: "Boudin Bakery", category: "restaurant", vibe: "cozy", geo: { lat: 37.81, lng: -122.41 }, distance_meters: 500, is_open: true, types: ["restaurant", "food", "establishment"] },
      { id: "restaurant-002", name: "In-N-Out Burger", category: "restaurant", vibe: "casual", geo: { lat: 37.80, lng: -122.40 }, distance_meters: 600, is_open: true, types: ["restaurant", "fast_food_restaurant"] },
      { id: "cafe-001", name: "Blue Bottle Coffee", category: "cafe", vibe: "artsy", geo: { lat: 37.79, lng: -122.39 }, distance_meters: 700, is_open: true, types: ["cafe", "coffee_shop"] },
    ]);

    const { generateSyntheticDecision } = await import("@/core/engine/synthetic");
    const body = {
      mode: "travel",
      geo: { lat: 37.7749, lng: -122.4194 },
      geo_source: "browser",
      settings: { debug: false },
    };
    const result = await generateSyntheticDecision(body, "test-req-002", { lat: 37.7749, lng: -122.4194 });

    // Last-resort bypass: restaurants are not blacklisted → survive → real decision
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.decision.id).not.toMatch(/^fallback-static/);
    }
  });

  it("returns ok=false only when Places returns empty AND UGC is empty", async () => {
    mockFetchMultiQueryGrounded.mockResolvedValue([]);

    const { generateSyntheticDecision } = await import("@/core/engine/synthetic");
    const body = {
      mode: "travel",
      geo: { lat: 37.7749, lng: -122.4194 },
      geo_source: "browser",
      settings: { debug: false },
    };
    const result = await generateSyntheticDecision(body, "test-req-003", { lat: 37.7749, lng: -122.4194 });
    expect(result.ok).toBe(false);
  });
});
