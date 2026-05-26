/**
 * Sanity tests for the hand-written JSON Schema export. This file does NOT do
 * full Ajv-based validation (no Ajv dep) — it asserts the schema's top-level
 * shape is well-formed and stays in sync with the example configs by checking
 * every example's keys are declared in the schema. Drift between schema.ts and
 * hade-config.schema.json shows up as a missing key here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, "..", "..", "..", "schema", "hade-config.schema.json");
const EXAMPLES_DIR = join(HERE, "..", "..", "..", "examples", "configs");

interface JsonSchemaShape {
  $schema: string;
  $id: string;
  title: string;
  type: string;
  properties: Record<string, unknown>;
  $defs?: Record<string, unknown>;
}

function readSchema(): JsonSchemaShape {
  return JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as JsonSchemaShape;
}

function readExample(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(EXAMPLES_DIR, `${name}.config.json`), "utf8"),
  ) as Record<string, unknown>;
}

describe("hade-config.schema.json — file shape", () => {
  it("is valid JSON and declares its draft", () => {
    const schema = readSchema();
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe("https://hade.dev/schema/config/v1.json");
    expect(schema.title).toBe("HadeConfig");
    expect(schema.type).toBe("object");
  });

  it("declares every top-level HadeConfig property", () => {
    const schema = readSchema();
    const expectedKeys = [
      "$schema_version",
      "product",
      "defaults",
      "domains",
      "active_domain",
      "confidence",
      "timeouts",
      "weights",
      "scoring",
      "copy",
      "mobility",
      "runtime",
      "adapters",
      "metadata",
    ];
    for (const key of expectedKeys) {
      expect(schema.properties).toHaveProperty(key);
    }
  });

  it("declares the four shared $defs used across the surface", () => {
    const schema = readSchema();
    expect(schema.$defs).toBeDefined();
    const defs = Object.keys(schema.$defs ?? {}).sort();
    expect(defs).toEqual([
      "AdapterMetadata",
      "ConfidenceBands",
      "ConfidenceLabels",
      "DomainConfig",
      "ScoringProfile",
    ]);
  });
});

describe("hade-config.schema.json — drift check against example configs", () => {
  it.each(["dining", "social", "travel", "ecommerce"])(
    "every top-level key in %s.config.json is declared in the schema",
    (vertical) => {
      const schema = readSchema();
      const example = readExample(vertical);
      for (const key of Object.keys(example)) {
        expect(schema.properties).toHaveProperty(key);
      }
    },
  );
});
