/**
 * Deterministic wellness query resolver.
 *
 * Maps AmbientSignals → a single target pillar by applying a 9-rule
 * precedence ladder. Precedence is ordered "strongest body signal wins":
 * physiological signals (fatigue, acute stress) beat circadian signals,
 * which beat weather signals, which beat day-type signals.
 *
 * Returns the matched rule number/label so the UI can render WHY this
 * pillar won — used to power the experiential "Why" copy and the small
 * "Active rule" debug strip in the demo container.
 */

import { PILLAR_CONFIG } from "./pillars";
import type { AmbientSignals, ResolvedQuery, WellnessPillar } from "./types";

interface PrecedenceRule {
  id: number;
  label: string;
  test: (signals: AmbientSignals) => boolean;
  pillar: WellnessPillar;
}

const PRECEDENCE: readonly PrecedenceRule[] = [
  {
    id: 1,
    label: "You seem tired, so recovery comes first",
    test: (s) => s.userStressSignal === "fatigued",
    pillar: "Longevity",
  },
  {
    id: 2,
    label: "Stress is high, so quieter is better",
    test: (s) => s.userStressSignal === "high",
    pillar: "Mindfulness",
  },
  {
    id: 3,
    label: "It is late enough to wind down",
    test: (s) => s.timeOfDay === "evening" || s.timeOfDay === "night",
    pillar: "Longevity",
  },
  {
    id: 4,
    label: "Morning is a good time to move gently",
    test: (s) => s.timeOfDay === "morning",
    pillar: "Somatic Movement",
  },
  {
    id: 5,
    label: "Midday is a good window to refuel",
    test: (s) => s.timeOfDay === "midday" || s.timeOfDay === "afternoon",
    pillar: "Nourishment",
  },
  {
    id: 6,
    label: "Weather favors an indoor reset",
    test: (s) => s.weather === "overcast" || s.weather === "rainy",
    pillar: "Mindfulness",
  },
  {
    id: 7,
    label: "Good conditions for getting outside",
    test: (s) => s.weather === "sunny" && s.userStressSignal === "baseline",
    pillar: "Somatic Movement",
  },
  {
    id: 8,
    label: "Weekend pace favors something slower",
    test: (s) => s.dayOfWeek === "weekend" && s.userStressSignal === "baseline",
    pillar: "Nourishment",
  },
];

const FALLBACK_RULE = {
  id: 9,
  label: "A quiet reset is the safest starting point",
  pillar: "Mindfulness" as WellnessPillar,
};

export function resolveWellnessQuery(signals: AmbientSignals): ResolvedQuery {
  const matched =
    PRECEDENCE.find((rule) => rule.test(signals)) ?? null;

  const pillar = matched?.pillar ?? FALLBACK_RULE.pillar;
  const matchedRule = matched?.id ?? FALLBACK_RULE.id;
  const matchedRuleLabel = matched?.label ?? FALLBACK_RULE.label;

  const cfg = PILLAR_CONFIG[pillar];

  return {
    pillar,
    matchedRule,
    matchedRuleLabel,
    source: "ambient",
    googlePlaceTypes: cfg.googlePlaceTypes,
    keywords: cfg.keywords,
  };
}
