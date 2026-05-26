'use strict';

var redis = require('@upstash/redis');

// src/index.ts
var UPSTASH_ADAPTER_ID = "upstash@1.0.0";
function upstash(opts = {}) {
  const id = opts.id ?? UPSTASH_ADAPTER_ID;
  const defaultTtl = opts.defaultTtlSeconds;
  const productionOnlyDegradation = opts.productionOnlyDegradation ?? true;
  const client = resolveClient(opts);
  let degraded = false;
  function isProduction() {
    return typeof process !== "undefined" && process.env?.NODE_ENV === "production";
  }
  function markDegraded() {
    if (productionOnlyDegradation && !isProduction()) return;
    degraded = true;
  }
  function clearDegraded() {
    if (degraded) degraded = false;
  }
  return {
    id,
    mode() {
      return degraded ? "DEGRADED" : "FULL";
    },
    async get(key) {
      if (!client) return null;
      try {
        const raw = await client.get(key);
        clearDegraded();
        return raw ?? null;
      } catch {
        markDegraded();
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      if (!client) return;
      const ex = ttlSeconds ?? defaultTtl;
      try {
        if (ex !== void 0 && Number.isFinite(ex)) {
          await client.set(key, value, { ex });
        } else {
          await client.set(key, value);
        }
        clearDegraded();
      } catch {
        markDegraded();
      }
    }
  };
}
function resolveClient(opts) {
  if (opts.client) return opts.client;
  const url = opts.url ?? (typeof process !== "undefined" && process.env ? process.env.UPSTASH_REDIS_REST_URL : void 0);
  const token = opts.token ?? (typeof process !== "undefined" && process.env ? process.env.UPSTASH_REDIS_REST_TOKEN : void 0);
  if (!url || !token) return null;
  return new redis.Redis({ url, token });
}

exports.UPSTASH_ADAPTER_ID = UPSTASH_ADAPTER_ID;
exports.upstash = upstash;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map