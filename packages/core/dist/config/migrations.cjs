'use strict';

// src/config/migrations.ts
var CURRENT_SCHEMA_VERSION = "1.0";
var MIGRATIONS = [
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
    apply: (raw) => {
      if (!isPlainObject(raw)) return raw;
      if (typeof raw.$schema_version === "string") return raw;
      return {
        ...raw,
        $schema_version: "1.0"
      };
    }
  }
  // Future: { from: "1.0", to: "1.1", apply: ... } for additive minor releases
  // Future: { from: "1.x", to: "2.0", apply: ... } for breaking major releases
];
function migrateConfig(raw) {
  let migrated = raw;
  for (const step of MIGRATIONS) {
    migrated = step.apply(migrated);
  }
  return migrated;
}
function detectSchemaVersion(raw) {
  if (!isPlainObject(raw)) return "unknown";
  const version = raw.$schema_version;
  if (typeof version !== "string") return "v0";
  if (version === "1.0") return "1.0";
  return "unknown";
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

exports.CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
exports.detectSchemaVersion = detectSchemaVersion;
exports.migrateConfig = migrateConfig;
//# sourceMappingURL=migrations.cjs.map
//# sourceMappingURL=migrations.cjs.map