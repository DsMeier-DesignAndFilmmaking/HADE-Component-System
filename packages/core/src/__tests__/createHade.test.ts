import { describe, expect, it, beforeEach } from "vitest";
import { createHade } from "../createHade.js";
import { staticGeo } from "../adapters/geo/staticGeo.js";
import { emptyVenues } from "../adapters/defaults/emptyVenues.js";
import { resetAdapterRegistryForTests, createVenueAdapter } from "../adapters/registry.js";
import type { VenueCandidate } from "../types/adapters.js";

const FIXTURE_CANDIDATE: VenueCandidate = {
  id: "hart-bar",
  name: "Hart's",
  category: "wine_bar",
  vibe: "warm",
  geo: { lat: 40.6818, lng: -73.9591 },
  distance_meters: 420,
  is_open: true,
  address: "457 Nostrand Ave, Brooklyn, NY",
};

function mockVenue(candidates: VenueCandidate[] = [FIXTURE_CANDIDATE]) {
  return createVenueAdapter({
    id: "mock_venue",
    searchNearby: async () => candidates,
    searchMultiQuery: async () => candidates,
    searchForContext: async () => candidates,
  });
}

describe("createHade", () => {
  beforeEach(() => resetAdapterRegistryForTests());

  it("constructs with no args and returns a working client", async () => {
    const client = createHade();
    expect(client.adapters.venue.id).toBe("empty_venues@1.0.0");
    expect(client.adapters.llm?.id).toBe("noop_llm@1.0.0");
    expect(client.adapters.cache?.id).toBe("memory_cache@1.0.0");
    expect(client.adapters.geo?.id).toBe("static@1.0.0");
    expect(client.getConfig().defaults.radius_meters).toBe(800);
    expect(client.getConfig().defaults.locale).toBe("en-US");
    expect(client.getConfig().config_hash).toMatch(/^fnv:/);
  });

  it("decide returns a fallback DecisionEngineOutput when venue is empty", async () => {
    const client = createHade();
    const out = await client.decide({ geo: { lat: 40.68, lng: -73.96 } });
    expect(out.output_version).toBe("1.0");
    expect(out.is_fallback).toBe(true);
    expect(out.decision.venue_name).toBe("Take a walk nearby");
    expect(out.fallback_meta?.reason).toBe("no_signal");
  });

  it("decide returns a real candidate when the venue adapter has results", async () => {
    const client = createHade({
      adapters: {
        venue: mockVenue(),
        geo: staticGeo({ coords: { lat: 40.68, lng: -73.96 } }),
      },
    });
    const out = await client.decide({ geo: { lat: 40.68, lng: -73.96 } });
    expect(out.is_fallback).toBe(false);
    expect(out.decision.id).toBe("hart-bar");
    expect(out.decision.venue_name).toBe("Hart's");
    expect(out.decision.distance_meters).toBe(420);
    expect(out.decision.eta_minutes).toBeGreaterThan(0);
  });

  it("decide resolves geo via the GeoAdapter when not provided in input", async () => {
    const client = createHade({
      adapters: {
        venue: mockVenue(),
        geo: staticGeo({ coords: { lat: 1, lng: 2 } }),
      },
    });
    const out = await client.decide({});
    expect(out.is_fallback).toBe(false);
    expect(out.decision.id).toBe("hart-bar");
  });

  it("decide degrades to fallback when venue adapter throws (callAdapter catches)", async () => {
    const explodingVenue = createVenueAdapter({
      id: "kaboom",
      searchNearby: async () => {
        throw new Error("upstream down");
      },
      searchMultiQuery: async () => [],
      searchForContext: async () => {
        throw new Error("upstream down");
      },
    });
    const client = createHade({
      adapters: { venue: explodingVenue, geo: staticGeo({ coords: { lat: 0, lng: 0 } }) },
    });
    const out = await client.decide({});
    expect(out.is_fallback).toBe(true);
    expect(out.fallback_meta?.reason).toBe("places_timeout");
  });

  it("decide honors caller-supplied requestId in options", async () => {
    const client = createHade({ adapters: { venue: emptyVenues() } });
    const out = await client.decide({}, { requestId: "req_custom_123" });
    expect(out.request_id).toBe("req_custom_123");
  });

  it("refine re-runs decide with merged input", async () => {
    const client = createHade({
      adapters: {
        venue: mockVenue(),
        geo: staticGeo({ coords: { lat: 0, lng: 0 } }),
      },
    });
    const first = await client.decide({});
    const second = await client.refine({ intent: "drink" }, first);
    expect(second.decision.venue_name).toBe("Hart's");
    expect(second.request_id).not.toBe(first.request_id);
  });

  it("refine accepts tone shorthand without throwing", async () => {
    const client = createHade({
      adapters: { venue: mockVenue(), geo: staticGeo({ coords: { lat: 0, lng: 0 } }) },
    });
    await expect(client.refine("closer")).resolves.toMatchObject({ output_version: "1.0" });
    await expect(client.refine({ tone: "faster" })).resolves.toMatchObject({ output_version: "1.0" });
  });

  it("close is safe to call repeatedly", async () => {
    const client = createHade();
    await expect(client.close()).resolves.toBeUndefined();
    await expect(client.close()).resolves.toBeUndefined();
  });

  it("getConfig returns the same snapshot reference across calls", () => {
    const client = createHade({ clientId: "test-client" });
    expect(client.getConfig().clientId).toBe("test-client");
    expect(client.getConfig()).toBe(client.getConfig());
  });
});
