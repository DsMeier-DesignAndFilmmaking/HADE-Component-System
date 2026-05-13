import { describe, it, expect } from "vitest";
import {
  extractRejectedVenueIds,
  extractSurfacedFallbackTitles,
  sortFallbackCandidates,
  recoverLeastRecentlySurfaced,
} from "../fallbackSelection";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const entryA = { id: "food-quick-counter", title: "Pick a simple counter-service meal" };
const entryB = { id: "food-cafe-pause",    title: "Use a cafe as the reset point" };
const entryC = { id: "food-group-casual",  title: "Choose the most consensus-friendly casual place" };

function makeBody(
  rejectionHistory: Array<{ venue_id: string; venue_name?: string }> = [],
  surfacedHistory: Array<{ venue_id: string; venue_name: string }> = [],
): Record<string, unknown> {
  return {
    rejection_history: rejectionHistory.map((r) => ({
      venue_id: r.venue_id,
      venue_name: r.venue_name ?? r.venue_id,
      pivot_reason: "test",
    })),
    surfaced_history: surfacedHistory,
  };
}

// ─── extractRejectedVenueIds ───────────────────────────────────────────────────

describe("extractRejectedVenueIds", () => {
  it("returns empty set when body is null", () => {
    expect(extractRejectedVenueIds(null).size).toBe(0);
  });

  it("returns empty set when rejection_history is absent", () => {
    expect(extractRejectedVenueIds({}).size).toBe(0);
  });

  it("extracts venue_ids from valid rejection entries", () => {
    const body = makeBody([{ venue_id: "place-A" }, { venue_id: "place-B" }]);
    const ids = extractRejectedVenueIds(body);
    expect(ids.has("place-A")).toBe(true);
    expect(ids.has("place-B")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("ignores entries with non-string or empty venue_id", () => {
    const body = {
      rejection_history: [
        { venue_id: "" },
        { venue_id: 42 },
        { venue_id: null },
        { venue_id: "valid-id" },
      ],
    };
    const ids = extractRejectedVenueIds(body);
    expect(ids.size).toBe(1);
    expect(ids.has("valid-id")).toBe(true);
  });
});

// ─── extractSurfacedFallbackTitles ────────────────────────────────────────────

describe("extractSurfacedFallbackTitles", () => {
  it("returns empty map when body is null", () => {
    expect(extractSurfacedFallbackTitles(null).size).toBe(0);
  });

  it("returns empty map when surfaced_history is absent", () => {
    expect(extractSurfacedFallbackTitles({}).size).toBe(0);
  });

  it("maps normalised titles to their first-occurrence position", () => {
    const body = makeBody([], [
      { venue_id: "f-0", venue_name: "Use a cafe as the reset point" },
      { venue_id: "f-1", venue_name: "Pick a simple counter-service meal" },
    ]);
    const positions = extractSurfacedFallbackTitles(body);
    expect(positions.get("use a cafe as the reset point")).toBe(0);
    expect(positions.get("pick a simple counter-service meal")).toBe(1);
  });

  it("stores only the first occurrence when a title appears multiple times", () => {
    const body = makeBody([], [
      { venue_id: "f-0", venue_name: "Pick a simple counter-service meal" },
      { venue_id: "f-1", venue_name: "Use a cafe as the reset point" },
      { venue_id: "f-2", venue_name: "Pick a simple counter-service meal" }, // duplicate
    ]);
    const positions = extractSurfacedFallbackTitles(body);
    expect(positions.get("pick a simple counter-service meal")).toBe(0); // first occurrence
    expect(positions.size).toBe(2); // not 3
  });

  it("normalises case and trims whitespace", () => {
    const body = makeBody([], [
      { venue_id: "f-0", venue_name: "  USE A CAFE AS THE RESET POINT  " },
    ]);
    const positions = extractSurfacedFallbackTitles(body);
    expect(positions.has("use a cafe as the reset point")).toBe(true);
  });
});

// ─── sortFallbackCandidates ───────────────────────────────────────────────────

describe("sortFallbackCandidates", () => {
  it("unsurfaced entries rank above surfaced entries with the same context score", () => {
    const surfacedPositions = new Map([["use a cafe as the reset point", 0]]);
    const input = [
      { entry: entryA, contextScore: 2 }, // unsurfaced
      { entry: entryB, contextScore: 2 }, // surfaced
    ];
    const result = sortFallbackCandidates(input, surfacedPositions);
    expect(result[0].id).toBe(entryA.id);
    expect(result[1].id).toBe(entryB.id);
  });

  it("among unsurfaced entries, higher context score wins", () => {
    const surfacedPositions = new Map<string, number>();
    const input = [
      { entry: entryA, contextScore: 1 },
      { entry: entryB, contextScore: 3 },
      { entry: entryC, contextScore: 2 },
    ];
    const [first, second, third] = sortFallbackCandidates(input, surfacedPositions);
    expect(first.id).toBe(entryB.id);  // score 3
    expect(second.id).toBe(entryC.id); // score 2
    expect(third.id).toBe(entryA.id);  // score 1
  });

  it("among surfaced entries, least-recently-surfaced (lowest position) ranks first", () => {
    const surfacedPositions = new Map([
      ["use a cafe as the reset point", 5],                              // shown later
      ["pick a simple counter-service meal", 1],                         // shown earlier
    ]);
    const input = [
      { entry: entryA, contextScore: 2 }, // surfaced at 1
      { entry: entryB, contextScore: 2 }, // surfaced at 5
    ];
    const result = sortFallbackCandidates(input, surfacedPositions);
    expect(result[0].id).toBe(entryA.id); // least recently surfaced wins
  });

  it("unsurfaced entry beats twice-surfaced even when context score is lower", () => {
    const surfacedPositions = new Map([["use a cafe as the reset point", 0]]);
    const input = [
      { entry: entryA, contextScore: 0 }, // unsurfaced, low score
      { entry: entryB, contextScore: 5 }, // surfaced, high score
    ];
    const result = sortFallbackCandidates(input, surfacedPositions);
    expect(result[0].id).toBe(entryA.id);
  });

  it("returns empty array for empty input", () => {
    expect(sortFallbackCandidates([], new Map())).toEqual([]);
  });
});

// ─── recoverLeastRecentlySurfaced ─────────────────────────────────────────────

describe("recoverLeastRecentlySurfaced", () => {
  it("returns null for empty entry list", () => {
    expect(recoverLeastRecentlySurfaced([], new Map())).toBeNull();
  });

  it("returns the entry surfaced at the lowest position (shown earliest)", () => {
    const surfacedPositions = new Map([
      ["use a cafe as the reset point", 0],           // shown first
      ["pick a simple counter-service meal", 3],      // shown later
    ]);
    const result = recoverLeastRecentlySurfaced([entryA, entryB], surfacedPositions);
    expect(result?.id).toBe(entryB.id); // entryB = "Use a cafe...", surfaced at 0
  });

  it("prefers any surfaced entry over unsurfaced (Infinity) for recovery", () => {
    const surfacedPositions = new Map([["use a cafe as the reset point", 2]]);
    // entryA is NOT in surfaced history (Infinity), entryB is at position 2
    const result = recoverLeastRecentlySurfaced([entryA, entryB], surfacedPositions);
    // entryB has position 2, entryA has Infinity — entryB (lower pos) wins
    expect(result?.id).toBe(entryB.id);
  });

  it("uses id.localeCompare as a stable tie-break when positions are equal", () => {
    const surfacedPositions = new Map<string, number>(); // neither surfaced
    const result = recoverLeastRecentlySurfaced([entryB, entryA], surfacedPositions);
    // Both at Infinity, tie-break by id: "food-cafe-pause" < "food-quick-counter"
    expect(result?.id).toBe(entryB.id);
  });
});

// ─── Integration: session repeat avoidance ────────────────────────────────────

describe("session repeat avoidance (combined)", () => {
  it("first request with no history surfaces best context-matched entry", () => {
    const scored = [
      { entry: entryA, contextScore: 3 },
      { entry: entryB, contextScore: 1 },
      { entry: entryC, contextScore: 2 },
    ];
    const result = sortFallbackCandidates(scored, new Map());
    expect(result[0].id).toBe(entryA.id);
  });

  it("second request with entryA already surfaced surfaces entryC next", () => {
    const surfacedPositions = new Map([
      [entryA.title.toLowerCase(), 0], // entryA was just shown
    ]);
    const scored = [
      { entry: entryA, contextScore: 3 }, // surfaced
      { entry: entryB, contextScore: 1 }, // unsurfaced
      { entry: entryC, contextScore: 2 }, // unsurfaced
    ];
    const result = sortFallbackCandidates(scored, surfacedPositions);
    // Unsurfaced (C, score 2) beats unsurfaced (B, score 1) beats surfaced (A)
    expect(result[0].id).toBe(entryC.id);
    expect(result[1].id).toBe(entryB.id);
    expect(result[2].id).toBe(entryA.id);
  });

  it("when all entries are surfaced, returns the one shown earliest", () => {
    const surfacedPositions = new Map([
      [entryA.title.toLowerCase(), 2], // shown third
      [entryB.title.toLowerCase(), 0], // shown first
      [entryC.title.toLowerCase(), 1], // shown second
    ]);
    const scored = [
      { entry: entryA, contextScore: 3 },
      { entry: entryB, contextScore: 3 },
      { entry: entryC, contextScore: 3 },
    ];
    const result = sortFallbackCandidates(scored, surfacedPositions);
    expect(result[0].id).toBe(entryB.id); // shown earliest (pos 0)
    expect(result[1].id).toBe(entryC.id); // shown second (pos 1)
    expect(result[2].id).toBe(entryA.id); // shown latest (pos 2)
  });
});
