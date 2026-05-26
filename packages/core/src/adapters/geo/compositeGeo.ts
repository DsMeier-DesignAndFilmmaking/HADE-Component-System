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

import type { GeoAdapter, GeoCoords } from "../../types/adapters.js";

export interface CompositeGeoOptions {
  readonly id?: string;
}

export function compositeGeo(
  ...chain: readonly GeoAdapter[]
): GeoAdapter;
export function compositeGeo(
  options: CompositeGeoOptions,
  ...chain: readonly GeoAdapter[]
): GeoAdapter;
export function compositeGeo(
  first: CompositeGeoOptions | GeoAdapter,
  ...rest: readonly GeoAdapter[]
): GeoAdapter {
  const isOptions =
    first !== undefined &&
    typeof first === "object" &&
    !("resolveCoords" in first);

  const options: CompositeGeoOptions = isOptions ? first : {};
  const adapters: readonly GeoAdapter[] = isOptions
    ? rest
    : ([first as GeoAdapter, ...rest] as readonly GeoAdapter[]);

  const id = options.id ?? "composite@1.0.0";

  return {
    id,
    async resolveCoords(): Promise<GeoCoords | null> {
      for (const adapter of adapters) {
        try {
          const coords = await adapter.resolveCoords();
          if (coords) return coords;
        } catch {
          // Individual adapter failures are non-fatal — try the next link.
        }
      }
      return null;
    },
  };
}
