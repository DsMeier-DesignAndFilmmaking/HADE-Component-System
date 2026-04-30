/**
 * GroundedPlacesService
 *
 * Fetches real, open-now venue candidates from Google Places (New API v1) and
 * normalises them into PlaceOption — the shape the HADE orchestrator uses to
 * anchor decisions to physical locations.
 *
 * Contract guarantees:
 *   • fetchNearbyGrounded always returns PlaceOption[] — never throws.
 *   • An empty array on any error prevents orchestrator crashes.
 *   • Only "open now" venues are returned by default (configurable).
 *
 * ── Swap to Mapbox ────────────────────────────────────────────────────────────
 * Replace callGooglePlaces() with a Mapbox POI search using:
 *   GET https://api.mapbox.com/geocoding/v5/mapbox.places/{category}.json
 *     ?proximity={lng},{lat}&limit=20&access_token={token}
 * Map the GeoJSON Feature array into the same GooglePlace shape or write a
 * parallel toPlaceOptionFromMapbox() converter. fetchNearbyGrounded() is
 * provider-agnostic above that boundary.
 */

import "server-only";

import { serverEnv } from "@/lib/env/server";
import { getRedisMode } from "@/lib/hade/redis";
import type { GeoLocation, Intent, PlaceOption, FetchNearbyOptions } from "@/types/hade";
import placesTypeMapJson from "@/config/places_type_map.json";
import vibeWordMapJson   from "@/config/vibe_word_map.json";

// PlaceOption and FetchNearbyOptions are defined in src/types/hade.ts.
// Re-export so callers can import from either location.
export type { PlaceOption, FetchNearbyOptions };

// ─── Intent → Google place types ─────────────────────────────────────────────

/**
 * Maps HADE intent to includedTypes sent to Google Places (New API).
 * Loaded from config/places_type_map.json — edit that file to add new verticals
 * (concerts, fitness, museums, etc.) without touching this service.
 *
 * "anything" has no entry → request omits includedTypes (broadest search).
 */
const INTENT_TYPES = placesTypeMapJson as Partial<Record<Intent, string[]>>;

// ─── Category normalisation ───────────────────────────────────────────────────

/**
 * Maps the first matching Google place type → a HADE category token.
 * Lookup is ordered: specific types before generic ones.
 * Hardcoded here because this is a structural mapping (Google type → HADE token)
 * rather than domain logic — it changes only when the Google API changes.
 */
const CATEGORY_MAP: Record<string, string> = {
  // Food
  restaurant: "restaurant",
  fast_food_restaurant: "restaurant",
  food_court: "restaurant",
  sandwich_shop: "restaurant",
  pizza_restaurant: "restaurant",
  sushi_restaurant: "restaurant",
  ramen_restaurant: "restaurant",
  american_restaurant: "restaurant",
  mexican_restaurant: "restaurant",
  japanese_restaurant: "restaurant",
  thai_restaurant: "restaurant",
  italian_restaurant: "restaurant",
  indian_restaurant: "restaurant",
  bakery: "bakery",
  // Coffee + casual
  cafe: "cafe",
  coffee_shop: "cafe",
  juice_shop: "cafe",
  // Drinks
  bar: "bar",
  wine_bar: "bar",
  cocktail_bar: "bar",
  sports_bar: "bar",
  // Night
  night_club: "nightclub",
  nightclub: "nightclub",
  // Venues
  live_music_venue: "venue",
  comedy_club: "venue",
  event_venue: "venue",
  tourist_attraction: "venue",
  // Outdoors
  park: "park",
  national_park: "park",
  city_park: "park",
  campground: "park",
  aquarium: "museum",
  // Wellness
  spa: "spa",
  gym: "gym",
  fitness_center: "gym",
  yoga_studio: "gym",
  // Culture
  book_store: "bookstore",
  bookstore: "bookstore",
  library: "library",
  museum: "museum",
  art_gallery: "gallery",
  movie_theater: "theater",
  // Retail
  shopping_mall: "mall",
  supermarket: "grocery",
  grocery_store: "grocery",
};

