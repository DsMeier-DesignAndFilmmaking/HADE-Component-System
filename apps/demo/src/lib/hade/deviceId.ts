/**
 * deviceId.ts — Stable, lightweight client identity for HADE.
 *
 * Purpose: provide a persistent identifier for rate limiting, UGC attribution,
 * and basic abuse detection. NOT a secure identity system — it is a heuristic
 * identifier only. Do not use as a trust anchor.
 *
 * Behaviour summary:
 *   Reload in same session   → same ID         ✅
 *   Incognito / new session  → new ID           ✅
 *   SSR (window undefined)   → "server"         ✅
 *   localStorage blocked     → "unknown"        ✅
 *   Empty string             → never returned   ✅
 *
 * Non-goals:
 *   ✗  Fingerprinting (UA, screen size, canvas, etc.)
 *   ✗  External libraries
 *   ✗  Any security guarantee
 */

const STORAGE_KEY = "hade_device_id";

/**
 * Generates a random 16-character hex-like string.
 * UUID v4 supplies sufficient entropy; we trim to 16 chars for compactness.
 */
function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Returns a stable device identifier for the current browser session.
 *
 * - Server-side (SSR): returns "server" — never throws, never blocks.
 * - localStorage available: reads existing ID or generates and persists a new one.
 * - localStorage blocked (private browsing policy, quota error, etc.): returns "unknown".
 *
 * The returned value is always a non-empty string — callers need no null check.
 */
export function getDeviceId(): string {
  // SSR guard — typeof check is tree-shaken by bundlers in server builds
  if (typeof window === "undefined") {
    return "server";
  }

  try {
    let id = localStorage.getItem(STORAGE_KEY);

    if (!id) {
      id = generateId();
      localStorage.setItem(STORAGE_KEY, id);
    }

    return id;
  } catch {
    // localStorage.getItem / setItem can throw in:
    //   - Browsers with storage blocked (e.g. Safari ITP strict mode)
    //   - Contexts where storage quota is exceeded
    //   - Sandboxed iframes without storage access
    return "unknown";
  }
}
