import { describe, expect, it } from "vitest";
import { DEFAULT_HADE_CONFIG } from "../defaults.js";
import { HadeConfigValidationError, validateConfig } from "../validateConfig.js";
import { loadConfig } from "../loadConfig.js";

describe("HadeConfig", () => {
  it("loads existing runtime values as defaults", () => {
    const config = loadConfig({}, { clientId: "test-client", configHash: "fnv:test" });

    expect(config.defaults).toEqual({
      radius_meters: 800,
      locale: "en-US",
      config_hash: "fnv:test",
    });
    expect(config.timeouts).toEqual({ adapter_ms: 8000, geo_ms: 3000 });
    expect(config.confidence.bands).toEqual({
      high: 0.7,
      medium: 0.4,
      threshold_high_multiplier: 0.5,
      threshold_medium_multiplier: 0.3,
    });
    expect(config.confidence.labels).toEqual({ strong_pick: 0.65, good_fit: 0.4 });
    expect(config.weights.opportunity).toEqual({ proximity: 0.4, signal: 0.35, intent: 0.25 });
    // Phase F: scoring resolved shape now includes named profiles + offline_overlay.
    expect(config.scoring.surfaced_once_penalty).toBe(-0.08);
    expect(config.scoring.surfaced_twice_penalty).toBe(-0.14);
    expect(config.scoring.profiles.balanced).toEqual({ proximity: 0.4, signal: 0.35, intent: 0.25 });
    expect(config.scoring.offline_overlay).toEqual({ proximity: 0.6, signal: 0.4, intent: 0 });
    expect(config.clientId).toBe("test-client");
    expect(config.config_hash).toBe("fnv:test");
  });

  it("deep-merges caller overrides without mutating defaults", () => {
    const config = loadConfig({
      defaults: { radius_meters: 1200 },
      confidence: {
        bands: { high: 0.8 },
        node: { recency_recent_score: 0.75 },
      },
      timeouts: { adapter_ms: 2500 },
      weights: { opportunity: { intent: 0.5 } },
      metadata: { env: "test" },
    });

    expect(config.defaults.radius_meters).toBe(1200);
    expect(config.defaults.locale).toBe("en-US");
    expect(config.confidence.bands.high).toBe(0.8);
    expect(config.confidence.bands.medium).toBe(0.4);
    expect(config.confidence.node.recency_recent_score).toBe(0.75);
    expect(config.timeouts.adapter_ms).toBe(2500);
    expect(config.timeouts.geo_ms).toBe(3000);
    expect(config.weights.opportunity.intent).toBe(0.5);
    expect(config.weights.opportunity.proximity).toBe(0.4);
    expect(config.metadata).toEqual({ env: "test" });
    expect(DEFAULT_HADE_CONFIG.defaults.radius_meters).toBe(800);
  });

  it("reports validation issues for out-of-range values", () => {
    const issues = validateConfig({
      defaults: { radius_meters: 0 },
      confidence: {
        bands: { medium: 0.8, high: 0.7 },
        labels: { good_fit: 0.9, strong_pick: 0.5 },
        node: { recency_recent_ms: 100, recency_fresh_ms: 200 },
      },
      timeouts: { adapter_ms: -1 },
      weights: { confidence: { recency: -0.1 } },
      scoring: { surfaced_once_penalty: 0.1 },
    });

    expect(issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "defaults.radius_meters",
        "confidence.bands.medium/confidence.bands.high",
        "confidence.labels.good_fit/confidence.labels.strong_pick",
        "confidence.node.recency_fresh_ms/confidence.node.recency_recent_ms",
        "timeouts.adapter_ms",
        "weights.confidence.recency",
        "scoring.surfaced_once_penalty",
      ]),
    );
  });

  it("throws typed validation errors from loadConfig", () => {
    expect(() => loadConfig({ confidence: { labels: { strong_pick: 2 } } })).toThrow(
      HadeConfigValidationError,
    );
  });
});
