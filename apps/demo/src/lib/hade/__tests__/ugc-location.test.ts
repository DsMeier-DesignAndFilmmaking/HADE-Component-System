import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/hade/ugc/route";
import { getUGC, ugcToPlaceOption } from "../ugc";
import type { UGCEntity } from "@/types/hade";

describe("UGC location metadata", () => {
  it("stores optional location metadata and drops fake 0,0 browser geo", async () => {
    const request = new Request("http://localhost/api/hade/ugc", {
      method: "POST",
      body: JSON.stringify({
        id: "ugc-zero-location-source-test",
        venue_name: "Zero Location Test",
        category: "social",
        geo: { lat: 0, lng: 0 },
        created_at: new Date().toISOString(),
        location_source: "browser_geolocation",
        place_name: "Union Hall",
        address: "   ",
        place_id: "place-123",
      }),
    });

    const response = await POST(request as Parameters<typeof POST>[0]);
    const body = await response.json() as { ok: boolean };
    const stored = await getUGC("ugc-zero-location-source-test");

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(stored).toMatchObject({
      id: "ugc-zero-location-source-test",
      location_source: "unknown",
      place_name: "Union Hall",
      place_id: "place-123",
    });
    expect(stored?.geo).toBeUndefined();
    expect(stored?.address).toBeUndefined();
  });

  it("projects UGC location labels into the existing PlaceOption address path", () => {
    const entity: UGCEntity = {
      id: "ugc-location-label-test",
      venue_name: "Courtyard Reset",
      category: "wellness",
      geo: { lat: 39.7392, lng: -104.9903 },
      created_at: new Date().toISOString(),
      location_label: "Front courtyard",
      address: "123 Market St",
      place_name: "Market Hall",
      location_source: "manual",
      place_id: "manual-place-1",
    };

    const option = ugcToPlaceOption(entity, { lat: 39.739, lng: -104.99 });

    expect(option).toMatchObject({
      id: "ugc-location-label-test",
      address: "Front courtyard",
      place_name: "Market Hall",
      location_label: "Front courtyard",
      location_source: "manual",
      place_id: "manual-place-1",
      isUGC: true,
    });
  });

  it("returns null when projecting ungeocoded UGC into a nearby place option", () => {
    const entity: UGCEntity = {
      id: "ugc-no-geo-place-option-test",
      venue_name: "Open Studio Note",
      category: "creative",
      created_at: new Date().toISOString(),
      location_label: "Ask at the front desk",
      location_source: "manual",
    };

    expect(ugcToPlaceOption(entity, { lat: 39.739, lng: -104.99 })).toBeNull();
  });

  it("preserves a manual location label without overloading venue_name", async () => {
    const request = new Request("http://localhost/api/hade/ugc", {
      method: "POST",
      body: JSON.stringify({
        id: "ugc-manual-location-label-test",
        venue_name: "Saturday Sketch Walk",
        category: "creative",
        created_at: new Date().toISOString(),
        location_source: "manual",
        location_label: "Bluebird Cafe, Main Street",
      }),
    });

    const response = await POST(request as Parameters<typeof POST>[0]);
    const stored = await getUGC("ugc-manual-location-label-test");

    expect(response.status).toBe(200);
    expect(stored).toMatchObject({
      venue_name: "Saturday Sketch Walk",
      location_label: "Bluebird Cafe, Main Street",
      location_source: "manual",
    });
    expect(stored?.geo).toBeUndefined();
  });

  it("preserves current-location UGC with browser geolocation source", async () => {
    const request = new Request("http://localhost/api/hade/ugc", {
      method: "POST",
      body: JSON.stringify({
        id: "ugc-browser-location-test",
        venue_name: "Porch Pop-Up",
        category: "social",
        geo: { lat: 39.7392, lng: -104.9903 },
        created_at: new Date().toISOString(),
        location_source: "browser_geolocation",
      }),
    });

    const response = await POST(request as Parameters<typeof POST>[0]);
    const stored = await getUGC("ugc-browser-location-test");

    expect(response.status).toBe(200);
    expect(stored).toMatchObject({
      geo: { lat: 39.7392, lng: -104.9903 },
      location_source: "browser_geolocation",
    });
  });

  it("preserves place-picker location metadata", async () => {
    const request = new Request("http://localhost/api/hade/ugc", {
      method: "POST",
      body: JSON.stringify({
        id: "ugc-place-picker-location-test",
        venue_name: "Gallery Drop-In",
        category: "creative",
        geo: { lat: 39.751, lng: -104.999 },
        created_at: new Date().toISOString(),
        location_source: "place_picker",
        place_id: "google-place-123",
        place_name: "Little Gallery",
        address: "123 Art Walk",
        location_label: "Little Gallery",
      }),
    });

    const response = await POST(request as Parameters<typeof POST>[0]);
    const stored = await getUGC("ugc-place-picker-location-test");

    expect(response.status).toBe(200);
    expect(stored).toMatchObject({
      geo: { lat: 39.751, lng: -104.999 },
      location_source: "place_picker",
      place_id: "google-place-123",
      place_name: "Little Gallery",
      address: "123 Art Walk",
      location_label: "Little Gallery",
    });
  });

  it("saves UGC with no location fields", async () => {
    const request = new Request("http://localhost/api/hade/ugc", {
      method: "POST",
      body: JSON.stringify({
        id: "ugc-no-location-test",
        venue_name: "Open Jam",
        category: "social",
        created_at: new Date().toISOString(),
      }),
    });

    const response = await POST(request as Parameters<typeof POST>[0]);
    const stored = await getUGC("ugc-no-location-test");

    expect(response.status).toBe(200);
    expect(stored).toMatchObject({
      venue_name: "Open Jam",
      category: "social",
    });
    expect(stored?.geo).toBeUndefined();
    expect(stored?.location_source).toBeUndefined();
  });
});
