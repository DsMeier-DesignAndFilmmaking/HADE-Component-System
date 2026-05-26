import { HadeSchemaVersion } from './schema.cjs';

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

/** Latest supported schema version. Bump in lockstep with HadeSchemaVersion. */
declare const CURRENT_SCHEMA_VERSION: HadeSchemaVersion;
/**
 * Walks the migration registry, applying each step in order. Returns the input
 * upgraded to {@link CURRENT_SCHEMA_VERSION}. Idempotent — re-running on an
 * already-upgraded config yields the same shape (each step short-circuits).
 *
 * The function NEVER throws. Invalid input shapes (non-objects, null) are
 * returned unchanged so the downstream validator can produce a single,
 * structured error pointing at the offending field.
 */
declare function migrateConfig(raw: unknown): unknown;
/**
 * Detects the schema version of an arbitrary input. Returns `"v0"` for any
 * object lacking `$schema_version`, the literal version for any object
 * declaring one, and `"unknown"` for non-objects.
 */
declare function detectSchemaVersion(raw: unknown): "v0" | HadeSchemaVersion | "unknown";

export { CURRENT_SCHEMA_VERSION, detectSchemaVersion, migrateConfig };
