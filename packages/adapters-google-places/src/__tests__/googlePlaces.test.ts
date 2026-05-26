import { describe, expect, it, vi } from "vitest";
import { googlePlaces, GOOGLE_PLACES_ADAPTER_ID } from "../index.js";

function fakeJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const SAMPLE_PLACE = {
  id: "p_1",
  displayName: { text: "Hart's" },
  types: ["wine_bar", "bar", "food"],
  location: { latitude: 40.6818, longitude: -73.9591 },
  currentOpeningHours: { openNow: true },
  rating: 4.5,
  priceLevel: "PRICE_LEVEL_MODERATE",
  shortFormattedAddress: "457 Nostrand Ave, Brooklyn, NY",
};

describe("googlePlaces", () => {
  it("returns [] when no API key is available", async () => {
    const adapter = googlePlaces({
      apiKey: undefined,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    // Clear env vars for this test
    const oldGoogle = process.env.GOOGLE_API_KEY;
    const oldPlaces = process.env.GOOGLE_PLACES_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_PLACES_KEY;
    try {
      const result = await adapter.searchNearby({ geo: { lat: 1, lng: 2 } });
      expect(result).toEqual([]);
    } finally {
      if (oldGoogle) process.env.GOOGLE_API_KEY = oldGoogle;
      if (oldPlaces) process.env.GOOGLE_PLACES_KEY = oldPlaces;
    }
  });

  it("returns [] for invalid geo (0,0 or missing coords)", async () => {
    const fetchImpl = vi.fn();
    const adapter = googlePlaces({ apiKey: "fake", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(adapter.searchNearby({ geo: { lat: 0, lng: 0 } })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the correct Google REST body and headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fakeJsonResponse({ places: [SAMPLE_PLACE] }));
    const adapter = googlePlaces({ apiKey: "test_key", fetchImpl: fetchImpl as unknown as typeof fetch });
    await adapter.searchNearby({
      geo: { lat: 40.68, lng: -73.96 },
      radius_meters: 1500,
      target_categories: ["bar"],
      max_results: 5,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test_key");
    expect(headers["X-Goog-FieldMask"]).toContain("places.id");
    expect(headers["X-Goog-FieldMask"]).toContain("places.displayName");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.locationRestriction.circle.center).toEqual({ latitude: 40.68, longitude: -73.96 });
    expect(body.locationRestriction.circle.radius).toBe(1500);
    expect(body.maxResultCount).toBe(5);
    expect(body.rankPreference).toBe("DISTANCE");
    expect(body.includedTypes).toEqual(["bar"]);
  });

  it("caps radius at Google's 50 000 m hard limit", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fakeJsonResponse({ places: [] }));
    const adapter = googlePlaces({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await adapter.searchNearby({ geo: { lat: 1, lng: 2 }, radius_meters: 999_999 });
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.locationRestriction.circle.radius).toBe(50_000);
  });

  it("caps maxResults at Google's 20-per-page limit", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fakeJsonResponse({ places: [] }));
    const adapter = googlePlaces({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await adapter.searchNearby({ geo: { lat: 1, lng: 2 }, max_results: 100 });
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.maxResultCount).toBe(20);
  });

  it("normalizes Google's response into VenueCandidate shape", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fakeJsonResponse({ places: [SAMPLE_PLACE] }));
    const adapter = googlePlaces({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const [candidate] = await adapter.searchNearby({ geo: { lat: 40.68, lng: -73.96 } });
    expect(candidate).toMatchObject({
      id: "p_1",
      name: "Hart's",
      category: "wine_bar",
      geo: { lat: 40.6818, lng: -73.9591 },
      is_open: true,
      address: "457 Nostrand Ave, Brooklyn, NY",
      rating: 4.5,
      price_level: 2,
      place_id: "p_1",
    });
    expect(candidate?.distance_meters).toBeGreaterThan(0);
    expect(candidate?.types).toEqual(["wine_bar", "bar", "food"]);
  });

  it("filters closed venues when open_now is true (default)", async () => {
    const closed = { ...SAMPLE_PLACE, id: "p_2", currentOpeningHours: { openNow: false } };
    const fetchImpl = vi.fn<typeof fetch>(async () => fakeJsonResponse({ places: [SAMPLE_PLACE, closed] }));
    const adapter = googlePlaces({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await adapter.searchNearby({ geo: { lat: 1, lng: 2 } });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("p_1");
  });

  it("returns [] on non-2xx responses (legacy contract preserved)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 503 }));
    const adapter = googlePlaces({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(adapter.searchNearby({ geo: { lat: 1, lng: 2 } })).resolves.toEqual([]);
  });

  it("returns [] on network errors (never throws)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("ECONNRESET");
    });
    const adapter = googlePlaces({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(adapter.searchNearby({ geo: { lat: 1, lng: 2 } })).resolves.toEqual([]);
  });

  it("searchMultiQuery fans out per bucket and dedupes by id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      const types = body.includedTypes as string[];
      const id = types[0] === "bar" ? "p_1" : "p_1"; // both buckets return p_1 → dedupes
      return fakeJsonResponse({ places: [{ ...SAMPLE_PLACE, id }] });
    });
    const adapter = googlePlaces({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await adapter.searchMultiQuery({
      geo: { lat: 1, lng: 2 },
      categoryBuckets: [["bar"], ["cafe"]],
      radius_meters: 800,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  it("searchForContext returns [] when context geo is missing", async () => {
    const fetchImpl = vi.fn();
    const adapter = googlePlaces({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await adapter.searchForContext({ geo: null }, ["bar"]);
    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("exposes a stable id under capability metadata", () => {
    const adapter = googlePlaces({ apiKey: "k" });
    expect(adapter.id).toBe(GOOGLE_PLACES_ADAPTER_ID);
    expect(adapter.id).toBe("google_places@1.0.0");
  });
});
