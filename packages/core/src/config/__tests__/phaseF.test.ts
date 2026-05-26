import { describe, expect, it } from "vitest";
import { loadConfig } from "../loadConfig.js";
import { validateConfig, HadeConfigValidationError } from "../validateConfig.js";
import { BUILT_IN_DOMAINS } from "../defaults.js";

describe("Phase F: new schema blocks via loadConfig", () => {
  it("loads with all built-in defaults when given an empty config", () => {
    const cfg = loadConfig({});
    expect(cfg.$schema_version).toBe("1.0");
    expect(cfg.active_domain).toBe("dining");
    expect(Object.keys(cfg.domains).sort()).toEqual(["dining", "ecommerce", "social", "travel"]);
    expect(cfg.copy.locale).toBe("en-US");
    expect(cfg.copy.tone).toBe("casual");
    expect(cfg.copy.char_caps).toEqual({ rationale: 280, why_now: 120, why_this: 60, decision_frame: 180 });
    expect(cfg.copy.fallback_titles).toContain("Take a walk nearby");
    expect(cfg.mobility).toEqual({ walking_meters_per_minute: 80, driving_meters_per_minute: 500 });
    expect(cfg.runtime.offline.policy).toBe("cache");
    expect(cfg.runtime.total_budget_ms).toBe(12000);
  });

  it("preserves backward compatibility for Phase C-shaped inputs (silent migration)", () => {
    const cfg = loadConfig({ defaults: { radius_meters: 1500 } });
    // Migration stamps $schema_version, defaults survive verbatim.
    expect(cfg.$schema_version).toBe("1.0");
    expect(cfg.defaults.radius_meters).toBe(1500);
    // Built-in domains still populated.
    expect(cfg.domains.dining?.default_radius_meters).toBe(2500);
  });

  it("merges a user-supplied custom vertical with built-ins", () => {
    const cfg = loadConfig({
      domains: {
        fitness: {
          id: "fitness",
          display_name: "Fitness",
          default_intents: ["workout"],
          default_radius_meters: 1200,
          category_buckets: [["gym"], ["park"], ["yoga_studio"]],
          scoring_profile: "balanced",
        },
      },
      active_domain: "fitness",
    });
    expect(cfg.active_domain).toBe("fitness");
    expect(cfg.domains.fitness?.default_radius_meters).toBe(1200);
    expect(cfg.domains.dining?.id).toBe("dining"); // built-ins survive
  });

  it("deep-merges copy_overrides on a built-in domain", () => {
    const cfg = loadConfig({
      domains: {
        ecommerce: {
          id: "ecommerce",
          display_name: "Shopping",
          copy_overrides: { "action.refine": "Custom filter label" },
        },
      },
    });
    // Built-in keeps its existing override AND picks up the user's new one.
    expect(cfg.domains.ecommerce?.copy_overrides?.["action.take_me_there"]).toBe("Add to cart");
    expect(cfg.domains.ecommerce?.copy_overrides?.["action.refine"]).toBe("Custom filter label");
  });

  it("loads ecommerce with zero radius + zero mobility (open-vertical proof)", () => {
    const cfg = loadConfig({
      active_domain: "ecommerce",
      mobility: { walking_meters_per_minute: 0, driving_meters_per_minute: 0 },
    });
    expect(cfg.active_domain).toBe("ecommerce");
    expect(cfg.mobility.walking_meters_per_minute).toBe(0);
    expect(cfg.domains.ecommerce?.default_radius_meters).toBe(0);
  });
});

describe("Phase F: validation", () => {
  it("rejects active_domain that does not reference a domains key", () => {
    expect(() => loadConfig({ active_domain: "nonexistent_vertical" })).toThrow(
      HadeConfigValidationError,
    );
  });

  it("accepts active_domain that references a built-in (when domains not supplied)", () => {
    // active_domain validation only fires when BOTH active_domain and domains
    // are supplied by the user — built-ins are filled in by the loader.
    expect(() => loadConfig({ active_domain: "travel" })).not.toThrow();
  });

  it("rejects scoring profiles that don't sum to 1.0 ± 0.01", () => {
    const issues = validateConfig({
      scoring: {
        profiles: {
          wrong: { proximity: 0.3, signal: 0.3, intent: 0.3 }, // sums to 0.9
        },
      },
    });
    expect(issues.some((i) => i.path === "scoring.profiles.wrong")).toBe(true);
  });

  it("accepts profiles within the epsilon tolerance", () => {
    const issues = validateConfig({
      scoring: {
        profiles: {
          ok: { proximity: 0.334, signal: 0.333, intent: 0.333 }, // sums to 1.0
        },
      },
    });
    expect(issues.filter((i) => i.path.startsWith("scoring.profiles.ok"))).toEqual([]);
  });

  it("rejects unsupported $schema_version", () => {
    const issues = validateConfig({ $schema_version: "9.9" as unknown as "1.0" });
    expect(issues.some((i) => i.path === "$schema_version")).toBe(true);
  });

  it("rejects invalid copy.tone", () => {
    const issues = validateConfig({
      copy: { tone: "boring" as unknown as "casual" },
    });
    expect(issues.some((i) => i.path === "copy.tone")).toBe(true);
  });

  it("rejects invalid runtime.offline.policy", () => {
    const issues = validateConfig({
      runtime: { offline: { policy: "abandon" as unknown as "cache" } },
    });
    expect(issues.some((i) => i.path === "runtime.offline.policy")).toBe(true);
  });

  it("rejects negative mobility values (0 is allowed for digital verticals)", () => {
    expect(
      validateConfig({ mobility: { walking_meters_per_minute: 0 } }).filter((i) =>
        i.path.startsWith("mobility"),
      ),
    ).toEqual([]);
    expect(
      validateConfig({ mobility: { walking_meters_per_minute: -10 } }).filter((i) =>
        i.path.startsWith("mobility"),
      ),
    ).not.toEqual([]);
  });
});

describe("BUILT_IN_DOMAINS", () => {
  it("ships exactly the four advertised verticals", () => {
    expect(Object.keys(BUILT_IN_DOMAINS).sort()).toEqual(["dining", "ecommerce", "social", "travel"]);
  });

  it("ecommerce overrides the CTA copy keys", () => {
    expect(BUILT_IN_DOMAINS.ecommerce?.copy_overrides?.["action.take_me_there"]).toBe("Add to cart");
  });
});
