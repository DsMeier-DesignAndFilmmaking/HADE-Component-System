/**
 * unwrappedGooglePlaces — byte-identical legacy shim.
 *
 * Wraps the existing in-tree `fetchNearbyGrounded` (and optionally
 * `fetchMultiQueryGrounded`) from `src/core/services/places.ts` as a
 * {@link VenueAdapter}. Lets the route adopt the adapter API in Phase E with
 * **zero behavior delta** — same fetch, same field mask, same timeout, same
 * field shapes — by passing the existing functions as deps.
 *
 * Removable in v2.0 once the route is fully migrated to a clean-room
 * `googlePlaces()` adapter.
 *
 * See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md §4
 */

import { createVenueAdapter } from "../adapters/registry.js";
import type {
  VenueAdapter,
  VenueCandidate,
  VenueContextLike,
  VenueMultiQueryOptions,
  VenueSearchNearbyOptions,
} from "../types/adapters.js";

/**
 * Loose shape for the legacy in-tree options object. The shim doesn't import
 * any app types — callers pass whatever their `fetchNearbyGrounded` accepts.
 */
export interface LegacyFetchNearbyOptions {
  geo: { lat: number; lng: number };
  radius_meters?: number;
  intent?: string;
  target_categories?: string[];
  open_now?: boolean;
  max_results?: number;
}

export interface LegacyMultiQueryOptions {
  geo: { lat: number; lng: number };
  categoryBuckets: string[][];
  radius_meters: number;
  open_now?: boolean;
}

export interface UnwrappedGooglePlacesDeps {
  readonly fetchNearbyGrounded: (
    opts: LegacyFetchNearbyOptions,
  ) => Promise<readonly VenueCandidate[]>;
  /** Optional. If omitted, `searchMultiQuery` falls through to a single search. */
  readonly fetchMultiQueryGrounded?: (
    opts: LegacyMultiQueryOptions,
  ) => Promise<readonly VenueCandidate[]>;
  /** Adapter id surfaced in logs. Defaults to `"google_places_legacy@0.0.0"`. */
  readonly id?: string;
  /** Default radius applied when `searchForContext` is called without one. */
  readonly defaultRadiusMeters?: number;
}

export function unwrappedGooglePlaces(deps: UnwrappedGooglePlacesDeps): VenueAdapter {
  const id = deps.id ?? "google_places_legacy@0.0.0";
  const defaultRadiusMeters = deps.defaultRadiusMeters ?? 800;

  return createVenueAdapter({
    id,
    searchNearby: async (options: VenueSearchNearbyOptions) => {
      const result = await deps.fetchNearbyGrounded({
        geo: options.geo,
        radius_meters: options.radius_meters,
        intent: options.intent,
        target_categories: options.target_categories ? [...options.target_categories] : undefined,
        open_now: options.open_now,
        max_results: options.max_results,
      });
      return [...result];
    },
    searchMultiQuery: async (options: VenueMultiQueryOptions) => {
      if (deps.fetchMultiQueryGrounded) {
        const result = await deps.fetchMultiQueryGrounded({
          geo: options.geo,
          categoryBuckets: options.categoryBuckets.map((bucket) => [...bucket]),
          radius_meters: options.radius_meters,
          open_now: options.open_now,
        });
        return [...result];
      }
      // No multi-query provided — fall through to a single flat search across
      // the union of all buckets. Matches the engine's expectation: dedupe by id.
      const allCategories = Array.from(new Set(options.categoryBuckets.flat()));
      const result = await deps.fetchNearbyGrounded({
        geo: options.geo,
        radius_meters: options.radius_meters,
        target_categories: allCategories,
        open_now: options.open_now,
      });
      return [...result];
    },
    searchForContext: async (context: VenueContextLike, categories: string[]) => {
      const geo = context.geo;
      if (!geo) return [];
      const intent = context.situation?.intent ?? undefined;
      const radius = context.radius_meters ?? defaultRadiusMeters;
      const result = await deps.fetchNearbyGrounded({
        geo,
        intent: intent ?? undefined,
        target_categories: categories,
        radius_meters: radius,
        open_now: true,
      });
      return [...result];
    },
  });
}
