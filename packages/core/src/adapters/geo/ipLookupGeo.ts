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

import type { GeoAdapter, GeoCoords } from "../../types/adapters.js";
import { DEFAULT_HADE_CONFIG } from "../../config/defaults.js";

export interface IpLookupGeoOptions {
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

function defaultParse(response: unknown): GeoCoords | null {
  if (!response || typeof response !== "object") return null;
  const obj = response as Record<string, unknown>;
  const lat = typeof obj.latitude === "number" ? obj.latitude : Number(obj.latitude);
  const lng = typeof obj.longitude === "number" ? obj.longitude : Number(obj.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

export function ipLookupGeo(options: IpLookupGeoOptions = {}): GeoAdapter {
  const id = options.id ?? "ip_lookup@1.0.0";
  const endpoint = options.endpoint ?? "https://ipapi.co/json/";
  const timeoutMs = options.timeoutMs ?? DEFAULT_HADE_CONFIG.timeouts.geo_ms;
  const parse = options.parse ?? defaultParse;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id,
    async resolveCoords(): Promise<GeoCoords | null> {
      try {
        const response = await fetchImpl(endpoint, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return null;
        const json = await response.json();
        return parse(json);
      } catch {
        // Network failure, timeout, or JSON parse failure — never throw.
        return null;
      }
    },
  };
}
