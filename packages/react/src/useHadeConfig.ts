"use client";

/**
 * useHadeConfig — returns the fully-resolved HadeConfig from the active
 * client. Useful for rendering settings/debug UI, deriving locale-dependent
 * strings, or asserting on `config_hash` for analytics.
 *
 * The returned config is stable across renders (the client itself caches it),
 * so use it directly in deps arrays without `useMemo`.
 */
import type { ResolvedHadeConfig } from "@hade/core";
import { useHadeClient } from "./HadeProvider.js";

export function useHadeConfig(): ResolvedHadeConfig {
  return useHadeClient().getConfig();
}
