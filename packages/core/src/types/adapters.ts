/**
 * Provider adapter contracts for @hade/core.
 * Implementations live outside core (e.g. Google Places in src/core/adapters).
 */

/** Adapter discriminator used in errors, logs, and capability dispatch. */
export type AdapterKind = "venue" | "llm" | "cache" | "geo";

/** WGS-84 coordinate pair. */
export interface GeoCoords {
  lat: number;
  lng: number;
}

/**
 * Optional health snapshot. Cheap and synchronous — must NOT perform network I/O.
 * Returned by the optional `health()` method on any adapter that wants to expose
 * readiness for monitoring or pre-flight checks.
 */
export interface AdapterHealth {
  readonly status: "ok" | "degraded" | "unconfigured";
  readonly detail?: string;
  /** Milliseconds since the most recent successful call, or null if never called. */
  readonly lastSuccessAgoMs: number | null;
}

/**
 * Normalized venue candidate returned by {@link VenueAdapter}.
 * Structurally compatible with app `PlaceOption`.
 */
export interface VenueCandidate {
  id: string;
  name: string;
  category: string;
  vibe: string;
  geo: GeoCoords;
  distance_meters: number;
  is_open: boolean;
  address?: string;
  place_name?: string;
  location_label?: string;
  location_source?: string;
  place_id?: string;
  rating?: number;
  price_level?: number;
  types?: string[];
  isUGC?: boolean;
  created_at?: string;
  expires_at?: string;
}

/** Options for a single nearby venue search. */
export interface VenueSearchNearbyOptions {
  geo: GeoCoords;
  radius_meters?: number;
  intent?: string;
  target_categories?: string[];
  open_now?: boolean;
  max_results?: number;
}

/** Parallel bucketed search (domain / lens multi-query). */
export interface VenueMultiQueryOptions {
  geo: GeoCoords;
  categoryBuckets: string[][];
  radius_meters: number;
  open_now?: boolean;
}

/**
 * Minimal context shape for {@link VenueAdapter.searchForContext}.
 * Compatible with app `HadeContext` without importing app types.
 */
export interface VenueContextLike {
  geo?: GeoCoords | null;
  radius_meters?: number;
  situation?: { intent?: string | null };
}

/**
 * Swappable venue data provider (Google Places, Mapbox, internal catalog, mocks).
 */
export interface VenueAdapter {
  /** Stable provider id — e.g. `"google_places"`. */
  readonly id: string;
  /**
   * Single nearby search. Must never throw; return `[]` on failure.
   */
  searchNearby(options: VenueSearchNearbyOptions): Promise<VenueCandidate[]>;
  /**
   * Parallel per-bucket search with deduplication by venue id.
   */
  searchMultiQuery(options: VenueMultiQueryOptions): Promise<VenueCandidate[]>;
  /**
   * Context-oriented search used by the synthetic engine.
   */
  searchForContext(context: VenueContextLike, categories: string[]): Promise<VenueCandidate[]>;
}

/** Reserved — LLM copy enhancement (route.ts Tier 1). */
export interface LLMAdapter {
  readonly id: string;
  enhanceCopy(
    prompt: string,
    options?: { timeout_ms?: number; model?: string },
  ): Promise<{ rationale?: string; why_now?: string; why_this?: string; decision_frame?: string } | null>;
}

/** Reserved — offline / session cache (Upstash, memory, etc.). */
export interface CacheAdapter {
  readonly id: string;
  mode(): "FULL" | "DEGRADED";
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
}

/** Reserved — client / server geolocation. */
export interface GeoAdapter {
  readonly id: string;
  resolveCoords(): Promise<GeoCoords | null>;
}

/** Bundle wired at application bootstrap via {@link registerDefaultAdapters}. */
export interface HadeAdapters {
  venue: VenueAdapter;
  llm?: LLMAdapter;
  cache?: CacheAdapter;
  geo?: GeoAdapter;
}

export type PartialHadeAdapters = {
  venue?: VenueAdapter;
  llm?: LLMAdapter;
  cache?: CacheAdapter;
  geo?: GeoAdapter;
};
