import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
import {
  createVenueAdapter,
  registerDefaultAdapters,
  resetAdapterRegistryForTests,
} from "@hade/core";
import type { HadeContext } from "@/types/hade";

describe("getPlacesCandidates", () => {
  beforeEach(() => {
    resetAdapterRegistryForTests();
  });

  it("delegates to the registered venue adapter", async () => {
    const searchForContext = vi.fn().mockResolvedValue([
      {
        id: "ctx-1",
        name: "Context Venue",
        category: "bar",
        vibe: "lively",
        geo: { lat: 10, lng: 20 },
        distance_meters: 50,
        is_open: true,
      },
    ]);

    registerDefaultAdapters({
      venue: createVenueAdapter({
        id: "test",
        searchNearby: async () => [],
        searchMultiQuery: async () => [],
        searchForContext,
      }),
    });

    const { getPlacesCandidates } = await import("@/core/adapters/placesAdapter");

    const context = {
      geo: { lat: 10, lng: 20 },
      radius_meters: 900,
      situation: { intent: "drink", urgency: "medium" },
    } as HadeContext;

    const results = await getPlacesCandidates(context, ["bar", "cafe"]);

    expect(searchForContext).toHaveBeenCalledWith(
      {
        geo: { lat: 10, lng: 20 },
        radius_meters: 900,
        situation: { intent: "drink", urgency: "medium" },
      },
      ["bar", "cafe"],
    );
    expect(results[0]?.name).toBe("Context Venue");
  });
});
