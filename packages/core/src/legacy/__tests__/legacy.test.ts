import { describe, expect, it, vi } from "vitest";
import {
  legacyOpenAIAdapter,
  legacyUpstashAdapter,
  unwrappedGooglePlaces,
  type LegacyFetchNearbyOptions,
  type LegacyRedisClient,
} from "../index.js";
import type { VenueCandidate } from "../../types/adapters.js";

const FIXTURE: VenueCandidate[] = [
  {
    id: "v-1",
    name: "Test",
    category: "cafe",
    vibe: "cozy",
    geo: { lat: 1, lng: 2 },
    distance_meters: 100,
    is_open: true,
  },
];

describe("unwrappedGooglePlaces", () => {
  it("delegates searchNearby to the injected legacy function with renamed fields", async () => {
    const fetchNearbyGrounded = vi.fn(async (_opts: LegacyFetchNearbyOptions) => FIXTURE);
    const adapter = unwrappedGooglePlaces({ fetchNearbyGrounded });
    expect(adapter.id).toBe("google_places_legacy@0.0.0");
    const result = await adapter.searchNearby({
      geo: { lat: 40, lng: -73 },
      radius_meters: 800,
      intent: "drink",
      target_categories: ["bar"],
      open_now: true,
      max_results: 10,
    });
    expect(result).toEqual(FIXTURE);
    expect(fetchNearbyGrounded).toHaveBeenCalledWith({
      geo: { lat: 40, lng: -73 },
      radius_meters: 800,
      intent: "drink",
      target_categories: ["bar"],
      open_now: true,
      max_results: 10,
    });
  });

  it("searchForContext returns [] when geo is missing — preserves legacy guard", async () => {
    const fetchNearbyGrounded = vi.fn(async () => FIXTURE);
    const adapter = unwrappedGooglePlaces({ fetchNearbyGrounded });
    const result = await adapter.searchForContext({ geo: null }, ["bar"]);
    expect(result).toEqual([]);
    expect(fetchNearbyGrounded).not.toHaveBeenCalled();
  });

  it("searchForContext applies the default 800m radius when context omits it", async () => {
    const fetchNearbyGrounded = vi.fn(async () => FIXTURE);
    const adapter = unwrappedGooglePlaces({ fetchNearbyGrounded });
    await adapter.searchForContext({ geo: { lat: 0, lng: 0 } }, ["bar"]);
    expect(fetchNearbyGrounded).toHaveBeenCalledWith(
      expect.objectContaining({ radius_meters: 800, open_now: true }),
    );
  });

  it("searchMultiQuery delegates when fetchMultiQueryGrounded is provided", async () => {
    const fetchNearbyGrounded = vi.fn(async () => []);
    const fetchMultiQueryGrounded = vi.fn(async () => FIXTURE);
    const adapter = unwrappedGooglePlaces({ fetchNearbyGrounded, fetchMultiQueryGrounded });
    const result = await adapter.searchMultiQuery({
      geo: { lat: 1, lng: 2 },
      categoryBuckets: [["cafe"], ["bar"]],
      radius_meters: 800,
    });
    expect(result).toEqual(FIXTURE);
    expect(fetchMultiQueryGrounded).toHaveBeenCalledOnce();
  });

  it("searchMultiQuery falls through to flat single search when multi-query dep missing", async () => {
    const fetchNearbyGrounded = vi.fn(async () => FIXTURE);
    const adapter = unwrappedGooglePlaces({ fetchNearbyGrounded });
    await adapter.searchMultiQuery({
      geo: { lat: 1, lng: 2 },
      categoryBuckets: [["cafe"], ["bar", "cafe"]],
      radius_meters: 800,
    });
    expect(fetchNearbyGrounded).toHaveBeenCalledWith(
      expect.objectContaining({
        target_categories: expect.arrayContaining(["cafe", "bar"]),
      }),
    );
  });
});

describe("legacyOpenAIAdapter", () => {
  it("delegates to the injected enhanceCopy function", async () => {
    const enhanceCopy = vi.fn(async (_p: string) => ({ rationale: "ok" }));
    const adapter = legacyOpenAIAdapter({ enhanceCopy });
    expect(adapter.id).toBe("openai_legacy@0.0.0");
    const result = await adapter.enhanceCopy("prompt");
    expect(result).toEqual({ rationale: "ok" });
    expect(enhanceCopy).toHaveBeenCalledWith("prompt", undefined);
  });

  it("passes through null returns unchanged (deterministic-copy fallback)", async () => {
    const adapter = legacyOpenAIAdapter({ enhanceCopy: async () => null });
    await expect(adapter.enhanceCopy("x")).resolves.toBeNull();
  });
});

describe("legacyUpstashAdapter", () => {
  function mockClient(): LegacyRedisClient & { calls: Array<[string, ...unknown[]]> } {
    const calls: Array<[string, ...unknown[]]> = [];
    return {
      calls,
      async get(key) {
        calls.push(["get", key]);
        return key === "hit" ? "value" : null;
      },
      async set(key, value, opts) {
        calls.push(["set", key, value, opts]);
        return "OK";
      },
    };
  }

  it("returns null for missing keys, value for hits", async () => {
    const client = mockClient();
    const adapter = legacyUpstashAdapter({ client, getMode: () => "FULL" });
    expect(adapter.id).toBe("upstash_legacy@0.0.0");
    await expect(adapter.get("miss")).resolves.toBeNull();
    await expect(adapter.get("hit")).resolves.toBe("value");
  });

  it("set passes through TTL when provided", async () => {
    const client = mockClient();
    const adapter = legacyUpstashAdapter({ client, getMode: () => "FULL" });
    await adapter.set("k", "v", 60);
    expect(client.calls.at(-1)).toEqual(["set", "k", "v", { ex: 60 }]);
  });

  it("set omits TTL when neither call nor default supplies one", async () => {
    const client = mockClient();
    const adapter = legacyUpstashAdapter({ client, getMode: () => "FULL" });
    await adapter.set("k", "v");
    expect(client.calls.at(-1)).toEqual(["set", "k", "v", undefined]);
  });

  it("mode() reflects the injected getMode", () => {
    const adapter = legacyUpstashAdapter({ client: mockClient(), getMode: () => "DEGRADED" });
    expect(adapter.mode()).toBe("DEGRADED");
  });

  it("no-op on null client — never throws", async () => {
    const adapter = legacyUpstashAdapter({ client: null, getMode: () => "FULL" });
    await expect(adapter.get("any")).resolves.toBeNull();
    await expect(adapter.set("k", "v")).resolves.toBeUndefined();
  });
});
