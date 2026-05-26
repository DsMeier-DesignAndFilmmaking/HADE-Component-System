import { describe, it, expect } from "vitest";
import {
  filterByDomain,
  DOMAIN_TYPE_WHITELIST,
  DOMAIN_TYPE_BLACKLIST,
} from "../filtering";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePlace(types: string[], extras: Record<string, unknown> = {}) {
  return { id: `place-${Math.random().toString(36).slice(2)}`, name: "Test Place", types, ...extras };
}

// ─── A: 3 valid Places candidates survive domain filter ───────────────────────

describe("filterByDomain — test A: 3 valid candidates avoid rejection", () => {
  it("keeps 3 tourist_attraction places for travel domain", () => {
    const places = [
      makePlace(["tourist_attraction", "point_of_interest"]),
      makePlace(["tourist_attraction", "establishment"]),
      makePlace(["museum", "point_of_interest"]),
    ];
    const result = filterByDomain(places, "travel");
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.id)).toEqual(expect.arrayContaining(places.map((p) => p.id)));
  });

  it("keeps 3 restaurant places for dining domain", () => {
    const places = [
      makePlace(["restaurant", "food", "establishment"]),
      makePlace(["cafe", "food", "establishment"]),
      makePlace(["bakery", "food", "establishment"]),
    ];
    const result = filterByDomain(places, "dining");
    expect(result).toHaveLength(3);
  });

  it("keeps 3 bar/event places for social domain", () => {
    const places = [
      makePlace(["bar", "night_club", "establishment"]),
      makePlace(["night_club", "establishment"]),
      makePlace(["park", "establishment"]),
    ];
    const result = filterByDomain(places, "social");
    expect(result).toHaveLength(3);
  });
});

// ─── B: Optional fields don't affect filtering ────────────────────────────────

describe("filterByDomain — test B: optional fields don't cause rejection", () => {
  it("admits place without rating", () => {
    const place = makePlace(["restaurant"]);
    // no rating field — pure type-based filtering, should still pass
    const result = filterByDomain([place], "dining");
    expect(result).toHaveLength(1);
  });

  it("admits place without price_level", () => {
    const place = makePlace(["tourist_attraction"]);
    const result = filterByDomain([place], "travel");
    expect(result).toHaveLength(1);
  });

  it("admits place without photos, address, or hours", () => {
    const place = makePlace(["bar"]);
    const result = filterByDomain([place], "social");
    expect(result).toHaveLength(1);
  });

  it("admits place with empty extras object (minimal shape)", () => {
    const place = { id: "minimal", name: "Minimal", types: ["cafe"] };
    const result = filterByDomain([place], "dining");
    expect(result).toHaveLength(1);
  });
});

// ─── D: Valid lat/lng candidates are not rejected ─────────────────────────────
// filterByDomain is type-based only — geo is irrelevant here; but confirm the
// filter doesn't inadvertently reject based on geo-adjacent fields.

describe("filterByDomain — test D: geo fields don't affect admission", () => {
  it("admits place with geo field attached (not used by filter)", () => {
    const place = makePlace(["museum"], { geo: { lat: 37.7749, lng: -122.4194 } });
    expect(filterByDomain([place], "travel")).toHaveLength(1);
  });

  it("admits place with zero extras (only types matter)", () => {
    const result = filterByDomain([makePlace(["tourist_attraction"])], "travel");
    expect(result).toHaveLength(1);
  });
});

// ─── E: cold_start_fallback only when all sources empty ───────────────────────

describe("filterByDomain — test E: empty input → empty output", () => {
  it("returns empty array for empty input (dining)", () => {
    expect(filterByDomain([], "dining")).toHaveLength(0);
  });

  it("returns empty array for empty input (travel)", () => {
    expect(filterByDomain([], "travel")).toHaveLength(0);
  });

  it("drops a place with only blacklisted types", () => {
    const place = makePlace(["car_repair", "establishment"]);
    expect(filterByDomain([place], "dining")).toHaveLength(0);
  });

  it("drops ALL places that don't match domain whitelist (no soft fallback match)", () => {
    // These types are not in dining strict OR soft lists → all dropped
    const places = [
      makePlace(["hospital"]),
      makePlace(["doctor"]),
      makePlace(["storage"]),
    ];
    expect(filterByDomain(places, "dining")).toHaveLength(0);
  });
});

// ─── Soft fallback: parks admitted for travel when strict count < 3 ───────────

describe("filterByDomain — soft fallback behaviour", () => {
  it("admits park via soft fallback when travel strict count is 0", () => {
    const place = makePlace(["park", "establishment"]);
    const result = filterByDomain([place], "travel");
    // strict whitelist for travel: tourist_attraction, museum, landmark, zoo, aquarium
    // park is in DOMAIN_SOFT_TYPES.travel → should be admitted
    expect(result).toHaveLength(1);
  });

  it("does NOT use soft fallback when strict count is already ≥ 3", () => {
    const strict = [
      makePlace(["tourist_attraction"]),
      makePlace(["museum"]),
      makePlace(["tourist_attraction"]),
    ];
    const softOnly = makePlace(["park"]);
    const result = filterByDomain([...strict, softOnly], "travel");
    // strict count = 3 (≥ threshold) → soft fallback skipped; park excluded
    expect(result.map((p) => p.id)).not.toContain(softOnly.id);
    expect(result).toHaveLength(3);
  });

  it("blacklist enforcement holds even in soft fallback", () => {
    // Add a blacklisted type alongside a soft-fallback type
    const place = makePlace(["park", "car_repair"]);
    expect(filterByDomain([place], "travel")).toHaveLength(0);
  });
});

// ─── Blacklist enforcement ─────────────────────────────────────────────────────

describe("DOMAIN_TYPE_BLACKLIST coverage", () => {
  it("blacklist contains expected noise types", () => {
    expect(DOMAIN_TYPE_BLACKLIST.has("car_repair")).toBe(true);
    expect(DOMAIN_TYPE_BLACKLIST.has("hospital")).toBe(true);
    expect(DOMAIN_TYPE_BLACKLIST.has("lawyer")).toBe(true);
  });

  it("filterByDomain removes a place if ANY type is blacklisted regardless of whitelist", () => {
    const place = makePlace(["restaurant", "car_repair"]); // restaurant passes dining, car_repair blacklisted
    expect(filterByDomain([place], "dining")).toHaveLength(0);
  });
});

// ─── Unknown domain ────────────────────────────────────────────────────────────

describe("filterByDomain — unknown domain", () => {
  it("returns all places unchanged for an unknown domain key", () => {
    const places = [makePlace(["restaurant"]), makePlace(["park"])];
    expect(filterByDomain(places, "unknown_domain")).toHaveLength(2);
  });
});