/**
 * Maps HADE category tokens to evocative vibe words.
 * Loaded from config/vibe_word_map.json — edit that file to change vibe
 * vocabulary for a new domain without touching this service.
 */
const VIBE_MAP = vibeWordMapJson as Record<string, string>;
const DEFAULT_VIBE = VIBE_MAP["default"] ?? "local";

// ─── Google Places (New API) internal types ───────────────────────────────────

interface GoogleDisplayName {
  text: string;
  languageCode?: string;
}

interface GoogleLatLng {
  latitude: number;
  longitude: number;
}

interface GoogleOpeningHours {
  openNow?: boolean;
}

interface GooglePlace {
  id: string;
  displayName?: GoogleDisplayName;
  types?: string[];
  location?: GoogleLatLng;
  currentOpeningHours?: GoogleOpeningHours;
  rating?: number;
  priceLevel?: string;
  shortFormattedAddress?: string;
}

interface GooglePlacesResponse {
  places?: GooglePlace[];
}

interface NearbySearchBody {
  locationRestriction: {
    circle: {
      center: { latitude: number; longitude: number };
      radius: number;
    };
  };
  includedTypes?: string[];
  maxResultCount: number;
  rankPreference: "DISTANCE" | "POPULARITY";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Straight-line distance between two coordinates in metres (haversine formula). */
function haversineMeters(a: GeoLocation, b: GeoLocation): number {
  const R = 6_371_000; // Earth mean radius, metres
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const sinΔφ = Math.sin(Δφ / 2);
  const sinΔλ = Math.sin(Δλ / 2);
  const a2 =
    sinΔφ * sinΔφ + Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ;
  return R * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2));
}

/** Returns the first HADE category that matches a Google type array. */
function normalizeCategory(types: string[]): string {
  for (const t of types) {
    const mapped = CATEGORY_MAP[t];
    if (mapped) return mapped;
  }
  // Last-resort: clean up the first raw type
  return types[0]?.replace(/_/g, " ") ?? "venue";
}

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/**
 * Converts a raw Google Place into a PlaceOption.
 * Returns null if required fields (id, name, location) are absent, or if the
 * place is closed and openNowFilter is active.
 */
function toPlaceOption(
  place: GooglePlace,
  origin: GeoLocation,
  openNowFilter: boolean,
): PlaceOption | null {
  if (!place.id || !place.displayName?.text || !place.location) return null;

  // Honour open_now filter. Places without hours data are included (openNow = undefined → treat as open).
  if (openNowFilter && place.currentOpeningHours?.openNow === false) return null;

  const placeGeo: GeoLocation = {
    lat: place.location.latitude,
    lng: place.location.longitude,
  };

  const category = normalizeCategory(place.types ?? []);
  const vibe = VIBE_MAP[category] ?? DEFAULT_VIBE;

  return {
    id: place.id,
    name: place.displayName.text,
    category,
    vibe,
    geo: placeGeo,
    distance_meters: Math.round(haversineMeters(origin, placeGeo)),
    is_open: place.currentOpeningHours?.openNow ?? true,
    address: place.shortFormattedAddress,
    rating: place.rating,
    price_level:
      place.priceLevel !== undefined
        ? PRICE_LEVEL_MAP[place.priceLevel]
        : undefined,
  };
}

// ─── API configuration ────────────────────────────────────────────────────────

const PLACES_API_URL =
  "https://places.googleapis.com/v1/places:searchNearby";

/** Only request the fields we actually use — keeps response size minimal. */
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

const DEFAULT_RADIUS_M = 800;
const DEFAULT_MAX_RESULTS = 20;
const REQUEST_TIMEOUT_MS = 6_000;

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetches nearby, open-now venues from Google Places (New API) and returns
 * them as normalised PlaceOption records ready for the HADE orchestrator.
 *
 * @returns PlaceOption[] — always resolves; returns [] on any error.
 *
 * @example
 * const candidates = await fetchNearbyGrounded({
 *   geo: { lat: 39.7392, lng: -104.9903 },
 *   intent: "eat",
 *   radius_meters: 1000,
 * });
 */
