import { describe, expect, it } from "vitest";
import { createDecisionViewModelFromUGC } from "../viewModel";
import type { SpontaneousObject } from "@/types/hade";

describe("createDecisionViewModelFromUGC", () => {
  it("adapts a created UGC object into a renderable decision view model", () => {
    const createdAt = Date.now();
    const expiresAt = createdAt + 2 * 60 * 60 * 1000;
    const activity: SpontaneousObject = {
      id: "ugc-created-1",
      type: "ugc_event",
      title: "Sunset Sketch Meetup",
      time_window: { start: createdAt, end: expiresAt },
      location: { lat: 39.7392, lng: -104.9903 },
      radius: 240,
      going_count: 2,
      maybe_count: 1,
      user_state: null,
      created_at: createdAt,
      expires_at: expiresAt,
      trust_score: 0.72,
      vibe_tag: "creative",
      source: "user",
      location_label: "Bluebird Cafe patio",
      location_source: "manual",
    };

    const viewModel = createDecisionViewModelFromUGC(activity);

    expect(viewModel).not.toBeNull();
    expect(viewModel).toMatchObject({
      id: "ugc-created-1",
      title: "Sunset Sketch Meetup",
      category: "creative",
      confidence: 0.72,
      is_ugc: true,
      is_fallback: false,
      engine_source: "synthetic",
      cta_label: "Navigate",
      show_time_label: true,
      show_going_ui: true,
    });
    expect(viewModel?.object).toMatchObject({
      id: "ugc-created-1",
      type: "ugc_event",
      title: "Sunset Sketch Meetup",
      location: { lat: 39.7392, lng: -104.9903 },
      source: "user",
      vibe_tag: "creative",
      location_label: "Bluebird Cafe patio",
      location_source: "manual",
    });
    expect(viewModel?.ugc_meta).toEqual({
      is_ugc: true,
      created_at: new Date(createdAt).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
      distance_copy: "Right around the corner",
    });
  });
});
