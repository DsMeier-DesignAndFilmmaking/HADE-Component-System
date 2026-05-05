// src/core/domain/filtering.ts

export const DOMAIN_TYPE_WHITELIST: Record<string, string[]> = {
  dining: [
    "restaurant",
    "cafe",
    "bakery",
    "bar",
    "meal_takeaway",
    "meal_delivery",
  ],
  social: [
    "bar",
    "night_club",
    "park",
    "event_venue",
    "movie_theater",
  ],
  travel: [
    "tourist_attraction",
    "museum",
    "art_gallery",
    "landmark",
    "amusement_park",
  ],
};

export const HIGH_SIGNAL_TYPES: Record<string, string[]> = {
  dining: ["restaurant", "cafe", "bar"],
  social: ["bar", "night_club", "park"],
  travel: ["tourist_attraction", "museum", "art_gallery"],
};

export const HARD_EXCLUSION_TYPES = new Set([
  "car_repair",
  "finance",
  "insurance_agency",
  "real_estate_agency",
  "lawyer",
  "doctor",
  "hospital",
]);

export function filterByDomain(places: any[], domain: string): any[] {
  const whitelist = DOMAIN_TYPE_WHITELIST[domain];

  // Unknown domain — no filtering, return as-is
  if (!whitelist) return places;

  const whitelistSet = new Set(whitelist);
  const highSignalSet = new Set(HIGH_SIGNAL_TYPES[domain] ?? []);

  console.log("[HADE RAW COUNT]", places.length);

  const filtered = places.filter((place) => {
    const types: string[] = Array.isArray(place.types) ? place.types : [];
    const inWhitelist = types.some((t) => whitelistSet.has(t));
    const hasHighSignal = types.some((t) => highSignalSet.has(t));
    const isExcluded = types.some((t) => HARD_EXCLUSION_TYPES.has(t));
    return inWhitelist && hasHighSignal && !isExcluded;
  });

  console.log("[HADE FILTERED COUNT]", filtered.length);
  console.log(
    "[HADE FILTER SAMPLE]",
    filtered.slice(0, 5).map((p: any) => ({ name: p.name, types: p.types })),
  );

  return filtered;
}
