/**
 * staticGeo — fixed coordinates. Useful for tests, demos, and fallback chains.
 *
 * The simplest GeoAdapter: returns the same coords forever. Combine with
 * {@link compositeGeo} as the last link in a chain to guarantee a non-null
 * result.
 */

import type { GeoAdapter, GeoCoords } from "../../types/adapters.js";

export interface StaticGeoOptions {
  readonly id?: string;
  readonly coords: GeoCoords;
}

export function staticGeo(options: StaticGeoOptions): GeoAdapter {
  const id = options.id ?? "static@1.0.0";
  const coords = options.coords;
  return {
    id,
    async resolveCoords(): Promise<GeoCoords | null> {
      return coords;
    },
  };
}
