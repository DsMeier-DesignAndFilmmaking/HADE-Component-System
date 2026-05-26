/**
 * @hade/core/adapters/geo — sub-path entry for the bundled geo adapters.
 *
 * Re-exports every runtime-agnostic geo factory shipped with @hade/core. None
 * of these touch host-only APIs (purity rules forbid it) — they accept their
 * dependencies as parameters. Host-specific geo lives in the consumer app.
 */

export { staticGeo } from "./staticGeo.js";
export type { StaticGeoOptions } from "./staticGeo.js";

export { headerGeo } from "./headerGeo.js";
export type { HeaderGeoOptions, HeaderSource } from "./headerGeo.js";

export { ipLookupGeo } from "./ipLookupGeo.js";
export type { IpLookupGeoOptions } from "./ipLookupGeo.js";

export { compositeGeo } from "./compositeGeo.js";
export type { CompositeGeoOptions } from "./compositeGeo.js";
