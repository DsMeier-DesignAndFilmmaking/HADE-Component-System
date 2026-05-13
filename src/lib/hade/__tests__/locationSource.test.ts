import { describe, expect, it } from "vitest";
import type { UGCEntity } from "@/types/hade";
import {
  getMapboxToken,
  isMapboxEnabled,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
} from "../mapboxConfig";

describe("UGCEntity.location_source — map_pin support", () => {
  it("accepts \"map_pin\" as a valid location_source literal", () => {
    const entity: UGCEntity = {
      id: "ugc_test",
      venue_name: "Bench by the south entrance",
      category: "social",
      created_at: new Date().toISOString(),
      geo: { lat: 39.7392, lng: -104.9903 },
      location_source: "map_pin",
    };
    expect(entity.location_source).toBe("map_pin");
  });

  it("preserves place anchor metadata alongside a pinned geo", () => {
    // Simulates the payload shape ActivityCreationView assembles when the user
    // picks a place, then refines the exact spot via the Pin sheet.
    const entity: UGCEntity = {
      id: "ugc_test_anchored",
      venue_name: "Civic Center Park bench",
      category: "social",
      created_at: new Date().toISOString(),
      geo: { lat: 39.7385, lng: -104.9905 }, // pinned, not the place centroid
      location_source: "map_pin",
      place_id: "place_civic_center",
      place_name: "Civic Center Park",
      location_label: "Civic Center Park",
    };
    expect(entity.location_source).toBe("map_pin");
    expect(entity.place_id).toBe("place_civic_center");
    expect(entity.place_name).toBe("Civic Center Park");
    expect(entity.geo).toEqual({ lat: 39.7385, lng: -104.9905 });
  });

  it("still accepts every pre-existing location_source value", () => {
    const sources: NonNullable<UGCEntity["location_source"]>[] = [
      "browser_geolocation",
      "fallback_geo",
      "manual",
      "place_picker",
      "unknown",
      "map_pin",
    ];
    expect(sources).toHaveLength(6);
    expect(sources).toContain("map_pin");
  });
});

describe("mapboxConfig", () => {
  it("returns null token when NEXT_PUBLIC_MAPBOX_TOKEN is unset", () => {
    const original = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    expect(getMapboxToken()).toBeNull();
    expect(isMapboxEnabled()).toBe(false);
    if (original !== undefined) process.env.NEXT_PUBLIC_MAPBOX_TOKEN = original;
  });

  it("returns null token when env var is whitespace-only", () => {
    const original = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "   ";
    expect(getMapboxToken()).toBeNull();
    expect(isMapboxEnabled()).toBe(false);
    if (original !== undefined) process.env.NEXT_PUBLIC_MAPBOX_TOKEN = original;
    else delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  });

  it("returns the trimmed token when set", () => {
    const original = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "  pk.test_token_xxx  ";
    expect(getMapboxToken()).toBe("pk.test_token_xxx");
    expect(isMapboxEnabled()).toBe(true);
    if (original !== undefined) process.env.NEXT_PUBLIC_MAPBOX_TOKEN = original;
    else delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  });

  it("zoom constants stay within sane phone-screen bounds", () => {
    expect(MIN_ZOOM).toBeGreaterThanOrEqual(1);
    expect(MIN_ZOOM).toBeLessThan(DEFAULT_ZOOM);
    expect(DEFAULT_ZOOM).toBeLessThan(MAX_ZOOM);
    expect(MAX_ZOOM).toBeLessThanOrEqual(22);
  });
});
