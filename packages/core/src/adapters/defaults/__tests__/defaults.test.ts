import { describe, expect, it } from "vitest";
import { emptyVenues } from "../emptyVenues.js";
import { noopLLM } from "../noopLLM.js";
import { memoryCache } from "../memoryCache.js";

describe("emptyVenues", () => {
  it("returns [] from every method", async () => {
    const v = emptyVenues();
    expect(v.id).toBe("empty_venues@1.0.0");
    await expect(v.searchNearby({ geo: { lat: 0, lng: 0 } })).resolves.toEqual([]);
    await expect(
      v.searchMultiQuery({ geo: { lat: 0, lng: 0 }, categoryBuckets: [["cafe"]], radius_meters: 800 }),
    ).resolves.toEqual([]);
    await expect(v.searchForContext({}, [])).resolves.toEqual([]);
  });
});

describe("noopLLM", () => {
  it("always returns null", async () => {
    const llm = noopLLM();
    expect(llm.id).toBe("noop_llm@1.0.0");
    await expect(llm.enhanceCopy("any prompt")).resolves.toBeNull();
  });
});

describe("memoryCache", () => {
  it("round-trips get/set without TTL", async () => {
    const c = memoryCache();
    expect(c.id).toBe("memory_cache@1.0.0");
    expect(c.mode()).toBe("FULL");
    await c.set("k", { hello: "world" });
    await expect(c.get("k")).resolves.toEqual({ hello: "world" });
  });

  it("returns null on miss", async () => {
    const c = memoryCache();
    await expect(c.get("never")).resolves.toBeNull();
  });

  it("expires entries after TTL", async () => {
    const c = memoryCache();
    await c.set("k", "v", 0.05); // 50 ms
    await new Promise((r) => setTimeout(r, 80));
    await expect(c.get("k")).resolves.toBeNull();
  });

  it("evicts least-recently-used when over capacity", async () => {
    const c = memoryCache({ maxEntries: 2 });
    await c.set("a", 1);
    await c.set("b", 2);
    await c.get("a"); // refresh "a" → "b" is now LRU
    await c.set("c", 3);
    await expect(c.get("a")).resolves.toBe(1);
    await expect(c.get("b")).resolves.toBeNull();
    await expect(c.get("c")).resolves.toBe(3);
  });

  it("re-setting an existing key moves it to MRU", async () => {
    const c = memoryCache({ maxEntries: 2 });
    await c.set("a", 1);
    await c.set("b", 2);
    await c.set("a", 10); // a moves to MRU
    await c.set("c", 3); // b should evict
    await expect(c.get("b")).resolves.toBeNull();
    await expect(c.get("a")).resolves.toBe(10);
  });
});
