import { describe, expect, it } from "vitest";
import { staticGeo } from "../staticGeo.js";
import { headerGeo, type HeaderSource } from "../headerGeo.js";
import { ipLookupGeo } from "../ipLookupGeo.js";
import { compositeGeo } from "../compositeGeo.js";

function mockHeaders(map: Record<string, string>): HeaderSource {
  return {
    get(name: string): string | null {
      return map[name.toLowerCase()] ?? null;
    },
  };
}

describe("staticGeo", () => {
  it("returns the fixed coords on every call", async () => {
    const geo = staticGeo({ coords: { lat: 40.68, lng: -73.96 } });
    expect(geo.id).toBe("static@1.0.0");
    await expect(geo.resolveCoords()).resolves.toEqual({ lat: 40.68, lng: -73.96 });
    await expect(geo.resolveCoords()).resolves.toEqual({ lat: 40.68, lng: -73.96 });
  });

  it("honors a custom id", () => {
    expect(staticGeo({ id: "test@2.0.0", coords: { lat: 0, lng: 0 } }).id).toBe("test@2.0.0");
  });
});

describe("headerGeo", () => {
  it("parses Vercel headers", async () => {
    const headers = mockHeaders({ "x-vercel-ip-latitude": "37.77", "x-vercel-ip-longitude": "-122.41" });
    const geo = headerGeo({ getHeaders: () => headers });
    await expect(geo.resolveCoords()).resolves.toEqual({ lat: 37.77, lng: -122.41 });
  });

  it("falls through to Cloudflare headers when Vercel is absent", async () => {
    const headers = mockHeaders({ "cf-iplatitude": "51.50", "cf-iplongitude": "-0.12" });
    const geo = headerGeo({ getHeaders: () => headers });
    await expect(geo.resolveCoords()).resolves.toEqual({ lat: 51.50, lng: -0.12 });
  });

  it("returns null when no header pair parses", async () => {
    const headers = mockHeaders({ "x-vercel-ip-latitude": "garbage" });
    const geo = headerGeo({ getHeaders: () => headers });
    await expect(geo.resolveCoords()).resolves.toBeNull();
  });

  it("returns null when getHeaders returns null", async () => {
    const geo = headerGeo({ getHeaders: () => null });
    await expect(geo.resolveCoords()).resolves.toBeNull();
  });

  it("accepts custom header pairs", async () => {
    const headers = mockHeaders({ "x-lat": "10", "x-lng": "20" });
    const geo = headerGeo({
      getHeaders: () => headers,
      latLngHeaders: [["x-lat", "x-lng"]],
    });
    await expect(geo.resolveCoords()).resolves.toEqual({ lat: 10, lng: 20 });
  });
});

describe("ipLookupGeo", () => {
  it("calls the endpoint and parses ipapi.co response shape", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ latitude: 1.5, longitude: -2.5 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
    const geo = ipLookupGeo({ fetchImpl: fakeFetch });
    await expect(geo.resolveCoords()).resolves.toEqual({ lat: 1.5, lng: -2.5 });
  });

  it("returns null on non-2xx response", async () => {
    const fakeFetch = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const geo = ipLookupGeo({ fetchImpl: fakeFetch });
    await expect(geo.resolveCoords()).resolves.toBeNull();
  });

  it("returns null on network failure (never throws)", async () => {
    const fakeFetch = (async () => {
      throw new Error("ENETDOWN");
    }) as unknown as typeof fetch;
    const geo = ipLookupGeo({ fetchImpl: fakeFetch });
    await expect(geo.resolveCoords()).resolves.toBeNull();
  });

  it("applies a custom parser", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ loc: "10,20" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
    const geo = ipLookupGeo({
      fetchImpl: fakeFetch,
      parse: (raw) => {
        const obj = raw as { loc?: string };
        if (!obj.loc) return null;
        const [lat, lng] = obj.loc.split(",").map(Number);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat: lat!, lng: lng! } : null;
      },
    });
    await expect(geo.resolveCoords()).resolves.toEqual({ lat: 10, lng: 20 });
  });
});

describe("compositeGeo", () => {
  it("returns the first non-null result", async () => {
    const geo = compositeGeo(
      staticGeo({ id: "first@1.0.0", coords: { lat: 1, lng: 1 } }),
      staticGeo({ id: "second@1.0.0", coords: { lat: 2, lng: 2 } }),
    );
    await expect(geo.resolveCoords()).resolves.toEqual({ lat: 1, lng: 1 });
  });

  it("falls through nulls until something resolves", async () => {
    const nullGeo = { id: "null@1.0.0", resolveCoords: async () => null };
    const geo = compositeGeo(
      nullGeo,
      nullGeo,
      staticGeo({ coords: { lat: 3, lng: 4 } }),
    );
    await expect(geo.resolveCoords()).resolves.toEqual({ lat: 3, lng: 4 });
  });

  it("returns null when every adapter returns null", async () => {
    const nullGeo = { id: "null@1.0.0", resolveCoords: async () => null };
    const geo = compositeGeo(nullGeo, nullGeo);
    await expect(geo.resolveCoords()).resolves.toBeNull();
  });

  it("skips adapters that throw and continues the chain", async () => {
    const throwingGeo = {
      id: "throws@1.0.0",
      async resolveCoords(): Promise<never> {
        throw new Error("boom");
      },
    };
    const geo = compositeGeo(throwingGeo, staticGeo({ coords: { lat: 5, lng: 6 } }));
    await expect(geo.resolveCoords()).resolves.toEqual({ lat: 5, lng: 6 });
  });

  it("accepts an options-first signature", () => {
    const geo = compositeGeo({ id: "custom@1.0.0" }, staticGeo({ coords: { lat: 0, lng: 0 } }));
    expect(geo.id).toBe("custom@1.0.0");
  });
});
