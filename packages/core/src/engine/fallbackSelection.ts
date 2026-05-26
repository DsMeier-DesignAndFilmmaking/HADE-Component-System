/**
 * Pure helpers for Tier 3 static fallback selection.
 *
 * No Next.js or Redis imports — every function here is testable in isolation.
 * route.ts imports these and composes them with the catalog and context.
 */

/** Minimal interface satisfied by FallbackCatalogEntry and generic fallback entries. */
export interface FallbackEntryLike {
  id: string;
  title: string;
}

/**
 * Extracts venue_ids from rejection_history so buildFallbackCandidates can
 * filter real Google Places results before serving them as fallback decisions.
 * Static catalog entries (id prefixed "fallback-") are never in rejection_history
 * due to the client pivot guard, so this only affects the live-Places path.
 */
export function extractRejectedVenueIds(body?: Record<string, unknown> | null): Set<string> {
  const raw = body?.rejection_history;
  if (!Array.isArray(raw)) return new Set();
  const ids: string[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { venue_id?: unknown }).venue_id;
    if (typeof id === "string" && id.length > 0) ids.push(id);
  }
  return new Set(ids);
}

/**
 * Extracts surfaced_history venue_names → Map<normalizedTitle, positionInHistory>.
 *
 * Position 0 = shown earliest in this session (least recently surfaced).
 * Only the first occurrence of each title is stored so the position is stable
 * across multiple surfacings of the same entry.
 */
export function extractSurfacedFallbackTitles(
  body?: Record<string, unknown> | null,
): Map<string, number> {
  const raw = body?.surfaced_history;
  if (!Array.isArray(raw)) return new Map();
  const result = new Map<string, number>();
  raw.forEach((entry, i) => {
    if (!entry || typeof entry !== "object") return;
    const name = (entry as { venue_name?: unknown }).venue_name;
    if (typeof name === "string" && name.trim().length > 0) {
      const key = name.trim().toLowerCase();
      if (!result.has(key)) result.set(key, i);
    }
  });
  return result;
}

/**
 * Sorts fallback candidate entries for presentation order:
 *
 *   1. Entries never shown in this session rank first (surfacedAt = Infinity)
 *   2. Within unsurfaced entries, higher contextScore wins
 *   3. Among surfaced entries, least-recently-surfaced (lowest position) wins
 *   4. Stable id.localeCompare() tie-break
 *
 * Rejected entries are already filtered out before this call — this function
 * only orders what the caller has already admitted.
 */
export function sortFallbackCandidates<T extends FallbackEntryLike>(
  scoredEntries: Array<{ entry: T; contextScore: number }>,
  surfacedPositions: Map<string, number>,
): T[] {
  const withSurface = scoredEntries.map(({ entry, contextScore }) => ({
    entry,
    contextScore,
    surfacedAt: surfacedPositions.get(entry.title.toLowerCase()) ?? Infinity,
  }));

  withSurface.sort((a, b) => {
    const aUnsurfaced = a.surfacedAt === Infinity;
    const bUnsurfaced = b.surfacedAt === Infinity;
    if (aUnsurfaced !== bUnsurfaced) return aUnsurfaced ? -1 : 1;
    if (b.contextScore !== a.contextScore) return b.contextScore - a.contextScore;
    if (a.surfacedAt !== b.surfacedAt) return a.surfacedAt - b.surfacedAt;
    return a.entry.id.localeCompare(b.entry.id);
  });

  return withSurface.map(({ entry }) => entry);
}

/**
 * Recovery selection when every domain entry has been filtered out (rejected).
 *
 * Returns the domain entry with the lowest surfacedAt position — the one shown
 * earliest in the session, and therefore the least-recently-surfaced option.
 * Prefer this over generic fallback copy because it stays in the correct domain.
 *
 * Returns null only when allEntries is empty.
 */
export function recoverLeastRecentlySurfaced<T extends FallbackEntryLike>(
  allEntries: T[],
  surfacedPositions: Map<string, number>,
): T | null {
  if (allEntries.length === 0) return null;
  const sorted = [...allEntries].sort((a, b) => {
    const aPos = surfacedPositions.get(a.title.toLowerCase()) ?? Infinity;
    const bPos = surfacedPositions.get(b.title.toLowerCase()) ?? Infinity;
    if (aPos !== bPos) return aPos - bPos;
    return a.id.localeCompare(b.id);
  });
  return sorted[0] ?? null;
}
