import type { HadeAdapters, PartialHadeAdapters, VenueAdapter } from "../types/adapters.js";

let registeredDefaults: PartialHadeAdapters | null = null;
let venueFactory: (() => VenueAdapter) | null = null;
let cachedVenueFromFactory: VenueAdapter | null = null;

/**
 * Registers default adapter implementations (typically from the Next.js app).
 * Merges with any prior registration.
 */
export function registerDefaultAdapters(adapters: PartialHadeAdapters): void {
  registeredDefaults = {
    ...registeredDefaults,
    ...adapters,
    venue: adapters.venue ?? registeredDefaults?.venue,
    llm: adapters.llm ?? registeredDefaults?.llm,
    cache: adapters.cache ?? registeredDefaults?.cache,
    geo: adapters.geo ?? registeredDefaults?.geo,
  };
  if (adapters.venue) {
    cachedVenueFromFactory = null;
  }
}

/**
 * Registers a lazy factory for the venue adapter (avoids import cycles at module load).
 */
export function setDefaultVenueAdapterFactory(factory: () => VenueAdapter): void {
  venueFactory = factory;
  cachedVenueFromFactory = null;
}

function resolveVenueAdapter(override?: VenueAdapter): VenueAdapter {
  if (override) return override;
  if (registeredDefaults?.venue) return registeredDefaults.venue;
  if (venueFactory) {
    if (!cachedVenueFromFactory) {
      cachedVenueFromFactory = venueFactory();
    }
    return cachedVenueFromFactory;
  }
  throw new Error(
    '[@hade/core] No VenueAdapter registered. Import "@/core/adapters/registerDefaults" in server entry points.',
  );
}

/**
 * Resolves adapters for the current request, applying optional overrides (tests, DI).
 */
export function resolveAdapters(override?: PartialHadeAdapters): HadeAdapters {
  const venue = resolveVenueAdapter(override?.venue);
  return {
    venue,
    llm: override?.llm ?? registeredDefaults?.llm,
    cache: override?.cache ?? registeredDefaults?.cache,
    geo: override?.geo ?? registeredDefaults?.geo,
  };
}

/**
 * Convenience accessor used by legacy `getPlacesCandidates` shims.
 */
export function getVenueAdapter(override?: VenueAdapter): VenueAdapter {
  return resolveVenueAdapter(override);
}

/**
 * Test helper — clears registered defaults and factory cache.
 */
export function resetAdapterRegistryForTests(): void {
  registeredDefaults = null;
  venueFactory = null;
  cachedVenueFromFactory = null;
}

/**
 * Builds a {@link VenueAdapter} from plain functions (tests, custom providers).
 */
export function createVenueAdapter(impl: {
  id: string;
  searchNearby: VenueAdapter["searchNearby"];
  searchMultiQuery: VenueAdapter["searchMultiQuery"];
  searchForContext: VenueAdapter["searchForContext"];
}): VenueAdapter {
  return {
    id: impl.id,
    searchNearby: impl.searchNearby,
    searchMultiQuery: impl.searchMultiQuery,
    searchForContext: impl.searchForContext,
  };
}
