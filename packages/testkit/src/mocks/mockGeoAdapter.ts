import type { GeoAdapter, GeoCoords } from "@hade/core";

export interface MockGeoAdapterOptions {
  readonly id?: string;
  /**
   * Coord sequence consumed by `resolveCoords()`. After the queue is drained
   * the adapter returns `null` (matching the runtime contract for failed geo).
   * Pass `null` as an entry to simulate a per-call resolution failure.
   */
  readonly coords?: ReadonlyArray<GeoCoords | null>;
  readonly alwaysFail?: boolean | Error;
}

export interface MockGeoAdapter extends GeoAdapter {
  readonly calls: number;
  reset(): void;
}

/**
 * Scripted GeoAdapter. Each call to `resolveCoords()` consumes the next entry
 * in `coords` and tracks call count. After exhausting the queue, subsequent
 * calls return `null`.
 *
 * @example
 *   const geo = mockGeoAdapter({
 *     coords: [{ lat: 40.71, lng: -74.01 }, null], // first ok, second fails
 *   });
 */
export function mockGeoAdapter(options: MockGeoAdapterOptions = {}): MockGeoAdapter {
  const id = options.id ?? "mock_geo@1.0.0";
  const queue = [...(options.coords ?? [])];
  let calls = 0;

  return {
    id,
    get calls() {
      return calls;
    },
    reset(): void {
      calls = 0;
      queue.length = 0;
      queue.push(...(options.coords ?? []));
    },
    async resolveCoords(): Promise<GeoCoords | null> {
      calls++;
      if (options.alwaysFail) {
        if (options.alwaysFail instanceof Error) throw options.alwaysFail;
        throw new Error(`${id}: mock adapter configured to always fail`);
      }
      if (queue.length === 0) return null;
      return queue.shift() ?? null;
    },
  };
}
