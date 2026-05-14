import { describe, it, expect } from "vitest";
import { parseVoiceIntent } from "../voiceIntentParser";

describe("parseVoiceIntent", () => {
  // ─── Intent detection ──────────────────────────────────────────────────────

  it("detects eat intent", () => {
    expect(parseVoiceIntent("I'm hungry, find me something to eat").intent).toBe("eat");
  });

  it("detects drink intent from coffee", () => {
    expect(parseVoiceIntent("Find me coffee and a place to sit").intent).toBe("drink");
  });

  it("detects chill intent from quiet", () => {
    expect(parseVoiceIntent("I want something quiet nearby").intent).toBe("chill");
  });

  it("detects scene intent from social", () => {
    expect(parseVoiceIntent("Something social but low pressure").intent).toBe("scene");
  });

  it("detects scene intent from interesting", () => {
    expect(parseVoiceIntent("Something interesting but not a restaurant").intent).toBe("scene");
  });

  it("detects anything intent", () => {
    expect(parseVoiceIntent("Anything is fine, surprise me").intent).toBe("anything");
  });

  it("returns null intent when no keywords match", () => {
    expect(parseVoiceIntent("I don't know").intent).toBeNull();
  });

  it("eat beats chill when both keywords present (first-match order)", () => {
    const result = parseVoiceIntent("hungry and want to relax");
    expect(result.intent).toBe("eat");
  });

  // ─── Urgency ───────────────────────────────────────────────────────────────

  it("sets urgency high from explicit time ≤ 20 min", () => {
    const result = parseVoiceIntent("I only have 20 minutes");
    expect(result.urgency).toBe("high");
    expect(result.constraints?.time_available_minutes).toBe(20);
  });

  it("sets time but not high urgency for 30-min window", () => {
    const result = parseVoiceIntent("I have half an hour");
    expect(result.constraints?.time_available_minutes).toBe(30);
    expect(result.urgency).not.toBe("high");
  });

  it("sets urgency high from keyword", () => {
    expect(parseVoiceIntent("I need somewhere quick").urgency).toBe("high");
  });

  it("sets urgency low from 'no rush'", () => {
    expect(parseVoiceIntent("No rush, take it slow").urgency).toBe("low");
  });

  it("sets urgency low when tired keyword present", () => {
    expect(parseVoiceIntent("I'm tired, keep it close").urgency).toBe("low");
  });

  it("returns null urgency when no urgency signal", () => {
    expect(parseVoiceIntent("Find me coffee").urgency).toBeNull();
  });

  // ─── Energy state ──────────────────────────────────────────────────────────

  it("sets low energy from exhausted", () => {
    expect(parseVoiceIntent("I'm exhausted, keep it close").state?.energy).toBe("low");
  });

  it("sets high energy", () => {
    expect(parseVoiceIntent("I'm feeling energetic tonight").state?.energy).toBe("high");
  });

  it("does not set state when no energy keyword", () => {
    expect(parseVoiceIntent("Find me coffee").state).toBeUndefined();
  });

  // ─── Distance ──────────────────────────────────────────────────────────────

  it("sets walking from nearby", () => {
    expect(parseVoiceIntent("something nearby please").constraints?.distance_tolerance).toBe("walking");
  });

  it("sets walking from close", () => {
    expect(parseVoiceIntent("I'm tired, keep it close").constraints?.distance_tolerance).toBe("walking");
  });

  it("sets short_drive", () => {
    expect(parseVoiceIntent("maybe a short drive is fine").constraints?.distance_tolerance).toBe("short_drive");
  });

  it("sets any distance", () => {
    expect(parseVoiceIntent("anywhere, doesn't matter how far").constraints?.distance_tolerance).toBe("any");
  });

  // ─── Category exclusion ────────────────────────────────────────────────────

  it("excludes food categories from 'not a restaurant'", () => {
    const result = parseVoiceIntent("Something interesting but not a restaurant");
    expect(result.candidate_categories_exclude).toContain("restaurant");
    expect(result.candidate_categories_exclude).toContain("cafe");
  });

  it("excludes food from 'no food'", () => {
    expect(parseVoiceIntent("no food tonight").candidate_categories_exclude).toBeDefined();
  });

  it("does not exclude when no exclusion phrase", () => {
    expect(parseVoiceIntent("Find me coffee").candidate_categories_exclude).toBeUndefined();
  });

  // ─── Combinations ──────────────────────────────────────────────────────────

  it("handles combination: tired + close + no food", () => {
    const result = parseVoiceIntent("I'm tired, keep it close, no food");
    expect(result.state?.energy).toBe("low");
    expect(result.constraints?.distance_tolerance).toBe("walking");
    expect(result.candidate_categories_exclude).toBeDefined();
  });

  it("handles: something social but low pressure", () => {
    const result = parseVoiceIntent("Something social but low pressure");
    expect(result.intent).toBe("scene");
    expect(result.urgency).toBe("low");
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────

  it("returns all null for empty string", () => {
    const result = parseVoiceIntent("");
    expect(result.intent).toBeNull();
    expect(result.urgency).toBeNull();
    expect(result.state).toBeUndefined();
    expect(result.constraints).toBeUndefined();
    expect(result.parsed_summary).toBe("No preferences detected");
  });

  it("handles ALL CAPS transcript", () => {
    expect(parseVoiceIntent("I WANT COFFEE NEARBY").intent).toBe("drink");
    expect(parseVoiceIntent("I WANT COFFEE NEARBY").constraints?.distance_tolerance).toBe("walking");
  });

  it("handles transcript with punctuation", () => {
    expect(parseVoiceIntent("Coffee, please! Something nearby...").intent).toBe("drink");
  });

  it("preserves raw_transcript exactly", () => {
    const raw = "Find me COFFEE nearby!";
    expect(parseVoiceIntent(raw).raw_transcript).toBe(raw);
  });

  it("parsed_summary is non-empty for non-empty transcript", () => {
    expect(parseVoiceIntent("coffee").parsed_summary.length).toBeGreaterThan(0);
  });

  it("parsed_summary contains readable label for detected mood", () => {
    expect(parseVoiceIntent("I want coffee").parsed_summary).toContain("Drink");
  });

  it("parsed_summary includes time when detected", () => {
    expect(parseVoiceIntent("only 15 minutes").parsed_summary).toContain("15 min");
  });
});
