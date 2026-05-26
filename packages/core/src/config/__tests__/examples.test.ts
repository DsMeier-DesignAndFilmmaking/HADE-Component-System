import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../loadConfig.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(HERE, "..", "..", "..", "examples", "configs");

function readExample(name: string): unknown {
  return JSON.parse(readFileSync(join(EXAMPLES_DIR, `${name}.config.json`), "utf8"));
}

describe("example configs — parse + materialize through loadConfig", () => {
  it("dining.config.json", () => {
    const cfg = loadConfig(readExample("dining") as Parameters<typeof loadConfig>[0]);
    expect(cfg.$schema_version).toBe("1.0");
    expect(cfg.active_domain).toBe("dining");
    expect(cfg.product?.id).toBe("table-now");
    expect(cfg.domains.dining?.default_radius_meters).toBe(2500);
    expect(cfg.scoring.profiles.balanced).toEqual({ proximity: 0.40, signal: 0.35, intent: 0.25 });
    expect(cfg.copy.tone).toBe("casual");
  });

  it("social.config.json", () => {
    const cfg = loadConfig(readExample("social") as Parameters<typeof loadConfig>[0]);
    expect(cfg.active_domain).toBe("social");
    expect(cfg.domains.social?.default_radius_meters).toBe(3500);
    expect(cfg.scoring.profiles.signal_heavy).toEqual({ proximity: 0.25, signal: 0.50, intent: 0.25 });
    expect(cfg.timeouts.adapter_ms).toBe(10000);
    expect(cfg.copy.tone).toBe("playful");
  });

  it("travel.config.json", () => {
    const cfg = loadConfig(readExample("travel") as Parameters<typeof loadConfig>[0]);
    expect(cfg.active_domain).toBe("travel");
    expect(cfg.domains.travel?.default_radius_meters).toBe(4000);
    expect(cfg.scoring.profiles.intent_heavy).toEqual({ proximity: 0.25, signal: 0.25, intent: 0.50 });
  });

  it("ecommerce.config.json — proves the open-vertical contract", () => {
    const cfg = loadConfig(readExample("ecommerce") as Parameters<typeof loadConfig>[0]);
    expect(cfg.active_domain).toBe("ecommerce");
    expect(cfg.domains.ecommerce?.default_radius_meters).toBe(0); // digital vertical
    expect(cfg.mobility.walking_meters_per_minute).toBe(0);
    expect(cfg.mobility.driving_meters_per_minute).toBe(0);
    expect(cfg.domains.ecommerce?.copy_overrides?.["action.take_me_there"]).toBe("Add to cart");
    expect(cfg.adapters.venue?.id).toBe("shopify_catalog");
    expect(cfg.metadata.vertical_kind).toBe("digital");
  });
});
