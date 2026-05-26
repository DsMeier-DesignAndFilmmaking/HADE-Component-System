import { describe, expect, it, beforeEach } from "vitest";
import {
  createVenueAdapter,
  getVenueAdapter,
  registerDefaultAdapters,
  resetAdapterRegistryForTests,
  resolveAdapters,
  setDefaultVenueAdapterFactory,
} from "../registry.js";
import type { VenueCandidate } from "../../types/adapters.js";

const FIXTURE: VenueCandidate[] = [
  {
    id: "venue-1",
    name: "Test Cafe",
    category: "cafe",
    vibe: "cozy",
    geo: { lat: 1, lng: 2 },
    distance_meters: 100,
    is_open: true,
  },
];

function mockVenueAdapter(id = "mock") {
  return createVenueAdapter({
    id,
    searchNearby: async () => FIXTURE,
    searchMultiQuery: async () => FIXTURE,
    searchForContext: async () => FIXTURE,
  });
}

describe("adapter registry", () => {
  beforeEach(() => {
    resetAdapterRegistryForTests();
  });

  it("throws when no venue adapter is registered", () => {
    expect(() => resolveAdapters()).toThrow(/No VenueAdapter registered/);
  });

  it("resolves explicitly registered defaults", () => {
    const venue = mockVenueAdapter("registered");
    registerDefaultAdapters({ venue });
    expect(resolveAdapters().venue.id).toBe("registered");
    expect(getVenueAdapter()).toBe(venue);
  });

  it("resolves lazy factory defaults", async () => {
    const venue = mockVenueAdapter("factory");
    setDefaultVenueAdapterFactory(() => venue);
    const resolved = resolveAdapters().venue;
    expect(resolved.id).toBe("factory");
    const results = await resolved.searchNearby({ geo: { lat: 0, lng: 0 } });
    expect(results).toEqual(FIXTURE);
  });

  it("caches factory instance across resolve calls", () => {
    let calls = 0;
    setDefaultVenueAdapterFactory(() => {
      calls += 1;
      return mockVenueAdapter("cached");
    });
    resolveAdapters();
    resolveAdapters();
    expect(calls).toBe(1);
  });

  it("override wins over registered defaults", () => {
    registerDefaultAdapters({ venue: mockVenueAdapter("default") });
    const override = mockVenueAdapter("override");
    expect(resolveAdapters({ venue: override }).venue.id).toBe("override");
  });
});
