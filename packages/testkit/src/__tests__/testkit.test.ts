/**
 * Smoke tests for @hade/testkit's public API. Verifies every fixture and mock
 * produces a structurally-valid value and that the call-recording contract
 * holds.
 */
import { describe, expect, it } from "vitest";
import { createHade } from "@hade/core";

import {
  makeConfig as cfgFromIndex,
  makeDecision as decisionFromIndex,
  makeDecisionEngineOutput as outFromIndex,
  makeVenueCandidate as candidateFromIndex,
  makeVenueCandidate,
  resetDecisionCounter,
  resetVenueCandidateCounter,
  mockVenueAdapter,
  mockLLMAdapter,
  mockCacheAdapter,
  mockGeoAdapter,
  fakeClock,
} from "../index.js";

describe("@hade/testkit — fixtures", () => {
  it("makeConfig deep-merges with built-in defaults", () => {
    const cfg = cfgFromIndex({ active_domain: "ecommerce" });
    expect(cfg.active_domain).toBe("ecommerce");
    expect(cfg.domains.ecommerce?.default_radius_meters).toBe(0);
    expect(cfg.copy.locale).toBe("en-US");
    expect(cfg.scoring.profiles.balanced).toBeDefined();
  });

  it("makeDecision returns structurally-valid HadeDecisionLike", () => {
    resetDecisionCounter();
    const d = decisionFromIndex();
    expect(d.id).toBe("decision-1");
    expect(d.geo).toEqual({ lat: 40.7128, lng: -74.006 });
    expect(d.confidence).toBeGreaterThanOrEqual(0);
    expect(d.confidence).toBeLessThanOrEqual(1);
  });

  it("makeDecisionEngineOutput routes through fromHadeDecision (derived fields populated)", () => {
    const out = outFromIndex({ confidence: 0.9 });
    expect(out.output_version).toBe("1.0");
    expect(out.confidence.band).toBe("high");
    expect(out.copy_tokens.keys["action.primary_cta"]).toBe("Go now");
    expect(out.ux_state.next_action).toBe("commit");
  });

  it("makeVenueCandidate auto-increments IDs", () => {
    resetVenueCandidateCounter();
    const a = candidateFromIndex();
    const b = candidateFromIndex();
    expect(a.id).toBe("venue-1");
    expect(b.id).toBe("venue-2");
  });
});

describe("@hade/testkit — mock adapters with createHade", () => {
  it("mockVenueAdapter records calls + serves scripted batches", async () => {
    resetVenueCandidateCounter();
    const venue = mockVenueAdapter({
      batches: [[makeVenueCandidate({ name: "Joe's", category: "pizza" })]],
    });

    const client = createHade({ adapters: { venue } });
    const output = await client.decide({
      geo: { lat: 40.71, lng: -74.01 },
      situation: { intent: "eat" },
    });

    expect(venue.calls).toHaveLength(1);
    expect(venue.calls[0]?.kind).toBe("searchForContext");
    expect(output.decision.venue_name).toBe("Joe's");
    expect(output.is_fallback).toBe(false);
  });

  it("mockVenueAdapter alwaysFail bubbles through createHade as a fallback", async () => {
    const venue = mockVenueAdapter({ alwaysFail: true });
    const client = createHade({ adapters: { venue } });
    const output = await client.decide({ geo: { lat: 40.71, lng: -74.01 } });
    expect(output.is_fallback).toBe(true);
    expect(output.fallback_meta?.reason).toBe("places_timeout");
  });

  it("mockLLMAdapter records prompts + returns scripted responses", async () => {
    const llm = mockLLMAdapter({ responses: [{ rationale: "test rationale" }] });
    const result = await llm.enhanceCopy("hello world", { model: "test" });
    expect(result).toEqual({ rationale: "test rationale" });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.prompt).toBe("hello world");
    expect(llm.calls[0]?.options?.model).toBe("test");
  });

  it("mockCacheAdapter records get/set + preserves initial entries", async () => {
    const cache = mockCacheAdapter({ initial: { warm: "value" } });
    expect(await cache.get("warm")).toBe("value");
    await cache.set("cold", { foo: "bar" }, 60);
    expect(await cache.get("cold")).toEqual({ foo: "bar" });
    expect(cache.calls).toHaveLength(3);
    expect(cache.calls[2]).toEqual({ kind: "get", key: "cold", hit: true });
  });

  it("mockGeoAdapter drains coord queue then returns null", async () => {
    const geo = mockGeoAdapter({
      coords: [{ lat: 1, lng: 2 }, null, { lat: 3, lng: 4 }],
    });
    expect(await geo.resolveCoords()).toEqual({ lat: 1, lng: 2 });
    expect(await geo.resolveCoords()).toBeNull();
    expect(await geo.resolveCoords()).toEqual({ lat: 3, lng: 4 });
    expect(await geo.resolveCoords()).toBeNull(); // queue exhausted
    expect(geo.calls).toBe(4);
  });
});

describe("@hade/testkit — fakeClock", () => {
  it("freezes Date.now and Math.random, advances on demand, restores cleanly", () => {
    const originalNow = Date.now();
    const clock = fakeClock({ nowMs: 1_700_000_000_000, randomSeed: 0.42 });
    try {
      expect(Date.now()).toBe(1_700_000_000_000);
      expect(Math.random()).toBe(0.42);
      clock.advance(60_000);
      expect(Date.now()).toBe(1_700_000_060_000);
    } finally {
      clock.restore();
    }
    expect(Date.now()).toBeGreaterThanOrEqual(originalNow);
    expect(Math.random()).not.toBe(0.42);
  });
});
