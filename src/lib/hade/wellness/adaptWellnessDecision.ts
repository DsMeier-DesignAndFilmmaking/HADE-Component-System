/**
 * Adapter — Wellness engine → main HADE card model.
 *
 * The wellness engine produces a rich result (intent, resolved pillar,
 * ambient context, filtered + rejected places). The main HADE decision
 * surfaces (DecisionCard / HeroDecisionCard) expect a simpler header /
 * subtitle / why-this shape derived from a single recommendation.
 *
 * Rather than force a fragile conversion into the backend's `HadeDecision`
 * type (which carries confidence, ux_state, signals, time_window, etc.
 * the wellness engine does not produce), this adapter emits a small
 * `WellnessCardModel` — a shape both the standalone WellnessDecisionCard
 * and any future "main card embedded with wellness data" can consume.
 *
 * Pure function — safe to call during render. No hooks, no side effects.
 */

import { getIntentMeta } from "./intents";
import { PILLAR_CONFIG } from "./pillars";
import type { UseWellnessEngineResult } from "./useWellnessEngine";
import type {
  WellnessIntent,
  WellnessPillar,
  WellnessPlace,
} from "./types";

export interface WellnessCardModel {
  /** Top-pick venue title; null when no kept results (graceful empty state). */
  title: string | null;
  /** Pillar-level subtitle, e.g. "Mindfulness Reset · 0.3 mi". */
  subtitle: string;
  /** Detailed why-this reasons (intent + context + filtering). */
  whyThis: string[];
  /** Pre-formatted distance for the top pick, or null. */
  distance: string | null;
  /** Pillar label for the chip / category line. */
  pillarLabel: WellnessPillar;
  /** Active intent, surfaced as the user-facing "why we picked this". */
  intent: WellnessIntent | undefined;
  /** Number of places kept after the cleanliness rule. */
  keptCount: number;
  /** Number of generic results filtered out (drives the filter footer). */
  rejectedCount: number;
  /** Names of rejected generic places, for transparency. */
  rejectedNames: string[];
  /** Provenance: identifies this card as coming from the local wellness engine. */
  source: "wellness_local_engine";
}

/**
 * Build the calmer, "context-feel" subtitle used by the main demo card chrome.
 * Example: "Weekday midday reset · 0.3 mi"
 */
function buildContextSubtitle(
  result: UseWellnessEngineResult,
  topDistance: string | null,
): string {
  const headerLabel = PILLAR_CONFIG[result.activePillar].headerLabel;
  const distancePart = topDistance ? ` · ${topDistance}` : "";
  return `${headerLabel}${distancePart}`;
}

function topPlace(places: readonly WellnessPlace[]): WellnessPlace | undefined {
  if (places.length === 0) return undefined;
  // Stable "best pick" = highest rating, then shortest distance (text sort
  // is fine — distance strings are formatted as "0.4 mi" / "1.2 mi").
  return [...places].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return a.distance.localeCompare(b.distance);
  })[0];
}

export function adaptWellnessDecisionToCardModel(
  result: UseWellnessEngineResult,
): WellnessCardModel {
  const top = topPlace(result.places);
  const intentMeta = result.selectedIntent
    ? getIntentMeta(result.selectedIntent)
    : undefined;

  // Build a few human-friendly "why_this" lines. Engine internals (rule
  // numbers, raw enum names, sensor unknowns) never appear here.
  const whyThis: string[] = [];

  if (intentMeta) {
    whyThis.push(`Picked for your ${intentMeta.label.toLowerCase()} mood.`);
  }
  if (result.contextHint.pillar === result.resolved.pillar) {
    whyThis.push(
      `A good fit for a ${result.ambientSignals.dayOfWeek} ${result.ambientSignals.timeOfDay} reset.`,
    );
  } else if (intentMeta) {
    whyThis.push(
      `The moment also leans ${result.contextHint.pillar.toLowerCase()}, but your choice keeps this ${result.resolved.pillar.toLowerCase()}.`,
    );
  }
  if (result.rejectedCount > 0) {
    whyThis.push(
      `Left out ${result.rejectedCount} vague ${
        result.rejectedCount === 1 ? "option" : "options"
      } so the pick stays specific.`,
    );
  }
  if (top) {
    whyThis.push(top.contextualWhy);
  }

  return {
    title: top?.name ?? null,
    subtitle: buildContextSubtitle(result, top?.distance ?? null),
    whyThis,
    distance: top?.distance ?? null,
    pillarLabel: result.activePillar,
    intent: result.selectedIntent,
    keptCount: result.places.length,
    rejectedCount: result.rejectedCount,
    rejectedNames: result.rejectedNames,
    source: "wellness_local_engine",
  };
}
