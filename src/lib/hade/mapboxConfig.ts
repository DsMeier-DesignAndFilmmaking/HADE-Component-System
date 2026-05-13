/**
 * Single source for Mapbox client configuration.
 *
 * Token resolution returns `null` (never throws) when the env var is missing
 * so callers can hide the UI gracefully. The token must be a Mapbox public
 * token (pk.…) with referrer + scope restrictions configured in the Mapbox
 * dashboard — see .env.example for the operational rules.
 */

export const MAPBOX_STYLE_URL = "mapbox://styles/mapbox/light-v11";

/** Street-level — buildings legible, ~140 m visible diagonal on a phone screen. */
export const DEFAULT_ZOOM = 16;

/** Below this, the user pans-the-globe and loses anchor context. */
export const MIN_ZOOM = 14;

/** Above this, raster fades and the experience degrades. */
export const MAX_ZOOM = 19;

/** Returns the configured client-safe Mapbox public token, or null if unset. */
export function getMapboxToken(): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True when the env is configured to allow rendering the Pin spot step. */
export function isMapboxEnabled(): boolean {
  return getMapboxToken() !== null;
}
