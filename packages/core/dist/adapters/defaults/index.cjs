'use strict';

// src/adapters/defaults/emptyVenues.ts
function emptyVenues(options = {}) {
  const id = options.id ?? "empty_venues@1.0.0";
  const EMPTY = [];
  return {
    id,
    async searchNearby() {
      return EMPTY;
    },
    async searchMultiQuery() {
      return EMPTY;
    },
    async searchForContext() {
      return EMPTY;
    }
  };
}

// src/adapters/defaults/noopLLM.ts
function noopLLM(options = {}) {
  const id = options.id ?? "noop_llm@1.0.0";
  return {
    id,
    async enhanceCopy() {
      return null;
    }
  };
}

// src/adapters/defaults/memoryCache.ts
function memoryCache(options = {}) {
  const id = options.id ?? "memory_cache@1.0.0";
  const maxEntries = options.maxEntries ?? 1024;
  const defaultTtlSeconds = options.defaultTtlSeconds ?? Number.POSITIVE_INFINITY;
  const store = /* @__PURE__ */ new Map();
  function evictIfNeeded() {
    while (store.size > maxEntries) {
      const oldest = store.keys().next();
      if (oldest.done) return;
      store.delete(oldest.value);
    }
  }
  return {
    id,
    mode() {
      return "FULL";
    },
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAtMs <= Date.now()) {
        store.delete(key);
        return null;
      }
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      const ttl = ttlSeconds ?? defaultTtlSeconds;
      const expiresAtMs = ttl === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Date.now() + ttl * 1e3;
      if (store.has(key)) store.delete(key);
      store.set(key, { value, expiresAtMs });
      evictIfNeeded();
    }
  };
}

exports.emptyVenues = emptyVenues;
exports.memoryCache = memoryCache;
exports.noopLLM = noopLLM;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map