'use strict';

// src/config/hash.ts
var HASH_PREFIX_SHA256 = "sha256:";
var HASH_PREFIX_FNV = "fnv:";
async function computeConfigHash(config) {
  const canonical = canonicalJsonStringify(stripVolatileFields(config));
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === "function") {
    const encoded = new TextEncoder().encode(canonical);
    const digest = await subtle.digest("SHA-256", encoded);
    return `${HASH_PREFIX_SHA256}${bytesToHex(new Uint8Array(digest))}`;
  }
  return `${HASH_PREFIX_FNV}${fnv1aHex(canonical)}`;
}
function computeConfigHashSync(config) {
  const canonical = canonicalJsonStringify(stripVolatileFields(config));
  return `${HASH_PREFIX_FNV}${fnv1aHex(canonical)}`;
}
function stripVolatileFields(config) {
  const { clientId: _clientId, config_hash: _config_hash, ...rest } = config;
  const { config_hash: _nestedHash, ...defaultsWithoutHash } = rest.defaults;
  return { ...rest, defaults: { ...defaultsWithoutHash, config_hash: "" } };
}
function canonicalJsonStringify(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted = {};
      const keys = Object.keys(v).sort();
      for (const k of keys) {
        sorted[k] = v[k];
      }
      return sorted;
    }
    return v;
  });
}
var FNV_OFFSET = 2166136261;
var FNV_PRIME = 16777619;
function fnv1aHex(input) {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
function bytesToHex(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

exports.computeConfigHash = computeConfigHash;
exports.computeConfigHashSync = computeConfigHashSync;
//# sourceMappingURL=hash.cjs.map
//# sourceMappingURL=hash.cjs.map