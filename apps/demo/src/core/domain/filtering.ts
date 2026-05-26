// src/core/domain/filtering.ts
//
// Strict domain-aware Place filtering.
//
// A candidate is admitted only if its raw Google `types[]` matches at least
// one entry in the domain whitelist AND zero entries in the global blacklist.
// If the strict pass yields fewer than SOFT_FALLBACK_THRESHOLD candidates,
// the whitelist is broadened to include domain-adjacent "soft" types — but
// the blacklist is still enforced. Off-domain noise can never reach scoring.

export const DOMAIN_TYPE_WHITELIST: Record<string, string[]> = {
  dining: ["restaurant", "cafe", "bakery", "meal_takeaway"],
  social: ["bar", "night_club", "park", "event_venue", "art_gallery"],
  travel: ["tourist_attraction", "museum", "landmark", "zoo", "aquarium"],
};

// Domain-adjacent fallback types, used only when strict matches < threshold.
// Examples: cafes are weakly social (low-energy hangout); parks are weakly
// travel-worthy. Never includes anything from the blacklist.
export const DOMAIN_SOFT_TYPES: Record<string, string[]> = {
  dining: ["bar", "meal_delivery", "food"],
  social: ["cafe", "movie_theater", "live_music_venue", "performing_arts_theater"],
  travel: ["park", "national_park", "art_gallery", "historical_landmark", "cultural_center"],
};

// Hard exclusion list — these types are NEVER admitted, regardless of mode
// or fallback state. Tuned to strip the most common Google Places noise.
export const DOMAIN_TYPE_BLACKLIST: Set<string> = new Set([
  "car_repair",
  "real_estate_agency",
  "insurance_agency",
  "finance",
  "doctor",
  "hospital",
  "lawyer",
  "storage",
  "moving_company",
  "general_contractor",
]);

const SOFT_FALLBACK_THRESHOLD = 3;

interface PlaceLike {
  id?: string;
  name?: string;
  types?: unknown;
}

function getTypes(place: PlaceLike): string[] {
  return Array.isArray(place.types) ? (place.types as string[]) : [];
}

function isBlacklisted(place: PlaceLike): boolean {
  return getTypes(place).some((t) => DOMAIN_TYPE_BLACKLIST.has(t));
}

function matchesAnyType(place: PlaceLike, allowed: Set<string>): boolean {
  return getTypes(place).some((t) => allowed.has(t));
}

export function filterByDomain<T extends PlaceLike>(places: T[], domain: string): T[] {
  const whitelist = DOMAIN_TYPE_WHITELIST[domain];

  // Unknown domain — return as-is (no filtering applied).
  if (!whitelist) return places;

  const whitelistSet = new Set(whitelist);

  // Strict pass: whitelist match ∧ no blacklist match.
  let filtered = places.filter(
    (p) => !isBlacklisted(p) && matchesAnyType(p, whitelistSet),
  );

  let usedSoftFallback = false;

  // Soft fallback — only if strict yield is below the floor.
  // Blacklist enforcement is preserved here; this only widens the whitelist.
  if (filtered.length < SOFT_FALLBACK_THRESHOLD) {
    const softList = DOMAIN_SOFT_TYPES[domain] ?? [];
    if (softList.length > 0) {
      const expandedSet = new Set<string>([...whitelist, ...softList]);
      const expanded = places.filter(
        (p) => !isBlacklisted(p) && matchesAnyType(p, expandedSet),
      );
      if (expanded.length > filtered.length) {
        console.log("[HADE FILTER SOFT EXPANSION]", {
          mode: domain,
          strict: filtered.length,
          expanded: expanded.length,
          threshold: SOFT_FALLBACK_THRESHOLD,
        });
        filtered = expanded;
        usedSoftFallback = true;
      }
    }
  }

  console.log("[HADE FILTER DEBUG]", {
    mode: domain,
    kept: filtered.length,
    dropped: places.length - filtered.length,
    soft_fallback: usedSoftFallback,
  });

  console.log(
    "[HADE FILTER SAMPLE]",
    filtered.slice(0, 5).map((p) => ({ name: p.name, types: getTypes(p) })),
  );

  return filtered;
}
