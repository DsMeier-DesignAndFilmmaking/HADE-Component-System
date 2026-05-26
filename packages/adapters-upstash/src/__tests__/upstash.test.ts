import { describe, expect, it, vi } from "vitest";
import { upstash, UPSTASH_ADAPTER_ID } from "../index.js";

function mockClient(overrides: Partial<{ get: () => Promise<unknown>; set: () => Promise<unknown>; del: () => Promise<unknown> }> = {}) {
  return {
    get: vi.fn(overrides.get ?? (async () => null)),
    set: vi.fn(overrides.set ?? (async () => "OK")),
    del: vi.fn(overrides.del ?? (async () => 1)),
  };
}

describe("upstash adapter", () => {
  it("returns null on get with no client wired", async () => {
    const oldUrl = process.env.UPSTASH_REDIS_REST_URL;
    const oldTok = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const adapter = upstash();
      expect(adapter.id).toBe(UPSTASH_ADAPTER_ID);
      await expect(adapter.get("any")).resolves.toBeNull();
      await expect(adapter.set("k", "v")).resolves.toBeUndefined();
      expect(adapter.mode()).toBe("FULL");
    } finally {
      if (oldUrl) process.env.UPSTASH_REDIS_REST_URL = oldUrl;
      if (oldTok) process.env.UPSTASH_REDIS_REST_TOKEN = oldTok;
    }
  });

  it("delegates get/set/mode to the injected client", async () => {
    const client = mockClient({ get: async () => "stored" });
    const adapter = upstash({ client });
    await expect(adapter.get("k")).resolves.toBe("stored");
    expect(client.get).toHaveBeenCalledWith("k");
    await adapter.set("k", "v");
    expect(client.set).toHaveBeenCalledWith("k", "v");
    expect(adapter.mode()).toBe("FULL");
  });

  it("normalizes null returns from get → null", async () => {
    const client = mockClient({ get: async () => null });
    const adapter = upstash({ client });
    await expect(adapter.get("k")).resolves.toBeNull();
  });

  it("set forwards TTL via { ex }", async () => {
    const client = mockClient();
    const adapter = upstash({ client });
    await adapter.set("k", "v", 60);
    expect(client.set).toHaveBeenCalledWith("k", "v", { ex: 60 });
  });

  it("set applies defaultTtlSeconds when call-site omits one", async () => {
    const client = mockClient();
    const adapter = upstash({ client, defaultTtlSeconds: 30 });
    await adapter.set("k", "v");
    expect(client.set).toHaveBeenCalledWith("k", "v", { ex: 30 });
  });

  it("flips to DEGRADED mode on failure (production)", async () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const failingClient = mockClient({
        get: async () => {
          throw new Error("Upstash down");
        },
      });
      const adapter = upstash({ client: failingClient });
      await expect(adapter.get("k")).resolves.toBeNull();
      expect(adapter.mode()).toBe("DEGRADED");
    } finally {
      process.env.NODE_ENV = oldEnv;
    }
  });

  it("auto-recovers from DEGRADED on the next successful call", async () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      let calls = 0;
      const flakyClient = {
        get: vi.fn(async () => {
          calls += 1;
          if (calls === 1) throw new Error("transient");
          return "recovered";
        }),
        set: vi.fn(async () => "OK"),
        del: vi.fn(async () => 1),
      };
      const adapter = upstash({ client: flakyClient });
      await adapter.get("k"); // first call fails → degraded
      expect(adapter.mode()).toBe("DEGRADED");
      await adapter.get("k"); // second call succeeds → cleared
      expect(adapter.mode()).toBe("FULL");
    } finally {
      process.env.NODE_ENV = oldEnv;
    }
  });

  it("stays FULL on failure when NODE_ENV !== production (legacy behavior)", async () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const failingClient = mockClient({
        get: async () => {
          throw new Error("blip");
        },
      });
      const adapter = upstash({ client: failingClient });
      await expect(adapter.get("k")).resolves.toBeNull();
      expect(adapter.mode()).toBe("FULL"); // not degraded in dev
    } finally {
      process.env.NODE_ENV = oldEnv;
    }
  });

  it("set failures degrade silently (no throw)", async () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const client = mockClient({
        set: async () => {
          throw new Error("write fail");
        },
      });
      const adapter = upstash({ client });
      await expect(adapter.set("k", "v")).resolves.toBeUndefined();
      expect(adapter.mode()).toBe("DEGRADED");
    } finally {
      process.env.NODE_ENV = oldEnv;
    }
  });

  it("productionOnlyDegradation=false enables degradation outside production", async () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      const failingClient = mockClient({
        get: async () => {
          throw new Error("blip");
        },
      });
      const adapter = upstash({ client: failingClient, productionOnlyDegradation: false });
      await adapter.get("k");
      expect(adapter.mode()).toBe("DEGRADED");
    } finally {
      process.env.NODE_ENV = oldEnv;
    }
  });
});
