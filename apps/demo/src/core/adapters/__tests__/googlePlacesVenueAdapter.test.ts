import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  createGooglePlacesVenueAdapter,
  GOOGLE_PLACES_VENUE_ADAPTER_ID,
} from "../googlePlacesVenueAdapter";

describe("createGooglePlacesVenueAdapter", () => {
  it("delegates searchNearby to injected implementation", async () => {
    const searchNearby = vi.fn().mockResolvedValue([
      {
        id: "p1",
        name: "Venue",
        category: "cafe",
        vibe: "cozy",
        geo: { lat: 37.77, lng: -122.42 },
        distance_meters: 200,
        is_open: true,
      },
    ]);

    const adapter = createGooglePlacesVenueAdapter({ searchNearby });
    const results = await adapter.searchNearby({
      geo: { lat: 37.77, lng: -122.42 },
      radius_meters: 500,
      open_now: true,
    });

    expect(adapter.id).toBe(GOOGLE_PLACES_VENUE_ADAPTER_ID);
    expect(searchNearby).toHaveBeenCalledWith({
      geo: { lat: 37.77, lng: -122.42 },
      radius_meters: 500,
      open_now: true,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Venue");
  });

  it("searchForContext returns [] when geo is missing", async () => {
    const searchNearby = vi.fn();
    const adapter = createGooglePlacesVenueAdapter({ searchNearby });
    const results = await adapter.searchForContext({ geo: null }, ["cafe"]);
    expect(results).toEqual([]);
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it("searchForContext maps context fields to searchNearby", async () => {
    const searchNearby = vi.fn().mockResolvedValue([]);
    const adapter = createGooglePlacesVenueAdapter({ searchNearby });

    await adapter.searchForContext(
      {
        geo: { lat: 40.7, lng: -74.0 },
        radius_meters: 1200,
        situation: { intent: "eat" },
      },
      ["restaurant", "cafe"],
    );

    expect(searchNearby).toHaveBeenCalledWith({
      geo: { lat: 40.7, lng: -74.0 },
      intent: "eat",
      target_categories: ["restaurant", "cafe"],
      radius_meters: 1200,
      open_now: true,
    });
  });

  it("delegates searchMultiQuery to injected implementation", async () => {
    const searchMultiQuery = vi.fn().mockResolvedValue([]);
    const adapter = createGooglePlacesVenueAdapter({ searchMultiQuery });

    await adapter.searchMultiQuery({
      geo: { lat: 1, lng: 2 },
      categoryBuckets: [["cafe"], ["bar"]],
      radius_meters: 2500,
      open_now: false,
    });

    expect(searchMultiQuery).toHaveBeenCalledWith({
      geo: { lat: 1, lng: 2 },
      categoryBuckets: [["cafe"], ["bar"]],
      radius_meters: 2500,
      open_now: false,
    });
  });
});
