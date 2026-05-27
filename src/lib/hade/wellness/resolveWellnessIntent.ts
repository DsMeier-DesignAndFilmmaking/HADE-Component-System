/**
 * Intent-first wellness resolver.
 *
 * Priority order:
 *   1. Explicit selectedIntent (primary user signal).
 *   2. Ambient context derived from Date (via legacy resolveWellnessQuery)
 *      — used only when no intent is selected.
 *   3. Mindfulness default (rule 9 in the ambient resolver).
 *
 * The legacy 9-rule ambient resolver is preserved and exposed separately as
 * `resolveAmbientContext` so the decision card can surface a passive
 * "Context suggests …" hint without overriding the intent-driven result.
 */

import { getIntentMeta, WELLNESS_INTENTS } from "./intents";
import { PILLAR_CONFIG } from "./pillars";
import { resolveWellnessQuery } from "./resolveWellnessQuery";
import type {
  AmbientSignals,
  ResolvedQuery,
  WellnessIntent,
  WellnessPillar,
} from "./types";

/**
 * Returns a ResolvedQuery driven by the selected intent (primary path) or
 * the ambient resolver (when no intent is provided).
 */
export function resolveWellnessIntent(
  intent: WellnessIntent | undefined,
  signals: AmbientSignals,
): ResolvedQuery {
  if (intent) {
    const meta = getIntentMeta(intent);
    let pillar: WellnessPillar = meta.primaryPillar;

    // `low_effort_reset` is a soft intent — let ambient context tilt the
    // pillar between Mindfulness (the primary) and Nourishment (a sensible
    // alternative when ambient signals lean toward a midday/weekend bite).
    // All other intents are firm: explicit user signal beats context.
    if (intent === "low_effort_reset") {
      const ambient = resolveWellnessQuery(signals);
      if (
        ambient.pillar === "Nourishment" ||
        ambient.pillar === "Mindfulness"
      ) {
        pillar = ambient.pillar;
      }
    }

    const cfg = PILLAR_CONFIG[pillar];
    const intentIndex = WELLNESS_INTENTS.findIndex((m) => m.id === intent);

    return {
      pillar,
      matchedRule: intentIndex + 1, // 1-based per intent slot
      matchedRuleLabel: meta.ruleLabel,
      source: "intent",
      googlePlaceTypes: cfg.googlePlaceTypes,
      keywords: cfg.keywords,
    };
  }

  // No explicit intent — defer to the legacy ambient resolver.
  // Its return already carries source: "ambient" since the 'unknown' update.
  return resolveWellnessQuery(signals);
}

/**
 * Always returns the ambient resolver's read — used by the card to render a
 * passive "Context suggests {pillar}" hint when it differs from the
 * intent-driven recommendation. Never authoritative.
 */
export function resolveAmbientContext(signals: AmbientSignals): ResolvedQuery {
  return resolveWellnessQuery(signals);
}
