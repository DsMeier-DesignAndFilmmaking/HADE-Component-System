/**
 * @hade/adapters-memory — re-exports the in-process LRU `CacheAdapter` from
 * `@hade/core/adapters/defaults`. Exists as a standalone package so cache-only
 * consumers can install a uniformly-namespaced dependency, and so future
 * memory-cache enhancements (clustering, instrumentation) can ship without
 * forcing a @hade/core release.
 */

export { memoryCache } from "@hade/core/adapters/defaults";
export type { MemoryCacheOptions } from "@hade/core/adapters/defaults";