export async function fetchNearbyGrounded(
  opts: FetchNearbyOptions,
): Promise<PlaceOption[]> {
  console.log("[HADE TRACE] Places fetch executing at: src/core/services/places.ts", {
    geo: opts.geo,
    intent: opts.intent,
    radius_meters: opts.radius_meters,
    open_now: opts.open_now,
  });

  const apiKey = serverEnv.googleApiKey;

  console.log("[HADE ENV CHECK]", {
    keyExists: !!apiKey,
    runtime: typeof window === "undefined" ? "server" : "client",
  });

  if (!apiKey) {
    console.warn(
      "[places] GOOGLE_API_KEY not configured — skipping Places fetch",
    );
    return [];
  }

  const {
    geo,
    radius_meters = DEFAULT_RADIUS_M,
    intent,
    target_categories,
    open_now = true,
    max_results = DEFAULT_MAX_RESULTS,
  } = opts;

  console.log("[HADE PLACES INPUT GEO]", { lat: geo?.lat, lng: geo?.lng });

  if (!geo || !geo.lat || !geo.lng) {
    console.error("[HADE GEO ERROR] Missing coordinates", geo);
    return [];
  }

  if (geo.lat === 0 && geo.lng === 0) {
    console.error("[HADE GEO ERROR] Invalid coordinates (0,0)");
    return [];
  }

  console.log("[HADE GEO VALID]", geo);

  const degraded = getRedisMode() !== "FULL";
  const validGeo = !!(geo && geo.lat && geo.lng);
  console.log("[HADE GEO → PLACES PIPELINE]", {
    geo,
    validGeo,
    degraded,
    willFetchPlaces: validGeo,
  });

  const requestBody: NearbySearchBody = {
    locationRestriction: {
      circle: {
        center: { latitude: geo.lat, longitude: geo.lng },
        radius: Math.min(radius_meters, 50_000), // Google hard cap
      },
    },
    maxResultCount: Math.min(max_results, 20), // per-page API limit
    rankPreference: "DISTANCE",
  };

  // Only apply type filter when intent maps to a known type list.
  // "anything" has no entry → broadest possible search.
  const includedTypes =
    target_categories && target_categories.length > 0
      ? target_categories
      : intent
        ? INTENT_TYPES[intent]
        : undefined;
  if (includedTypes?.length) {
    requestBody.includedTypes = includedTypes;
  }

  console.log("[HADE PLACES] Fetching", { lat: geo.lat, lng: geo.lng });

  try {
    const response = await fetch(PLACES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    console.log("[HADE PLACES] Raw response status", response.status);

    if (!response.ok) {
      const errText = await response.text().catch(() => "(unreadable)");
      const error = new Error(
        `Google Places API ${response.status}: ${errText.slice(0, 200)}`,
      );
      console.error("[HADE PLACES ERROR]", error);
      return [];
    }

    let data: GooglePlacesResponse;
    try {
      data = (await response.json()) as GooglePlacesResponse;
    } catch (parseErr) {
      console.error("[HADE PLACES ERROR]", parseErr);
      return [];
    }

    console.log("[HADE PLACES] Raw JSON", data);

    const rawPlaces = data.places ?? [];

    const candidates: PlaceOption[] = rawPlaces
      .map((p) => toPlaceOption(p, geo, open_now))
      .filter((p): p is PlaceOption => p !== null);

    console.log("[HADE PLACES] Parsed places", candidates);

    console.log(
      `[places] ${rawPlaces.length} raw → ${candidates.length} usable` +
        (intent ? ` (intent=${intent})` : "") +
        (target_categories?.length ? ` (types=${target_categories.join(",")})` : "") +
        ` (geo=${geo.lat.toFixed(2)},${geo.lng.toFixed(2)})`,
    );

    return candidates;
  } catch (err) {
    console.error("[HADE PLACES ERROR]", err);
    return [];
  }
}
