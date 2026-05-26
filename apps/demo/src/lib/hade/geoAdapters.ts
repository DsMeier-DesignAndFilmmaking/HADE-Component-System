/**
 * Browser-side {@link GeoAdapter} factories.
 *
 * These live in the app (not in `@hade/core`) so they can touch DOM APIs
 * (`navigator.geolocation`, `localStorage`) which the @hade/core purity audit
 * forbids. They produce the same `GeoAdapter` interface as the runtime-agnostic
 * factories shipped by @hade/core (`ipLookupGeo`, `staticGeo`, etc.) so they
 * compose freely with `compositeGeo`.
 *
 * Used by {@link useHade} to assemble the geo cascade that previously lived
 * inline at `src/lib/hade/useHade.ts:188-272`. Each adapter preserves the
 * exact behavior of the legacy path it replaces:
 *
 *   • `browserGeo`   → wraps `navigator.geolocation.getCurrentPosition` with
 *                      the same 8000 ms timeout + 60 s maximumAge.
 *   • `scenarioGeo`  → returns the developer-supplied URL-param override.
 *   • `storedGeo`    → reads/writes `hade_last_known_geo` from localStorage,
 *                      mirroring `loadLastKnownGeo` / `saveLastKnownGeo`.
 *
 * Source identification: each adapter sets a stable `id` so a cascade
 * orchestrator can tag the winning result with its semantic `GeoSource`
 * (`"browser"` / `"scenario"` / `"stored"` / etc.).
 */

"use client";

import type { GeoAdapter, GeoCoords } from "@hade/core";

// ─── browserGeo ───────────────────────────────────────────────────────────────

export interface BrowserGeoOptions {
  /** Hard timeout passed to `navigator.geolocation.getCurrentPosition`. */
  readonly timeoutMs?: number;
  /** Max-age for cached browser fixes. */
  readonly maximumAgeMs?: number;
  /** Optional callback fired with the fix so the caller can refresh stored copy. */
  readonly onSuccess?: (geo: GeoCoords) => void;
  /** Override the adapter id surfaced in logs. */
  readonly id?: string;
}

/**
 * Wraps `navigator.geolocation.getCurrentPosition` as a `GeoAdapter`. Returns
 * `null` when geolocation is unavailable OR the user denies the permission
 * prompt — preserving the legacy fallback-chain semantics.
 */
export function browserGeo(options: BrowserGeoOptions = {}): GeoAdapter {
  const id = options.id ?? "browser@1.0.0";
  const timeoutMs = options.timeoutMs ?? 8000;
  const maximumAgeMs = options.maximumAgeMs ?? 60_000;
  const onSuccess = options.onSuccess;

  return {
    id,
    async resolveCoords(): Promise<GeoCoords | null> {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        return null;
      }
      return new Promise<GeoCoords | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const geo: GeoCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            if (onSuccess) {
              try {
                onSuccess(geo);
              } catch {
                // onSuccess errors must not break geo resolution.
              }
            }
            resolve(geo);
          },
          () => resolve(null),
          { timeout: timeoutMs, maximumAge: maximumAgeMs },
        );
      });
    },
  };
}

// ─── scenarioGeo ──────────────────────────────────────────────────────────────

export interface ScenarioGeoOptions {
  /** Coords from the developer's scenario override, or null when no scenario. */
  readonly coords: GeoCoords | null | undefined;
  readonly id?: string;
}

/**
 * Returns the scenario-supplied coords when present (URL-param override used in
 * demos and dev testing). When the scenario block has no geo, resolves null so
 * the cascade moves to the next link.
 */
export function scenarioGeo(options: ScenarioGeoOptions): GeoAdapter {
  const id = options.id ?? "scenario@1.0.0";
  const coords = options.coords ?? null;
  return {
    id,
    async resolveCoords(): Promise<GeoCoords | null> {
      return coords;
    },
  };
}

// ─── storedGeo ────────────────────────────────────────────────────────────────

export interface StoredGeoOptions {
  /** localStorage key used to read/write the last-known coords. */
  readonly storageKey?: string;
  readonly id?: string;
}

const DEFAULT_STORAGE_KEY = "hade_last_known_geo";

/**
 * Reads `hade_last_known_geo` from localStorage. Rejects `(0,0)` and any
 * non-finite values — matches the legacy `loadLastKnownGeo` guard at
 * `src/lib/hade/useHade.ts:41-58`.
 */
export function storedGeo(options: StoredGeoOptions = {}): GeoAdapter {
  const id = options.id ?? "stored@1.0.0";
  const key = options.storageKey ?? DEFAULT_STORAGE_KEY;
  return {
    id,
    async resolveCoords(): Promise<GeoCoords | null> {
      if (typeof localStorage === "undefined") return null;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
        const lat = parsed.lat;
        const lng = parsed.lng;
        if (
          typeof lat === "number" &&
          typeof lng === "number" &&
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          !(lat === 0 && lng === 0)
        ) {
          return { lat, lng };
        }
        return null;
      } catch {
        return null;
      }
    },
  };
}

/** Persists a successful browser fix so subsequent sessions can re-use it. */
export function saveLastKnownGeo(geo: GeoCoords, storageKey: string = DEFAULT_STORAGE_KEY): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(geo));
  } catch {
    // localStorage unavailable (private mode, quota, SSR guard).
  }
}

// ─── Composite chain with source tracking ─────────────────────────────────────

/**
 * Names of the geo sources the cascade can resolve to. Mirrors the public
 * `GeoSource` union in `@/types/hade` plus a few internal aliases used by the
 * adapters. The cascade orchestrator maps adapter ids to one of these tags.
 */
export type ResolvedGeoSource =
  | "scenario"
  | "browser"
  | "ip"
  | "stored"
  | "unknown";

export interface CascadeLink {
  readonly source: ResolvedGeoSource;
  readonly adapter: GeoAdapter;
}

export interface CascadeResult {
  readonly geo: GeoCoords;
  readonly source: ResolvedGeoSource;
}

/**
 * Iterates the adapter chain in order; the first non-null result wins and its
 * source tag is returned alongside the coords. Designed for the `useHade`
 * geo-resolution cascade where the caller needs both the coords and the
 * provenance (the route gates the Places fetch on `source !== "unknown"`).
 *
 * A typed wrapper around `compositeGeo` that preserves source attribution —
 * vanilla `compositeGeo` collapses everything to a single `composite@1.0.0`
 * adapter id and loses the winner's identity.
 */
export async function resolveGeoChain(
  chain: readonly CascadeLink[],
  fallback: { geo: GeoCoords; source: ResolvedGeoSource },
): Promise<CascadeResult> {
  for (const link of chain) {
    try {
      const coords = await link.adapter.resolveCoords();
      if (coords) return { geo: coords, source: link.source };
    } catch {
      // Individual failures are non-fatal — try the next link.
    }
  }
  return { geo: fallback.geo, source: fallback.source };
}
