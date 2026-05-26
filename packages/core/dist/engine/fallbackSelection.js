// src/engine/fallbackSelection.ts
function extractRejectedVenueIds(body) {
  const raw = body?.rejection_history;
  if (!Array.isArray(raw)) return /* @__PURE__ */ new Set();
  const ids = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const id = entry.venue_id;
    if (typeof id === "string" && id.length > 0) ids.push(id);
  }
  return new Set(ids);
}
function extractSurfacedFallbackTitles(body) {
  const raw = body?.surfaced_history;
  if (!Array.isArray(raw)) return /* @__PURE__ */ new Map();
  const result = /* @__PURE__ */ new Map();
  raw.forEach((entry, i) => {
    if (!entry || typeof entry !== "object") return;
    const name = entry.venue_name;
    if (typeof name === "string" && name.trim().length > 0) {
      const key = name.trim().toLowerCase();
      if (!result.has(key)) result.set(key, i);
    }
  });
  return result;
}
function sortFallbackCandidates(scoredEntries, surfacedPositions) {
  const withSurface = scoredEntries.map(({ entry, contextScore }) => ({
    entry,
    contextScore,
    surfacedAt: surfacedPositions.get(entry.title.toLowerCase()) ?? Infinity
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
function recoverLeastRecentlySurfaced(allEntries, surfacedPositions) {
  if (allEntries.length === 0) return null;
  const sorted = [...allEntries].sort((a, b) => {
    const aPos = surfacedPositions.get(a.title.toLowerCase()) ?? Infinity;
    const bPos = surfacedPositions.get(b.title.toLowerCase()) ?? Infinity;
    if (aPos !== bPos) return aPos - bPos;
    return a.id.localeCompare(b.id);
  });
  return sorted[0] ?? null;
}

export { extractRejectedVenueIds, extractSurfacedFallbackTitles, recoverLeastRecentlySurfaced, sortFallbackCandidates };
//# sourceMappingURL=fallbackSelection.js.map
//# sourceMappingURL=fallbackSelection.js.map