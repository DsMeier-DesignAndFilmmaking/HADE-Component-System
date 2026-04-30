/**
 * PlacesAdapter
 *
 * Decouples the Tier 2 synthetic engine from the Google Places service.
 * Callers pass a HadeContext + resolved category list; the adapter extracts
 * the required geo/intent/radius fields and delegates to fetchNearbyGrounded.
 *
 * Why this boundary exists:
 *   - synthetic.ts should not need to know about FetchNearbyOptions shape
 *   - Testing the engine with mock candidates requires swapping at this seam
 *   - Future provider swaps (Mapbox, Foursquare) change only this file
 */

import "server-only";

import { fetchNearbyGrounded } from "@/core/services/places";
import type { HadeContext, PlaceOption } from "@/types/hade";

/**
 * Fetches nearby venue candidates for the given context and category list.
 *
 * @param context    - Full HADE request context (geo, intent, radius extracted internally)
 * @param categories - Ordered list of Google Place types to request.
 *                     Pass [] to trigger the broadest possible search.
 * @returns PlaceOption[] — always resolves; returns [] on any error or missing geo.
 */
export async function getPlacesCandidates(
  context: HadeContext,
  categories: string[],
): Promise<PlaceOption[]> {
  const geo = context.geo ?? null;

  if (!geo || !geo.lat || !geo.lng) {
    return [];
  }

  const intent = (context.situation?.intent as string | undefined) || undefined;
  const radius = (context as unknown as { radius_meters?: number }).radius_meters ?? 800;

  return fetchNearbyGrounded({
    geo,
    intent,
    target_categories: categories,
    radius_meters: radius,
    open_now: true,
  });
}
