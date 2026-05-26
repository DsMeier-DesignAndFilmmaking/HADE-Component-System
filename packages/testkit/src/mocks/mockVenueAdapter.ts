import type {
  VenueAdapter,
  VenueCandidate,
  VenueContextLike,
  VenueMultiQueryOptions,
  VenueSearchNearbyOptions,
} from "@hade/core";

export interface MockVenueAdapterOptions {
  readonly id?: string;
  /**
   * Canned candidate sequence. Each call to a search method consumes the next
   * batch in order; once exhausted, subsequent calls return `[]`. Set
   * `loop: true` to cycle back to the start instead.
   */
  readonly batches?: ReadonlyArray<readonly VenueCandidate[]>;
  /** Cycle through `batches` indefinitely instead of returning empty when exhausted. */
  readonly loop?: boolean;
  /** Throw on every call. Useful for testing failure paths. */
  readonly alwaysFail?: boolean | Error;
}

export interface MockVenueAdapter extends VenueAdapter {
  /** Mutable call log for inspection in tests. */
  readonly calls: ReadonlyArray<VenueAdapterCall>;
  /** Reset the call log and rewind the batch cursor. */
  reset(): void;
}

export type VenueAdapterCall =
  | { kind: "searchNearby"; args: VenueSearchNearbyOptions }
  | { kind: "searchMultiQuery"; args: VenueMultiQueryOptions }
  | { kind: "searchForContext"; args: VenueContextLike; categories: string[] };

/**
 * Scripted VenueAdapter. Unlike `emptyVenues()` (which returns `[]` every
 * call), this consumes a queue of canned batches AND records every call so
 * tests can assert on arguments and call order.
 *
 * @example
 *   const venue = mockVenueAdapter({
 *     batches: [[makeVenueCandidate(), makeVenueCandidate()]],
 *   });
 *   await client.decide({ geo: { lat: 40, lng: -74 } });
 *   expect(venue.calls).toHaveLength(1);
 *   expect(venue.calls[0].kind).toBe("searchForContext");
 */
export function mockVenueAdapter(options: MockVenueAdapterOptions = {}): MockVenueAdapter {
  const id = options.id ?? "mock_venue@1.0.0";
  const batches = options.batches ?? [];
  const calls: VenueAdapterCall[] = [];
  let cursor = 0;

  function nextBatch(): VenueCandidate[] {
    if (batches.length === 0) return [];
    if (cursor >= batches.length) {
      if (options.loop) cursor = 0;
      else return [];
    }
    const batch = batches[cursor]!;
    cursor++;
    return [...batch];
  }

  function maybeThrow(): void {
    if (options.alwaysFail) {
      if (options.alwaysFail instanceof Error) throw options.alwaysFail;
      throw new Error(`${id}: mock adapter configured to always fail`);
    }
  }

  return {
    id,
    calls,
    reset(): void {
      calls.length = 0;
      cursor = 0;
    },
    async searchNearby(args): Promise<VenueCandidate[]> {
      calls.push({ kind: "searchNearby", args });
      maybeThrow();
      return nextBatch();
    },
    async searchMultiQuery(args): Promise<VenueCandidate[]> {
      calls.push({ kind: "searchMultiQuery", args });
      maybeThrow();
      return nextBatch();
    },
    async searchForContext(args, categories): Promise<VenueCandidate[]> {
      calls.push({ kind: "searchForContext", args, categories: [...categories] });
      maybeThrow();
      return nextBatch();
    },
  };
}
