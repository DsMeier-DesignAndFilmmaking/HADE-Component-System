import { b as GeoCoords, G as GeoAdapter } from '../../adapters-2-CsI3Kq.js';

/**
 * staticGeo — fixed coordinates. Useful for tests, demos, and fallback chains.
 *
 * The simplest GeoAdapter: returns the same coords forever. Combine with
 * {@link compositeGeo} as the last link in a chain to guarantee a non-null
 * result.
 */

interface StaticGeoOptions {
    readonly id?: string;
    readonly coords: GeoCoords;
}
declare function staticGeo(options: StaticGeoOptions): GeoAdapter;

/**
 * headerGeo — resolves coordinates from request headers.
 *
 * Works with Vercel (`x-vercel-ip-latitude` / `x-vercel-ip-longitude`),
 * Cloudflare (`cf-iplatitude` / `cf-iplongitude`), Fly.io, and any platform that
 * forwards lat/lng as headers.
 *
 * Header source is injected — the caller (typically a route handler) holds the
 * request and passes its headers to the resolver. This keeps @hade/core pure
 * (no DOM, no `Request`-specific API assumptions).
 *
 * Usage:
 *   const geo = headerGeo({ getHeaders: () => req.headers });
 *   const coords = await geo.resolveCoords();
 */

/** Anything that can hand back a header value by key, case-insensitively. */
interface HeaderSource {
    get(name: string): string | null;
}
interface HeaderGeoOptions {
    readonly id?: string;
    /**
     * Called per resolve to obtain the current request's headers. Returning
     * `null` (e.g. no request in scope) short-circuits to `resolveCoords() → null`.
     */
    readonly getHeaders: () => HeaderSource | null;
    /**
     * Header name pairs to probe in order. The first pair where BOTH headers
     * parse as finite numbers wins.
     *
     * Defaults cover Vercel, Cloudflare, and Fly.io.
     */
    readonly latLngHeaders?: ReadonlyArray<readonly [string, string]>;
}
declare function headerGeo(options: HeaderGeoOptions): GeoAdapter;

/**
 * ipLookupGeo — resolves coordinates by fetching an IP-geolocation endpoint.
 *
 * Default endpoint is `ipapi.co/json/` (no key required for low volumes). The
 * caller can override with any endpoint that returns `{ latitude, longitude }`
 * as JSON, or supply a custom `parse` function for non-conforming providers.
 *
 * Uses the platform-standard `fetch` — works in Node 18+, Bun, Deno, browsers,
 * Cloudflare Workers, and Vercel Edge.
 */

interface IpLookupGeoOptions {
    readonly id?: string;
    /** Defaults to `https://ipapi.co/json/`. */
    readonly endpoint?: string;
    /** Per-call hard deadline. Defaults to 3000 ms (matches existing app behavior). */
    readonly timeoutMs?: number;
    /** Optional custom response parser for non-ipapi providers. */
    readonly parse?: (response: unknown) => GeoCoords | null;
    /** Optional fetch override for testing / non-global fetch contexts. */
    readonly fetchImpl?: typeof fetch;
}
declare function ipLookupGeo(options?: IpLookupGeoOptions): GeoAdapter;

/**
 * compositeGeo — chains GeoAdapters and returns the first non-null result.
 *
 * v1.0 replacement for the multi-stage geolocation cascade currently in
 * `src/lib/hade/useHade.ts:188-272` (browser → IP → stored → static).
 *
 * Each adapter is tried in order; the first to return a non-null coordinate
 * wins. If all return null, the composite returns null — preserving the
 * existing "geo source: unknown → suppress Places fetch" invariant at the
 * route boundary.
 *
 * Composition example:
 *   const geo = compositeGeo(
 *     headerGeo({ getHeaders: () => req.headers }),  // server header geo first
 *     ipLookupGeo(),                                 // then IP lookup
 *     staticGeo({ coords: DEFAULT_GEO }),            // always-wins last fallback
 *   );
 */

interface CompositeGeoOptions {
    readonly id?: string;
}
declare function compositeGeo(...chain: readonly GeoAdapter[]): GeoAdapter;
declare function compositeGeo(options: CompositeGeoOptions, ...chain: readonly GeoAdapter[]): GeoAdapter;

export { type CompositeGeoOptions, type HeaderGeoOptions, type HeaderSource, type IpLookupGeoOptions, type StaticGeoOptions, compositeGeo, headerGeo, ipLookupGeo, staticGeo };
