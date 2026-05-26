import { ResolvedHadeConfig } from './schema.cjs';

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

/**
 * Returns the SHA-256 of the canonical-JSON representation of the config,
 * prefixed with `sha256:`. Async because Web Crypto is async.
 *
 * Falls back to a synchronous FNV-1a hash (prefix `fnv:`) when `crypto.subtle`
 * is unavailable. Both hash kinds are stable across runs, so log correlation
 * still works — the prefix is just an honest signal of which algorithm was used.
 */
declare function computeConfigHash(config: ResolvedHadeConfig): Promise<string>;
/**
 * Synchronous fallback. Same canonical-JSON shape, FNV-1a digest. Useful for
 * unit tests, sync init paths, and the createHade constructor (which can't
 * await without becoming async itself).
 */
declare function computeConfigHashSync(config: ResolvedHadeConfig): string;

export { computeConfigHash, computeConfigHashSync };
