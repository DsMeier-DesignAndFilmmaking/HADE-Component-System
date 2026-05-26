/**
 * PlacesAdapter — context-oriented venue search for the synthetic engine.
 *
 * Delegates to the registered {@link VenueAdapter} (default: Google Places).
 * Legacy export `getPlacesCandidates` is preserved for existing imports.
 */

import "server-only";

import { getVenueAdapter } from "@hade/core";
import type { HadeContext, PlaceOption } from "@/types/hade";

import "@/core/adapters/registerDefaults";

/**
 * Fetches nearby venue candidates for the given context and category list.
 *
 * @returns PlaceOption[] — always resolves; returns [] on any error or missing geo.
 */
export async function getPlacesCandidates(
  context: HadeContext,
  categories: string[],
): Promise<PlaceOption[]> {
  const adapter = getVenueAdapter();
  const results = await adapter.searchForContext(
    {
      geo: context.geo ?? null,
      radius_meters: context.radius_meters,
      situation: context.situation,
    },
    categories,
  );
  return results as PlaceOption[];
}
