import { describe, expect, it } from "vitest";
import { computeConfigHash, computeConfigHashSync } from "../hash.js";
import { loadConfig } from "../loadConfig.js";

describe("computeConfigHashSync", () => {
  it("returns identical hashes for identical resolved configs", () => {
    const a = loadConfig({ defaults: { radius_meters: 800 } });
    const b = loadConfig({ defaults: { radius_meters: 800 } });
    expect(computeConfigHashSync(a)).toBe(computeConfigHashSync(b));
  });

  it("returns different hashes for different resolved configs", () => {
    const a = loadConfig({ defaults: { radius_meters: 800 } });
    const b = loadConfig({ defaults: { radius_meters: 900 } });
    expect(computeConfigHashSync(a)).not.toBe(computeConfigHashSync(b));
  });

  it("strips clientId (volatile) so different clients with same config match", () => {
    const a = loadConfig({}, { clientId: "client-a" });
    const b = loadConfig({}, { clientId: "client-b" });
    expect(computeConfigHashSync(a)).toBe(computeConfigHashSync(b));
  });

  it("strips config_hash itself (avoids self-reference instability)", () => {
    const a = loadConfig({}, { configHash: "fnv:abc" });
    const b = loadConfig({}, { configHash: "fnv:xyz" });
    expect(computeConfigHashSync(a)).toBe(computeConfigHashSync(b));
  });

  it("produces stable key ordering (object insertion order doesn't matter)", () => {
    const a = loadConfig({ defaults: { radius_meters: 800, locale: "en-US" } });
    const b = loadConfig({ defaults: { locale: "en-US", radius_meters: 800 } });
    expect(computeConfigHashSync(a)).toBe(computeConfigHashSync(b));
  });

  it('prefixes the output with "fnv:" (sync fallback marker)', () => {
    const cfg = loadConfig({});
    expect(computeConfigHashSync(cfg)).toMatch(/^fnv:[0-9a-f]+$/);
  });
});

describe("computeConfigHash (async)", () => {
  it("returns a stable sha256 when Web Crypto is available", async () => {
    const cfg = loadConfig({ defaults: { radius_meters: 800 } });
    const hash = await computeConfigHash(cfg);
    // In Node 19+ / Workers / Deno / browsers: sha256: prefix + 64 hex chars.
    // In older Node without crypto.subtle: fnv: prefix (fallback).
    expect(hash).toMatch(/^(sha256:[0-9a-f]{64}|fnv:[0-9a-f]+)$/);
  });

  it("matches across runs for identical inputs", async () => {
    const cfg = loadConfig({ defaults: { radius_meters: 800 } });
    const [a, b] = await Promise.all([computeConfigHash(cfg), computeConfigHash(cfg)]);
    expect(a).toBe(b);
  });
});
