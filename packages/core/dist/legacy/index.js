// src/adapters/registry.ts
function createVenueAdapter(impl) {
  return {
    id: impl.id,
    searchNearby: impl.searchNearby,
    searchMultiQuery: impl.searchMultiQuery,
    searchForContext: impl.searchForContext
  };
}

// src/legacy/unwrappedGooglePlaces.ts
function unwrappedGooglePlaces(deps) {
  const id = deps.id ?? "google_places_legacy@0.0.0";
  const defaultRadiusMeters = deps.defaultRadiusMeters ?? 800;
  return createVenueAdapter({
    id,
    searchNearby: async (options) => {
      const result = await deps.fetchNearbyGrounded({
        geo: options.geo,
        radius_meters: options.radius_meters,
        intent: options.intent,
        target_categories: options.target_categories ? [...options.target_categories] : void 0,
        open_now: options.open_now,
        max_results: options.max_results
      });
      return [...result];
    },
    searchMultiQuery: async (options) => {
      if (deps.fetchMultiQueryGrounded) {
        const result2 = await deps.fetchMultiQueryGrounded({
          geo: options.geo,
          categoryBuckets: options.categoryBuckets.map((bucket) => [...bucket]),
          radius_meters: options.radius_meters,
          open_now: options.open_now
        });
        return [...result2];
      }
      const allCategories = Array.from(new Set(options.categoryBuckets.flat()));
      const result = await deps.fetchNearbyGrounded({
        geo: options.geo,
        radius_meters: options.radius_meters,
        target_categories: allCategories,
        open_now: options.open_now
      });
      return [...result];
    },
    searchForContext: async (context, categories) => {
      const geo = context.geo;
      if (!geo) return [];
      const intent = context.situation?.intent ?? void 0;
      const radius = context.radius_meters ?? defaultRadiusMeters;
      const result = await deps.fetchNearbyGrounded({
        geo,
        intent: intent ?? void 0,
        target_categories: categories,
        radius_meters: radius,
        open_now: true
      });
      return [...result];
    }
  });
}

// src/legacy/legacyOpenAIAdapter.ts
function legacyOpenAIAdapter(deps) {
  const id = deps.id ?? "openai_legacy@0.0.0";
  return {
    id,
    async enhanceCopy(prompt, options) {
      return deps.enhanceCopy(prompt, options);
    }
  };
}

// src/legacy/legacyUpstashAdapter.ts
function legacyUpstashAdapter(deps) {
  const id = deps.id ?? "upstash_legacy@0.0.0";
  const defaultTtl = deps.defaultTtlSeconds;
  return {
    id,
    mode() {
      return deps.getMode();
    },
    async get(key) {
      if (!deps.client) return null;
      const raw = await deps.client.get(key);
      return raw ?? null;
    },
    async set(key, value, ttlSeconds) {
      if (!deps.client) return;
      const ex = ttlSeconds ?? defaultTtl;
      if (ex !== void 0 && Number.isFinite(ex)) {
        await deps.client.set(key, value, { ex });
      } else {
        await deps.client.set(key, value);
      }
    }
  };
}

export { legacyOpenAIAdapter, legacyUpstashAdapter, unwrappedGooglePlaces };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map