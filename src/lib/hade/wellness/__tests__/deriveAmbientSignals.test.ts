import { describe, expect, it } from "vitest";
import {
  deriveAmbientSignals,
  deriveDayOfWeek,
  deriveTimeOfDay,
  SSR_DEFAULT_SIGNALS,
} from "@/lib/hade/wellness/deriveAmbientSignals";

describe("deriveTimeOfDay", () => {
  it.each([
    [5, "morning"],
    [7, "morning"],
    [10, "morning"],
    [11, "midday"],
    [12, "midday"],
    [14, "midday"],
    [15, "afternoon"],
    [16, "afternoon"],
    [17, "evening"],
    [19, "evening"],
    [20, "evening"],
    [21, "night"],
    [23, "night"],
    [0, "night"],
    [2, "night"],
    [4, "night"],
  ])("hour %i -> %s", (hour, expected) => {
    expect(deriveTimeOfDay(hour)).toBe(expected);
  });
});

describe("deriveDayOfWeek", () => {
  it.each([
    [0, "weekend"], // Sun
    [1, "weekday"], // Mon
    [2, "weekday"],
    [3, "weekday"],
    [4, "weekday"],
    [5, "weekday"], // Fri
    [6, "weekend"], // Sat
  ])("weekday index %i -> %s", (day, expected) => {
    expect(deriveDayOfWeek(day)).toBe(expected);
  });
});

describe("deriveAmbientSignals", () => {
  it("is deterministic for a fixed Date", () => {
    // 2026-05-26 is a Tuesday (weekday). 13:30 local time → midday.
    const fixed = new Date(2026, 4, 26, 13, 30, 0);
    const result = deriveAmbientSignals(fixed);
    expect(result).toEqual({
      timeOfDay: "midday",
      dayOfWeek: "weekday",
      weather: "unknown",
      userStressSignal: "unknown",
    });
  });

  it("always marks weather and stress as unknown (no sensors)", () => {
    const result = deriveAmbientSignals(new Date(2026, 0, 1, 9, 0, 0));
    expect(result.weather).toBe("unknown");
    expect(result.userStressSignal).toBe("unknown");
  });

  it("SSR_DEFAULT_SIGNALS is a stable midday weekday seed", () => {
    expect(SSR_DEFAULT_SIGNALS).toEqual({
      timeOfDay: "midday",
      dayOfWeek: "weekday",
      weather: "unknown",
      userStressSignal: "unknown",
    });
  });
});
