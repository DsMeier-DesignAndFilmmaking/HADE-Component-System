// src/adapters/registry.ts
var registeredDefaults = null;
var venueFactory = null;
var cachedVenueFromFactory = null;
function registerDefaultAdapters(adapters) {
  registeredDefaults = {
    ...registeredDefaults,
    ...adapters,
    venue: adapters.venue ?? registeredDefaults?.venue,
    llm: adapters.llm ?? registeredDefaults?.llm,
    cache: adapters.cache ?? registeredDefaults?.cache,
    geo: adapters.geo ?? registeredDefaults?.geo
  };
  if (adapters.venue) {
    cachedVenueFromFactory = null;
  }
}
function setDefaultVenueAdapterFactory(factory) {
  venueFactory = factory;
  cachedVenueFromFactory = null;
}
function resolveVenueAdapter(override) {
  if (override) return override;
  if (registeredDefaults?.venue) return registeredDefaults.venue;
  if (venueFactory) {
    if (!cachedVenueFromFactory) {
      cachedVenueFromFactory = venueFactory();
    }
    return cachedVenueFromFactory;
  }
  throw new Error(
    '[@hade/core] No VenueAdapter registered. Import "@/core/adapters/registerDefaults" in server entry points.'
  );
}
function resolveAdapters(override) {
  const venue = resolveVenueAdapter(override?.venue);
  return {
    venue,
    llm: override?.llm ?? registeredDefaults?.llm,
    cache: override?.cache ?? registeredDefaults?.cache,
    geo: override?.geo ?? registeredDefaults?.geo
  };
}
function getVenueAdapter(override) {
  return resolveVenueAdapter(override);
}
function resetAdapterRegistryForTests() {
  registeredDefaults = null;
  venueFactory = null;
  cachedVenueFromFactory = null;
}
function createVenueAdapter(impl) {
  return {
    id: impl.id,
    searchNearby: impl.searchNearby,
    searchMultiQuery: impl.searchMultiQuery,
    searchForContext: impl.searchForContext
  };
}

export { createVenueAdapter, getVenueAdapter, registerDefaultAdapters, resetAdapterRegistryForTests, resolveAdapters, setDefaultVenueAdapterFactory };
//# sourceMappingURL=registry.js.map
//# sourceMappingURL=registry.js.map