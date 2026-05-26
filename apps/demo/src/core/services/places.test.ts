import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Google Places includedTypes sanitization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    process.env.GOOGLE_API_KEY = "test-google-key";
  });

  it("expands landmark before sending includedTypes to Google Places", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ places: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { fetchNearbyGrounded } = await import("@/core/services/places");

    await fetchNearbyGrounded({
      geo: { lat: 39.7392, lng: -104.9903 },
      target_categories: ["landmark"],
      radius_meters: 1000,
      open_now: true,
    });

    const request = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string) as {
      includedTypes?: string[];
    };

    expect(request.includedTypes).toEqual([
      "tourist_attraction",
      "historical_landmark",
      "point_of_interest",
    ]);
    expect(request.includedTypes).not.toContain("landmark");
  });

  it("does not send landmark from travel multi-query buckets", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ places: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { DOMAIN_CATEGORY_BUCKETS, fetchMultiQueryGrounded } = await import(
      "@/core/services/places"
    );

    await fetchMultiQueryGrounded({
      geo: { lat: 39.7392, lng: -104.9903 },
      categoryBuckets: DOMAIN_CATEGORY_BUCKETS.travel,
      radius_meters: 4000,
      open_now: true,
    });

    const allIncludedTypes = fetchSpy.mock.calls.flatMap((call) => {
      const request = JSON.parse(call[1]?.body as string) as {
        includedTypes?: string[];
      };
      return request.includedTypes ?? [];
    });

    expect(fetchSpy).toHaveBeenCalledTimes(DOMAIN_CATEGORY_BUCKETS.travel.length);
    expect(allIncludedTypes).toContain("tourist_attraction");
    expect(allIncludedTypes).toContain("historical_landmark");
    expect(allIncludedTypes).toContain("point_of_interest");
    expect(allIncludedTypes).not.toContain("landmark");
  });
});
