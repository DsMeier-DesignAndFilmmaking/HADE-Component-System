/**
 * @hade/core/adapters/defaults — sub-path entry for the built-in default adapters.
 *
 * Re-exports the no-op adapter factories that ship with @hade/core. These are
 * the implicit slot-fillers `createHade({})` uses when the caller wires only a
 * partial bundle.
 */

export { emptyVenues } from "./emptyVenues.js";
export type { EmptyVenuesOptions } from "./emptyVenues.js";

export { noopLLM } from "./noopLLM.js";
export type { NoopLLMOptions } from "./noopLLM.js";

export { memoryCache } from "./memoryCache.js";
export type { MemoryCacheOptions } from "./memoryCache.js";
