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

import { createVenueAdapter } from "@hade/core";
import type {
  VenueAdapter,
  VenueCandidate,
  VenueContextLike,
  VenueMultiQueryOptions,
  VenueSearchNearbyOptions,
} from "@hade/core";

// ─── Constants (mirror src/core/services/places.ts) ───────────────────────────

const PLACES_API_URL = "https://places.googleapis.com/v1/places:searchNearby";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.types",
  "places.location",
  "places.currentOpeningHours.openNow",
  "places.rating",
  "places.priceLevel",
  "places.shortFormattedAddress",
].join(",");

const DEFAULT_RADIUS_METERS = 800;
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_TIMEOUT_MS = 6000;
const GOOGLE_RADIUS_CAP_METERS = 50_000;
const GOOGLE_MAX_RESULTS_PER_PAGE = 20;

// ─── Public API ───────────────────────────────────────────────────────────────

export const GOOGLE_PLACES_ADAPTER_ID = "google_places@1.0.0" as const;

export interface GooglePlacesOptions {
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

export function googlePlaces(opts: GooglePlacesOptions = {}): VenueAdapter {
  const defaultRadius = opts.defaultRadiusMeters ?? DEFAULT_RADIUS_METERS;
  const defaultMaxResults = opts.defaultMaxResults ?? DEFAULT_MAX_RESULTS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const id = opts.id ?? GOOGLE_PLACES_ADAPTER_ID;

  // Defer env access until call-time so the factory is edge-safe.
  let apiKey: string | undefined = opts.apiKey;
  function getApiKey(): string | null {
    if (apiKey) return apiKey;
    const envKey =
      typeof process !== "undefined" && process.env
        ? process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_PLACES_KEY
        : undefined;
    if (envKey) apiKey = envKey;
    return apiKey ?? null;
  }

  async function search(options: VenueSearchNearbyOptions): Promise<VenueCandidate[]> {
    const key = getApiKey();
    if (!key) return [];
    if (!isValidGeo(options.geo)) return [];

    const radius = Math.min(options.radius_meters ?? defaultRadius, GOOGLE_RADIUS_CAP_METERS);
    const maxResults = Math.min(
      options.max_results ?? defaultMaxResults,
      GOOGLE_MAX_RESULTS_PER_PAGE,
    );
    const openNow = options.open_now ?? true;

    const body: NearbySearchBody = {
      locationRestriction: {
        circle: {
          center: { latitude: options.geo.lat, longitude: options.geo.lng },
          radius,
        },
      },
      maxResultCount: maxResults,
      rankPreference: "DISTANCE",
    };
    if (options.target_categories && options.target_categories.length > 0) {
      body.includedTypes = [...options.target_categories];
    }

    let response: Response;
    try {
      // `cache: "no-store"` is WHATWG-standard but not in Node's stricter
      // RequestInit type without DOM lib. Cast preserves runtime behavior
      // (Next.js needs this to bypass auto-caching of POST in route handlers).
      response = await fetchImpl(PLACES_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      } as RequestInit);
    } catch {
      return []; // Network / timeout / abort — preserve legacy "[] on any error" contract.
    }

    if (!response.ok) return [];

    let payload: GooglePlacesResponse;
    try {
      payload = (await response.json()) as GooglePlacesResponse;
    } catch {
      return [];
    }

    const rawPlaces = payload.places ?? [];
    const candidates: VenueCandidate[] = [];
    for (const place of rawPlaces) {
      const normalized = toVenueCandidate(place, options.geo, openNow);
      if (normalized) candidates.push(normalized);
    }
    return candidates;
  }

  async function searchMulti(options: VenueMultiQueryOptions): Promise<VenueCandidate[]> {
    // Mirror the legacy multi-query: fan out per bucket, dedupe by id.
    const buckets = options.categoryBuckets.filter((b) => b.length > 0);
    if (buckets.length === 0) {
      return search({
        geo: options.geo,
        radius_meters: options.radius_meters,
        open_now: options.open_now,
      });
    }
    const results = await Promise.all(
      buckets.map((bucket) =>
        search({
          geo: options.geo,
          radius_meters: options.radius_meters,
          target_categories: bucket,
          open_now: options.open_now,
        }),
      ),
    );
    return dedupeById(results.flat());
  }

  return createVenueAdapter({
    id,
    searchNearby: search,
    searchMultiQuery: searchMulti,
    searchForContext: async (context: VenueContextLike, categories: string[]) => {
      const geo = context.geo;
      if (!isValidGeo(geo ?? undefined)) return [];
      return search({
        geo: geo!,
        radius_meters: context.radius_meters ?? defaultRadius,
        intent: context.situation?.intent ?? undefined,
        target_categories: categories,
        open_now: true,
      });
    },
  });
}

// ─── Internal types & helpers ─────────────────────────────────────────────────

interface NearbySearchBody {
  locationRestriction: {
    circle: { center: { latitude: number; longitude: number }; radius: number };
  };
  maxResultCount: number;
  rankPreference: "DISTANCE" | "POPULARITY";
  includedTypes?: string[];
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string } | string;
  types?: string[];
  location?: { latitude?: number; longitude?: number };
  currentOpeningHours?: { openNow?: boolean };
  rating?: number;
  priceLevel?: string | number;
  shortFormattedAddress?: string;
}

interface GooglePlacesResponse {
  places?: GooglePlace[];
}

function isValidGeo(geo: { lat?: number; lng?: number } | undefined): geo is { lat: number; lng: number } {
  if (!geo) return false;
  if (geo.lat === undefined || geo.lng === undefined) return false;
  if (geo.lat === 0 && geo.lng === 0) return false;
  return Number.isFinite(geo.lat) && Number.isFinite(geo.lng);
}

function resolveDisplayName(place: GooglePlace): string | null {
  if (typeof place.displayName === "string") return place.displayName;
  if (place.displayName?.text) return place.displayName.text;
  return null;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c)));
}

function normalizePriceLevel(raw: GooglePlace["priceLevel"]): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "number") return raw;
  // Google's New API returns enum strings; map to 0..4.
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[raw];
}

function toVenueCandidate(
  place: GooglePlace,
  origin: { lat: number; lng: number },
  filterClosed: boolean,
): VenueCandidate | null {
  const id = place.id;
  const name = resolveDisplayName(place);
  if (!id || !name) return null;
  if (!place.location || place.location.latitude === undefined || place.location.longitude === undefined) {
    return null;
  }
  const isOpen = place.currentOpeningHours?.openNow ?? true;
  if (filterClosed && place.currentOpeningHours?.openNow === false) return null;

  const geo = { lat: place.location.latitude, lng: place.location.longitude };
  const category = (place.types?.[0] ?? "place").toString();

  const candidate: VenueCandidate = {
    id,
    name,
    category,
    vibe: "",
    geo,
    distance_meters: haversineMeters(origin, geo),
    is_open: isOpen,
    place_id: id,
    types: place.types ? [...place.types] : undefined,
  };
  if (place.shortFormattedAddress) candidate.address = place.shortFormattedAddress;
  if (typeof place.rating === "number") candidate.rating = place.rating;
  const price = normalizePriceLevel(place.priceLevel);
  if (price !== undefined) candidate.price_level = price;
  return candidate;
}

function dedupeById(items: VenueCandidate[]): VenueCandidate[] {
  const seen = new Set<string>();
  const out: VenueCandidate[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
