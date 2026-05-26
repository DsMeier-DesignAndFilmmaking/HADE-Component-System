/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  browserGeo,
  scenarioGeo,
  storedGeo,
  saveLastKnownGeo,
  resolveGeoChain,
  type CascadeLink,
} from "../geoAdapters";

// ─── browserGeo ────────────────────────────────────────────────────────────────

describe("browserGeo", () => {
  afterEach(() => {
    // Restore navigator.geolocation between tests so cross-test pollution stays out.
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
  });

  it("returns null when navigator.geolocation is unavailable", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
    const adapter = browserGeo();
    await expect(adapter.resolveCoords()).resolves.toBeNull();
  });

  it("resolves coords on getCurrentPosition success", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 40.6818, longitude: -73.9591 } } as GeolocationPosition),
      },
    });
    const adapter = browserGeo();
    await expect(adapter.resolveCoords()).resolves.toEqual({ lat: 40.6818, lng: -73.9591 });
  });

  it("returns null when the user denies the permission prompt", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({ code: 1, message: "denied" } as GeolocationPositionError),
      },
    });
    const adapter = browserGeo();
    await expect(adapter.resolveCoords()).resolves.toBeNull();
  });

  it("fires onSuccess with the resolved coords", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition),
      },
    });
    const onSuccess = vi.fn();
    const adapter = browserGeo({ onSuccess });
    await adapter.resolveCoords();
    expect(onSuccess).toHaveBeenCalledWith({ lat: 1, lng: 2 });
  });

  it("survives an onSuccess that throws (still returns the geo)", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition),
      },
    });
    const adapter = browserGeo({
      onSuccess: () => {
        throw new Error("storage quota");
      },
    });
    await expect(adapter.resolveCoords()).resolves.toEqual({ lat: 1, lng: 2 });
  });

  it("propagates timeout/maximumAge into getCurrentPosition options", async () => {
    const spy = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback, _error: PositionErrorCallback, options?: PositionOptions) => {
          spy(options);
          success({ coords: { latitude: 0.1, longitude: 0.2 } } as GeolocationPosition);
        },
      },
    });
    const adapter = browserGeo({ timeoutMs: 8000, maximumAgeMs: 60_000 });
    await adapter.resolveCoords();
    expect(spy).toHaveBeenCalledWith({ timeout: 8000, maximumAge: 60_000 });
  });
});

// ─── scenarioGeo ───────────────────────────────────────────────────────────────

describe("scenarioGeo", () => {
  it("returns the supplied coords", async () => {
    const adapter = scenarioGeo({ coords: { lat: 35.6, lng: 139.7 } });
    await expect(adapter.resolveCoords()).resolves.toEqual({ lat: 35.6, lng: 139.7 });
  });

  it("returns null when coords are null or undefined", async () => {
    await expect(scenarioGeo({ coords: null }).resolveCoords()).resolves.toBeNull();
    await expect(scenarioGeo({ coords: undefined }).resolveCoords()).resolves.toBeNull();
  });
});

// ─── storedGeo + saveLastKnownGeo round-trip ──────────────────────────────────

describe("storedGeo / saveLastKnownGeo", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when no value is stored", async () => {
    await expect(storedGeo().resolveCoords()).resolves.toBeNull();
  });

  it("round-trips coords via saveLastKnownGeo", async () => {
    saveLastKnownGeo({ lat: 40.7, lng: -74.0 });
    await expect(storedGeo().resolveCoords()).resolves.toEqual({ lat: 40.7, lng: -74.0 });
  });

  it("rejects the (0,0) sentinel (matches legacy loadLastKnownGeo guard)", async () => {
    localStorage.setItem("hade_last_known_geo", JSON.stringify({ lat: 0, lng: 0 }));
    await expect(storedGeo().resolveCoords()).resolves.toBeNull();
  });

  it("rejects non-finite values", async () => {
    localStorage.setItem("hade_last_known_geo", JSON.stringify({ lat: "x", lng: "y" }));
    await expect(storedGeo().resolveCoords()).resolves.toBeNull();
  });

  it("honors a custom storageKey", async () => {
    saveLastKnownGeo({ lat: 1, lng: 2 }, "custom_key");
    await expect(storedGeo({ storageKey: "custom_key" }).resolveCoords()).resolves.toEqual({
      lat: 1,
      lng: 2,
    });
    await expect(storedGeo().resolveCoords()).resolves.toBeNull();
  });
});

// ─── resolveGeoChain ───────────────────────────────────────────────────────────

describe("resolveGeoChain", () => {
  it("returns the first non-null result with its source tag", async () => {
    const chain: CascadeLink[] = [
      { source: "browser", adapter: { id: "b", resolveCoords: async () => null } },
      { source: "ip", adapter: { id: "i", resolveCoords: async () => ({ lat: 5, lng: 6 }) } },
      { source: "stored", adapter: { id: "s", resolveCoords: async () => ({ lat: 7, lng: 8 }) } },
    ];
    const result = await resolveGeoChain(chain, { geo: { lat: 0, lng: 0 }, source: "unknown" });
    expect(result).toEqual({ geo: { lat: 5, lng: 6 }, source: "ip" });
  });

  it("falls through to the fallback when every link resolves null", async () => {
    const chain: CascadeLink[] = [
      { source: "browser", adapter: { id: "b", resolveCoords: async () => null } },
      { source: "ip", adapter: { id: "i", resolveCoords: async () => null } },
    ];
    const result = await resolveGeoChain(chain, {
      geo: { lat: 37.7749, lng: -122.4194 },
      source: "unknown",
    });
    expect(result).toEqual({
      geo: { lat: 37.7749, lng: -122.4194 },
      source: "unknown",
    });
  });

  it("treats a thrown adapter as null and continues the chain", async () => {
    const chain: CascadeLink[] = [
      {
        source: "browser",
        adapter: {
          id: "boom",
          async resolveCoords(): Promise<never> {
            throw new Error("explode");
          },
        },
      },
      { source: "ip", adapter: { id: "i", resolveCoords: async () => ({ lat: 9, lng: 10 }) } },
    ];
    const result = await resolveGeoChain(chain, { geo: { lat: 0, lng: 0 }, source: "unknown" });
    expect(result).toEqual({ geo: { lat: 9, lng: 10 }, source: "ip" });
  });
});
