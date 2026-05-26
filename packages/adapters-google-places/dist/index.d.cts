import { VenueAdapter } from '@hade/core';

/**
 * @hade/adapters-google-places — clean-room VenueAdapter for Google Places (New API).
 *
 * Replicates the request shape, field mask, and timeout used by the in-tree
 * `fetchNearbyGrounded` (`src/core/services/places.ts:310-451`) so the route
 * can swap from the legacy shim (`@hade/core/legacy.unwrappedGooglePlaces`) to
 * this adapter with no behavior change.
 *
 * The adapter does NOT map `intent` to `includedTypes` — that's an engine
 * concern. Callers should pass `target_categories` directly, optionally
 * supplemented by `intent` for downstream logging only.
 */

declare const GOOGLE_PLACES_ADAPTER_ID: "google_places@1.0.0";
interface GooglePlacesOptions {
    /** Falls back to `process.env.GOOGLE_API_KEY` at first call; never read eagerly. */
    readonly apiKey?: string;
    /** Default search radius. Capped at 50 000 m by Google. */
    readonly defaultRadiusMeters?: number;
    /** Default result count. Capped at 20 per page by Google. */
    readonly defaultMaxResults?: number;
    /** Hard per-call deadline. */
    readonly timeoutMs?: number;
    /** Override for tests / non-global fetch contexts (Cloudflare Workers, Deno). */
    readonly fetchImpl?: typeof fetch;
    /** Override the adapter id surfaced in logs. */
    readonly id?: string;
}
declare function googlePlaces(opts?: GooglePlacesOptions): VenueAdapter;

export { GOOGLE_PLACES_ADAPTER_ID, type GooglePlacesOptions, googlePlaces };
