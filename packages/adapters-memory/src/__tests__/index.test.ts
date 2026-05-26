import { describe, expect, it } from "vitest";
import { memoryCache } from "../index.js";

describe("@hade/adapters-memory", () => {
  it("re-exports a working memoryCache factory", async () => {
    const c = memoryCache();
    expect(c.id).toBe("memory_cache@1.0.0");
    expect(c.mode()).toBe("FULL");
    await c.set("k", "v");
    await expect(c.get("k")).resolves.toBe("v");
  });

  it("accepts MemoryCacheOptions", async () => {
    const c = memoryCache({ id: "custom@2.0.0", maxEntries: 4 });
    expect(c.id).toBe("custom@2.0.0");
  });
});
