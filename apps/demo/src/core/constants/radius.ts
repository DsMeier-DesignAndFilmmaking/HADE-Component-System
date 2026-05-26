// Radius constants (metres) — single source of truth for all object-placement
// and search-radius defaults across the HADE engine and API layer.

export const RADIUS = {
  /** Default Places API search radius. Matched by places.ts DEFAULT_RADIUS_M. */
  SEARCH_DEFAULT: 800,
  /** Footprint of static fallback SpontaneousObjects (no real distance available). */
  FALLBACK_STATIC: 500,
  /** Normalization floor: applied when an object arrives with no radius field. */
  OBJECT_NORMALIZE_MIN: 100,
  /** Default footprint for newly created user activities. */
  ACTIVITY_CREATION: 150,
} as const;
