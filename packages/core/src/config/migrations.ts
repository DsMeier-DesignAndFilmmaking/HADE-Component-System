/**
 * HadeConfig migration registry.
 *
 * Configs lacking `$schema_version` are treated as **v0** (the Phase C/D/E
 * shape — `defaults`, `confidence`, `timeouts`, `weights`, `scoring`,
 * `metadata` only) and silently auto-upgraded to v1.0 per the approved plan
 * (OQ2: silent migration, no warning, no breaking change).
 *
 * Existing Phase C/D/E callers (`createHade({ config: { defaults: { radius_meters: 1000 } } })`)
 * see zero behavioral change — they keep working unchanged.
 *
 * Versioning rules:
 *   • Minor bumps (1.0 → 1.1) are additive only. No migration needed.
 *   • Major bumps (1.x → 2.0) require a new entry here.
 *   • Migrations are idempotent — re-applying a migration to an already-migrated
 *     config is a no-op.
 *
 * See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md §2-3
 */

import type { HadeSchemaVersion } from "./schema.js";

/** Latest supported schema version. Bump in lockstep with HadeSchemaVersion. */
export const CURRENT_SCHEMA_VERSION: HadeSchemaVersion = "1.0";

type MigrationStep = (raw: unknown) => unknown;

interface MigrationEntry {
  readonly from: "v0" | HadeSchemaVersion;
  readonly to: HadeSchemaVersion;
  readonly apply: MigrationStep;
}

const MIGRATIONS: readonly MigrationEntry[] = [
  /**
   * v0 → 1.0
   *
   * Detects: input is a plain object lacking `$schema_version`.
   *
   * Action: stamp `$schema_version: "1.0"` onto the input. The existing v0
   * fields (`defaults`, `confidence`, `timeouts`, `weights`, `scoring`,
   * `metadata`) keep their structure and pass through to validation
   * unchanged — the v1.0 schema is a strict superset.
   *
   * Specifically, NOT moving `defaults.radius_meters` into `domains.dining.default_radius_meters` —
   * the v1.0 schema keeps `defaults` as the global fallback layer applied
   * after per-domain settings. Legacy consumers still see their override take
   * effect via the same field path.
   */
  {
    from: "v0",
    to: "1.0",
    apply: (raw: unknown): unknown => {
      if (!isPlainObject(raw)) return raw;
      if (typeof raw.$schema_version === "string") return raw; // idempotent
      return {
        ...raw,
        $schema_version: "1.0" as const,
      };
    },
  },
  // Future: { from: "1.0", to: "1.1", apply: ... } for additive minor releases
  // Future: { from: "1.x", to: "2.0", apply: ... } for breaking major releases
];

/**
 * Walks the migration registry, applying each step in order. Returns the input
 * upgraded to {@link CURRENT_SCHEMA_VERSION}. Idempotent — re-running on an
 * already-upgraded config yields the same shape (each step short-circuits).
 *
 * The function NEVER throws. Invalid input shapes (non-objects, null) are
 * returned unchanged so the downstream validator can produce a single,
 * structured error pointing at the offending field.
 */
export function migrateConfig(raw: unknown): unknown {
  let migrated: unknown = raw;
  for (const step of MIGRATIONS) {
    migrated = step.apply(migrated);
  }
  return migrated;
}

/**
 * Detects the schema version of an arbitrary input. Returns `"v0"` for any
 * object lacking `$schema_version`, the literal version for any object
 * declaring one, and `"unknown"` for non-objects.
 */
export function detectSchemaVersion(raw: unknown): "v0" | HadeSchemaVersion | "unknown" {
  if (!isPlainObject(raw)) return "unknown";
  const version = raw.$schema_version;
  if (typeof version !== "string") return "v0";
  if (version === "1.0") return "1.0";
  // Unrecognized version literals fall through to "unknown" — the validator
  // will produce a clear error at `$schema_version` rather than silently
  // pretending the config is v0 or v1.0.
  return "unknown";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
