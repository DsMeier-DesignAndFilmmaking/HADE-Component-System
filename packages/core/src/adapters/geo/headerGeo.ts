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

import type { GeoAdapter, GeoCoords } from "../../types/adapters.js";

/** Anything that can hand back a header value by key, case-insensitively. */
export interface HeaderSource {
  get(name: string): string | null;
}

export interface HeaderGeoOptions {
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

const DEFAULT_HEADER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["x-vercel-ip-latitude", "x-vercel-ip-longitude"],
  ["cf-iplatitude", "cf-iplongitude"],
  ["fly-client-ip-lat", "fly-client-ip-lng"],
];

function parseCoord(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function headerGeo(options: HeaderGeoOptions): GeoAdapter {
  const id = options.id ?? "header@1.0.0";
  const pairs = options.latLngHeaders ?? DEFAULT_HEADER_PAIRS;

  return {
    id,
    async resolveCoords(): Promise<GeoCoords | null> {
      const headers = options.getHeaders();
      if (!headers) return null;
      for (const [latName, lngName] of pairs) {
        const lat = parseCoord(headers.get(latName));
        const lng = parseCoord(headers.get(lngName));
        if (lat !== null && lng !== null) return { lat, lng };
      }
      return null;
    },
  };
}
