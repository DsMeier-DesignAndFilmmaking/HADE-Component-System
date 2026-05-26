/**
 * Google Places (New API) implementation of {@link VenueAdapter}.
 * Delegates to `fetchNearbyGrounded` / `fetchMultiQueryGrounded` in services/places.ts.
 */

import "server-only";

import type {
  VenueAdapter,
  VenueContextLike,
  VenueMultiQueryOptions,
  VenueSearchNearbyOptions,
} from "@hade/core";
import { createVenueAdapter } from "@hade/core";
import {
  fetchMultiQueryGrounded,
  fetchNearbyGrounded,
} from "@/core/services/places";
import type { FetchNearbyOptions, PlaceOption } from "@/types/hade";

export const GOOGLE_PLACES_VENUE_ADAPTER_ID = "google_places" as const;

export interface GooglePlacesVenueAdapterDeps {
  searchNearby?: (opts: FetchNearbyOptions) => Promise<PlaceOption[]>;
  searchMultiQuery?: (opts: {
    geo: FetchNearbyOptions["geo"];
    categoryBuckets: string[][];
    radius_meters: number;
    open_now?: boolean;
  }) => Promise<PlaceOption[]>;
}

/**
 * Creates the default Google Places venue adapter.
 * Injectable deps support unit tests without network calls.
 */
export function createGooglePlacesVenueAdapter(
  deps: GooglePlacesVenueAdapterDeps = {},
): VenueAdapter {
  const searchNearby = deps.searchNearby ?? fetchNearbyGrounded;
  const searchMultiQuery = deps.searchMultiQuery ?? fetchMultiQueryGrounded;

  return createVenueAdapter({
    id: GOOGLE_PLACES_VENUE_ADAPTER_ID,
    searchNearby: (options: VenueSearchNearbyOptions) =>
      searchNearby({
        geo: options.geo,
        radius_meters: options.radius_meters,
        intent: options.intent as FetchNearbyOptions["intent"],
        target_categories: options.target_categories,
        open_now: options.open_now,
        max_results: options.max_results,
      }),
    searchMultiQuery: (options: VenueMultiQueryOptions) =>
      searchMultiQuery({
        geo: options.geo,
        categoryBuckets: options.categoryBuckets,
        radius_meters: options.radius_meters,
        open_now: options.open_now,
      }),
    searchForContext: (context: VenueContextLike, categories: string[]) => {
      const geo = context.geo ?? null;
      if (!geo?.lat || !geo?.lng) {
        return Promise.resolve([]);
      }

      const intent = context.situation?.intent ?? undefined;
      const radius = context.radius_meters ?? 800;

      return searchNearby({
        geo,
        intent: intent as FetchNearbyOptions["intent"],
        target_categories: categories,
        radius_meters: radius,
        open_now: true,
      });
    },
  });
}
