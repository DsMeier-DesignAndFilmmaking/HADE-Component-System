import { describe, expect, it } from "vitest";
import { deriveAmbientSignals } from "@/lib/hade/wellness/deriveAmbientSignals";
import { resolveWellnessIntent } from "@/lib/hade/wellness/resolveWellnessIntent";
import type {
  AmbientSignals,
  WellnessIntent,
  WellnessPillar,
} from "@/lib/hade/wellness/types";

const baseSignals = (): AmbientSignals =>
  deriveAmbientSignals(new Date(2026, 4, 26, 13, 0, 0)); // Tue midday

describe("resolveWellnessIntent — intent → pillar mapping", () => {
  const cases: Array<[WellnessIntent, WellnessPillar]> = [
    ["clear_head", "Mindfulness"],
    ["decompress", "Mindfulness"],
    ["gentle_movement", "Somatic Movement"],
    ["healthy_nearby", "Nourishment"],
    ["restore_energy", "Longevity"],
    // low_effort_reset is soft — tested separately
  ];

  it.each(cases)("intent %s -> primary pillar %s", (intent, pillar) => {
    const r = resolveWellnessIntent(intent, baseSignals());
    expect(r.pillar).toBe(pillar);
    expect(r.source).toBe("intent");
    // ruleLabel comes from the intent metadata — non-empty and human-readable
    expect(r.matchedRuleLabel.length).toBeGreaterThan(0);
  });
});

describe("resolveWellnessIntent — intent overrides ambient context", () => {
  it("'decompress' stays Mindfulness even when ambient signals would suggest Somatic Movement", () => {
    // Sunny morning baseline triggers ambient rule 4/7 → Somatic Movement.
    // But explicit decompress intent must override.
    const signals: AmbientSignals = {
      timeOfDay: "morning",
      dayOfWeek: "weekday",
      weather: "sunny",
      userStressSignal: "baseline",
    };
    const r = resolveWellnessIntent("decompress", signals);
    expect(r.pillar).toBe("Mindfulness");
    expect(r.source).toBe("intent");
  });

  it("'gentle_movement' stays Somatic Movement even when ambient says Longevity (fatigued)", () => {
    const signals: AmbientSignals = {
      timeOfDay: "evening",
      dayOfWeek: "weekday",
      weather: "unknown",
      userStressSignal: "fatigued",
    };
    const r = resolveWellnessIntent("gentle_movement", signals);
    expect(r.pillar).toBe("Somatic Movement");
  });
});

describe("resolveWellnessIntent — low_effort_reset soft tilt", () => {
  it("stays Mindfulness when ambient resolver returns Mindfulness (default fallback / unknown signals)", () => {
    // Unknown weather/stress + night → no rule matches → ambient rule 9 falls back to Mindfulness.
    const signals: AmbientSignals = {
      timeOfDay: "night",
      dayOfWeek: "weekday",
      weather: "unknown",
      userStressSignal: "unknown",
    };
    const r = resolveWellnessIntent("low_effort_reset", signals);
    // Evening/night actually fires ambient rule 3 (Longevity) — not in the tilt
    // allowlist, so we keep the intent's primary pillar (Mindfulness).
    // Night maps to ambient rule 3? No, "night" isn't "evening" — rules 3 only
    // matches evening|night. Night IS in rule 3, so ambient says Longevity.
    // Longevity is not in the tilt allowlist → keep primary Mindfulness.
    expect(r.pillar).toBe("Mindfulness");
  });

  it("tilts to Nourishment when ambient resolver returns Nourishment (midday weekday baseline)", () => {
    const signals: AmbientSignals = {
      timeOfDay: "midday",
      dayOfWeek: "weekday",
      weather: "unknown",
      userStressSignal: "baseline",
    };
    const r = resolveWellnessIntent("low_effort_reset", signals);
    expect(r.pillar).toBe("Nourishment");
    expect(r.source).toBe("intent");
  });
});

describe("resolveWellnessIntent — undefined intent falls back to ambient resolver", () => {
  it("returns source: 'ambient' when no intent is supplied", () => {
    const signals: AmbientSignals = {
      timeOfDay: "morning",
      dayOfWeek: "weekday",
      weather: "sunny",
      userStressSignal: "baseline",
    };
    const r = resolveWellnessIntent(undefined, signals);
    expect(r.source).toBe("ambient");
    // Morning fires ambient rule 4 → Somatic Movement.
    expect(r.pillar).toBe("Somatic Movement");
  });
});

describe("resolveWellnessIntent — unknown signals safety", () => {
  it("does not throw when all signals are 'unknown'", () => {
    const signals: AmbientSignals = {
      timeOfDay: "midday",
      dayOfWeek: "weekday",
      weather: "unknown",
      userStressSignal: "unknown",
    };
    // Predicates compare exact strings — 'unknown' never matches any weather
    // or stress rule. Midday matches ambient rule 5 → Nourishment. Demonstrates
    // graceful degradation when no real sensors are wired up.
    expect(() => resolveWellnessIntent(undefined, signals)).not.toThrow();
    const r = resolveWellnessIntent(undefined, signals);
    expect(r.pillar).toBe("Nourishment");
  });

  it("intent path still works when signals are 'unknown'", () => {
    const signals: AmbientSignals = {
      timeOfDay: "midday",
      dayOfWeek: "weekday",
      weather: "unknown",
      userStressSignal: "unknown",
    };
    const r = resolveWellnessIntent("restore_energy", signals);
    expect(r.pillar).toBe("Longevity");
  });
});
