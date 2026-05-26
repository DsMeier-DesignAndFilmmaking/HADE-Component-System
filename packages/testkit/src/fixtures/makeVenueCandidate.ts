import type { VenueCandidate } from "@hade/core";

/**
 * Builds a {@link VenueCandidate} with sensible defaults. Pass `overrides` to
 * customize any field — IDs auto-increment globally so unique candidates are
 * easy to produce in a loop.
 *
 * @example
 *   makeVenueCandidate({ name: "Joe's", category: "restaurant" })
 *   Array.from({ length: 5 }, () => makeVenueCandidate())
 */
let counter = 0;

export function makeVenueCandidate(overrides: Partial<VenueCandidate> = {}): VenueCandidate {
  const id = `venue-${++counter}`;
  return {
    id,
    name: `Venue ${counter}`,
    category: "restaurant",
    vibe: "neighborhood favorite",
    geo: { lat: 40.7128, lng: -74.006 },
    distance_meters: 250,
    is_open: true,
    rating: 4.5,
    ...overrides,
  };
}

/** Resets the auto-incrementing ID counter. Call in test setup for determinism. */
export function resetVenueCandidateCounter(): void {
  counter = 0;
}
