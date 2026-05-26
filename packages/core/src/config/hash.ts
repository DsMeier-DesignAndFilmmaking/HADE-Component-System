/**
 * Deterministic config fingerprint surfaced in `output.analytics.config_hash`.
 *
 * Replaces the non-cryptographic FNV stub at `packages/core/src/createHade.ts:170-181`.
 * Used for A/B routing, log correlation, and reproducibility audits — two
 * clients running the same config produce the same hash regardless of node /
 * platform.
 *
 * Implementation: canonical JSON serialization (sorted keys, stable arrays)
 * fed to either Web Crypto (browser, Workers, Deno, modern Node) or a small
 * synchronous FNV-1a fallback for environments without `crypto.subtle`.
 *
 * The function is async only because Web Crypto's `digest()` is async; callers
 * that don't await get an empty hash, so adapter init must always await.
 */

import type { ResolvedHadeConfig } from "./schema.js";

const HASH_PREFIX_SHA256 = "sha256:" as const;
const HASH_PREFIX_FNV    = "fnv:"    as const;

/**
 * Returns the SHA-256 of the canonical-JSON representation of the config,
 * prefixed with `sha256:`. Async because Web Crypto is async.
 *
 * Falls back to a synchronous FNV-1a hash (prefix `fnv:`) when `crypto.subtle`
 * is unavailable. Both hash kinds are stable across runs, so log correlation
 * still works — the prefix is just an honest signal of which algorithm was used.
 */
export async function computeConfigHash(config: ResolvedHadeConfig): Promise<string> {
  const canonical = canonicalJsonStringify(stripVolatileFields(config));

  // Structural typing avoids the DOM-lib `SubtleCrypto` (which the @hade/core
  // purity audit forbids); the runtime contract is satisfied by every host
  // (browser, Node 19+, Workers, Deno, Bun).
  interface SubtleDigester {
    digest(algorithm: string, data: ArrayBufferView): Promise<ArrayBuffer>;
  }
  const subtle = (globalThis as { crypto?: { subtle?: SubtleDigester } }).crypto?.subtle;
  if (subtle && typeof subtle.digest === "function") {
    const encoded = new TextEncoder().encode(canonical);
    const digest = await subtle.digest("SHA-256", encoded);
    return `${HASH_PREFIX_SHA256}${bytesToHex(new Uint8Array(digest))}`;
  }

  return `${HASH_PREFIX_FNV}${fnv1aHex(canonical)}`;
}

/**
 * Synchronous fallback. Same canonical-JSON shape, FNV-1a digest. Useful for
 * unit tests, sync init paths, and the createHade constructor (which can't
 * await without becoming async itself).
 */
export function computeConfigHashSync(config: ResolvedHadeConfig): string {
  const canonical = canonicalJsonStringify(stripVolatileFields(config));
  return `${HASH_PREFIX_FNV}${fnv1aHex(canonical)}`;
}

/**
 * Strips fields that mutate per-process / per-call (clientId; both copies of
 * config_hash — top-level AND the redundant copy at `defaults.config_hash`).
 * Two clients constructed with identical user config should produce identical
 * hashes regardless of these volatile fields.
 */
function stripVolatileFields(config: ResolvedHadeConfig): Omit<ResolvedHadeConfig, "clientId" | "config_hash"> {
  const { clientId: _clientId, config_hash: _config_hash, ...rest } = config;
  // ResolvedHadeConfig also nests config_hash inside `defaults` for backward
  // compat with Phase C. Strip that too so the hash is invariant under either
  // duplicate being updated.
  const { config_hash: _nestedHash, ...defaultsWithoutHash } = rest.defaults;
  return { ...rest, defaults: { ...defaultsWithoutHash, config_hash: "" } };
}

/**
 * JSON.stringify with stable key ordering. Recursively sorts object keys so
 * `{b: 1, a: 2}` and `{a: 2, b: 1}` produce identical output. Arrays preserve
 * their order (semantic).
 */
function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown): unknown => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(v as Record<string, unknown>).sort();
      for (const k of keys) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1aHex(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply with truncation to a 32-bit unsigned integer.
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
