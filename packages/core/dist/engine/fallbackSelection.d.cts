/**
 * Pure helpers for Tier 3 static fallback selection.
 *
 * No Next.js or Redis imports — every function here is testable in isolation.
 * route.ts imports these and composes them with the catalog and context.
 */
/** Minimal interface satisfied by FallbackCatalogEntry and generic fallback entries. */
interface FallbackEntryLike {
    id: string;
    title: string;
}
/**
 * Extracts venue_ids from rejection_history so buildFallbackCandidates can
 * filter real Google Places results before serving them as fallback decisions.
 * Static catalog entries (id prefixed "fallback-") are never in rejection_history
 * due to the client pivot guard, so this only affects the live-Places path.
 */
declare function extractRejectedVenueIds(body?: Record<string, unknown> | null): Set<string>;
/**
 * Extracts surfaced_history venue_names → Map<normalizedTitle, positionInHistory>.
 *
 * Position 0 = shown earliest in this session (least recently surfaced).
 * Only the first occurrence of each title is stored so the position is stable
 * across multiple surfacings of the same entry.
 */
declare function extractSurfacedFallbackTitles(body?: Record<string, unknown> | null): Map<string, number>;
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
declare function sortFallbackCandidates<T extends FallbackEntryLike>(scoredEntries: Array<{
    entry: T;
    contextScore: number;
}>, surfacedPositions: Map<string, number>): T[];
/**
 * Recovery selection when every domain entry has been filtered out (rejected).
 *
 * Returns the domain entry with the lowest surfacedAt position — the one shown
 * earliest in the session, and therefore the least-recently-surfaced option.
 * Prefer this over generic fallback copy because it stays in the correct domain.
 *
 * Returns null only when allEntries is empty.
 */
declare function recoverLeastRecentlySurfaced<T extends FallbackEntryLike>(allEntries: T[], surfacedPositions: Map<string, number>): T | null;

export { type FallbackEntryLike, extractRejectedVenueIds, extractSurfacedFallbackTitles, recoverLeastRecentlySurfaced, sortFallbackCandidates };
