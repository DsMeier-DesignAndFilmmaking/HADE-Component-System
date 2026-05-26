import type { HadeConfig, ResolvedHadeConfig } from "@hade/core";
import { loadConfig } from "@hade/core";

/**
 * Builds a {@link ResolvedHadeConfig} by deep-merging `overrides` with
 * built-in defaults. Routes through `loadConfig` so the result has all
 * defaults filled in (built-in domains, scoring profiles, copy keys, etc.) —
 * tests can read any field without checking for `undefined`.
 *
 * @example
 *   const cfg = makeConfig({ active_domain: "ecommerce" });
 *   expect(cfg.domains.ecommerce.default_radius_meters).toBe(0);
 */
export function makeConfig(overrides: HadeConfig = {}): ResolvedHadeConfig {
  return loadConfig(overrides, { clientId: "testkit-client" });
}
