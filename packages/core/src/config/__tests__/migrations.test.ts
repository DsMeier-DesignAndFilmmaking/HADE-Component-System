import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  detectSchemaVersion,
  migrateConfig,
} from "../migrations.js";

describe("migrateConfig — v0 → v1.0 (silent auto-migration)", () => {
  it("stamps $schema_version on a Phase C/D/E shape", () => {
    const v0Input = { defaults: { radius_meters: 1000 } };
    const result = migrateConfig(v0Input) as Record<string, unknown>;
    expect(result.$schema_version).toBe("1.0");
    expect(result.defaults).toEqual({ radius_meters: 1000 });
  });

  it("preserves all existing v0 fields verbatim (no field renames)", () => {
    const v0Input = {
      defaults: { radius_meters: 1500, locale: "en-GB" },
      confidence: { bands: { high: 0.8 } },
      timeouts: { adapter_ms: 5000 },
      weights: { opportunity: { proximity: 0.5, signal: 0.3, intent: 0.2 } },
      scoring: { surfaced_once_penalty: -0.1 },
      metadata: { env: "prod" },
    };
    const result = migrateConfig(v0Input) as typeof v0Input & { $schema_version: string };
    expect(result.$schema_version).toBe("1.0");
    expect(result.defaults).toEqual(v0Input.defaults);
    expect(result.confidence).toEqual(v0Input.confidence);
    expect(result.timeouts).toEqual(v0Input.timeouts);
    expect(result.weights).toEqual(v0Input.weights);
    expect(result.scoring).toEqual(v0Input.scoring);
    expect(result.metadata).toEqual(v0Input.metadata);
  });

  it("is idempotent — re-applying yields identical output", () => {
    const v0Input = { defaults: { radius_meters: 500 } };
    const once = migrateConfig(v0Input);
    const twice = migrateConfig(once);
    expect(twice).toEqual(once);
  });

  it("passes through v1.0 inputs unchanged", () => {
    const v1Input = { $schema_version: "1.0" as const, defaults: { radius_meters: 800 } };
    const result = migrateConfig(v1Input);
    expect(result).toEqual(v1Input);
  });

  it("returns non-objects unchanged (downstream validator produces the error)", () => {
    expect(migrateConfig(null)).toBeNull();
    expect(migrateConfig(undefined)).toBeUndefined();
    expect(migrateConfig("not an object")).toBe("not an object");
    expect(migrateConfig(42)).toBe(42);
  });

  it("preserves an empty input", () => {
    const result = migrateConfig({});
    expect(result).toEqual({ $schema_version: "1.0" });
  });
});

describe("detectSchemaVersion", () => {
  it('reports "v0" for any object lacking $schema_version', () => {
    expect(detectSchemaVersion({})).toBe("v0");
    expect(detectSchemaVersion({ defaults: { radius_meters: 800 } })).toBe("v0");
  });

  it('reports "1.0" for an explicit v1.0 config', () => {
    expect(detectSchemaVersion({ $schema_version: "1.0" })).toBe("1.0");
  });

  it('reports "unknown" for unrecognized version literals', () => {
    expect(detectSchemaVersion({ $schema_version: "9.9" })).toBe("unknown");
    expect(detectSchemaVersion({ $schema_version: 1 })).toBe("v0"); // non-string → v0
  });

  it('reports "unknown" for non-objects', () => {
    expect(detectSchemaVersion(null)).toBe("unknown");
    expect(detectSchemaVersion("x")).toBe("unknown");
    expect(detectSchemaVersion([])).toBe("unknown");
  });
});

describe("CURRENT_SCHEMA_VERSION", () => {
  it("matches the v1.0 literal so callers can pin against it", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe("1.0");
  });
});
