import { createVenueAdapter } from '@hade/core';

// src/index.ts
var PLACES_API_URL = "https://places.googleapis.com/v1/places:searchNearby";
var FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.types",
  "places.location",
  "places.currentOpeningHours.openNow",
  "places.rating",
  "places.priceLevel",
  "places.shortFormattedAddress"
].join(",");
var DEFAULT_RADIUS_METERS = 800;
var DEFAULT_MAX_RESULTS = 20;
var DEFAULT_TIMEOUT_MS = 6e3;
var GOOGLE_RADIUS_CAP_METERS = 5e4;
var GOOGLE_MAX_RESULTS_PER_PAGE = 20;
var GOOGLE_PLACES_ADAPTER_ID = "google_places@1.0.0";
function googlePlaces(opts = {}) {
  const defaultRadius = opts.defaultRadiusMeters ?? DEFAULT_RADIUS_METERS;
  const defaultMaxResults = opts.defaultMaxResults ?? DEFAULT_MAX_RESULTS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const id = opts.id ?? GOOGLE_PLACES_ADAPTER_ID;
  let apiKey = opts.apiKey;
  function getApiKey() {
    if (apiKey) return apiKey;
    const envKey = typeof process !== "undefined" && process.env ? process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_PLACES_KEY : void 0;
    if (envKey) apiKey = envKey;
    return apiKey ?? null;
  }
  async function search(options) {
    const key = getApiKey();
    if (!key) return [];
    if (!isValidGeo(options.geo)) return [];
    const radius = Math.min(options.radius_meters ?? defaultRadius, GOOGLE_RADIUS_CAP_METERS);
    const maxResults = Math.min(
      options.max_results ?? defaultMaxResults,
      GOOGLE_MAX_RESULTS_PER_PAGE
    );
    const openNow = options.open_now ?? true;
    const body = {
      locationRestriction: {
        circle: {
          center: { latitude: options.geo.lat, longitude: options.geo.lng },
          radius
        }
      },
      maxResultCount: maxResults,
      rankPreference: "DISTANCE"
    };
    if (options.target_categories && options.target_categories.length > 0) {
      body.includedTypes = [...options.target_categories];
    }
    let response;
    try {
      response = await fetchImpl(PLACES_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": FIELD_MASK
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      return [];
    }
    if (!response.ok) return [];
    let payload;
    try {
      payload = await response.json();
    } catch {
      return [];
    }
    const rawPlaces = payload.places ?? [];
    const candidates = [];
    for (const place of rawPlaces) {
      const normalized = toVenueCandidate(place, options.geo, openNow);
      if (normalized) candidates.push(normalized);
    }
    return candidates;
  }
  async function searchMulti(options) {
    const buckets = options.categoryBuckets.filter((b) => b.length > 0);
    if (buckets.length === 0) {
      return search({
        geo: options.geo,
        radius_meters: options.radius_meters,
        open_now: options.open_now
      });
    }
    const results = await Promise.all(
      buckets.map(
        (bucket) => search({
          geo: options.geo,
          radius_meters: options.radius_meters,
          target_categories: bucket,
          open_now: options.open_now
        })
      )
    );
    return dedupeById(results.flat());
  }
  return createVenueAdapter({
    id,
    searchNearby: search,
    searchMultiQuery: searchMulti,
    searchForContext: async (context, categories) => {
      const geo = context.geo;
      if (!isValidGeo(geo ?? void 0)) return [];
      return search({
        geo,
        radius_meters: context.radius_meters ?? defaultRadius,
        intent: context.situation?.intent ?? void 0,
        target_categories: categories,
        open_now: true
      });
    }
  });
}
function isValidGeo(geo) {
  if (!geo) return false;
  if (geo.lat === void 0 || geo.lng === void 0) return false;
  if (geo.lat === 0 && geo.lng === 0) return false;
  return Number.isFinite(geo.lat) && Number.isFinite(geo.lng);
}
function resolveDisplayName(place) {
  if (typeof place.displayName === "string") return place.displayName;
  if (place.displayName?.text) return place.displayName.text;
  return null;
}
function haversineMeters(a, b) {
  const R = 6371e3;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c)));
}
function normalizePriceLevel(raw) {
  if (raw === void 0) return void 0;
  if (typeof raw === "number") return raw;
  const map = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4
  };
  return map[raw];
}
function toVenueCandidate(place, origin, filterClosed) {
  const id = place.id;
  const name = resolveDisplayName(place);
  if (!id || !name) return null;
  if (!place.location || place.location.latitude === void 0 || place.location.longitude === void 0) {
    return null;
  }
  const isOpen = place.currentOpeningHours?.openNow ?? true;
  if (filterClosed && place.currentOpeningHours?.openNow === false) return null;
  const geo = { lat: place.location.latitude, lng: place.location.longitude };
  const category = (place.types?.[0] ?? "place").toString();
  const candidate = {
    id,
    name,
    category,
    vibe: "",
    geo,
    distance_meters: haversineMeters(origin, geo),
    is_open: isOpen,
    place_id: id,
    types: place.types ? [...place.types] : void 0
  };
  if (place.shortFormattedAddress) candidate.address = place.shortFormattedAddress;
  if (typeof place.rating === "number") candidate.rating = place.rating;
  const price = normalizePriceLevel(place.priceLevel);
  if (price !== void 0) candidate.price_level = price;
  return candidate;
}
function dedupeById(items) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export { GOOGLE_PLACES_ADAPTER_ID, googlePlaces };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map