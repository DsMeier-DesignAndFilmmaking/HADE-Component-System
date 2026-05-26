/**
 * emptyVenues — a VenueAdapter that always returns `[]`.
 *
 * Used as the bundle default when no real venue provider is wired. The engine's
 * existing fallback chain (synthetic Tier 2 → static Tier 3) takes over from
 * there, preserving the no-Places-key path that already works in the demo.
 */

import type { VenueAdapter, VenueCandidate } from "../../types/adapters.js";

export interface EmptyVenuesOptions {
  readonly id?: string;
}

export function emptyVenues(options: EmptyVenuesOptions = {}): VenueAdapter {
  const id = options.id ?? "empty_venues@1.0.0";
  const EMPTY: VenueCandidate[] = [];
  return {
    id,
    async searchNearby(): Promise<VenueCandidate[]> {
      return EMPTY;
    },
    async searchMultiQuery(): Promise<VenueCandidate[]> {
      return EMPTY;
    },
    async searchForContext(): Promise<VenueCandidate[]> {
      return EMPTY;
    },
  };
}
