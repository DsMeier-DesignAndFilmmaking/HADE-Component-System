/**
 * @hade/core/legacy — byte-identical migration shims.
 *
 * Wrap existing in-tree functions as adapter implementations so call sites can
 * adopt the SDK adapter API in Phase E with zero behavior delta. These are
 * intentionally minimal: they take the legacy function as a dep, never import
 * any app types, never normalize behavior. Removable in v2.0 once consumers
 * migrate to the clean-room adapters in `@hade/adapters-*`.
 */

export { unwrappedGooglePlaces } from "./unwrappedGooglePlaces.js";
export type {
  LegacyFetchNearbyOptions,
  LegacyMultiQueryOptions,
  UnwrappedGooglePlacesDeps,
} from "./unwrappedGooglePlaces.js";

export { legacyOpenAIAdapter } from "./legacyOpenAIAdapter.js";
export type { LegacyCopyPatch, LegacyOpenAIAdapterDeps } from "./legacyOpenAIAdapter.js";

export { legacyUpstashAdapter } from "./legacyUpstashAdapter.js";
export type { LegacyRedisClient, LegacyUpstashAdapterDeps } from "./legacyUpstashAdapter.js";
