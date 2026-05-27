/**
 * Signal → PillBadge mapping.
 *
 * Pure function — returns up to 2 badges per the precedence order below.
 * Color classes reference the existing tailwind `signal-*` color tokens
 * (see tailwind.config.ts → extend.colors.signal).
 */

import type { AmbientSignals, PillBadge, WellnessIntent } from "./types";

type BadgePredicate = (signals: AmbientSignals) => boolean;

interface BadgeRule {
  predicate: BadgePredicate;
  badge: PillBadge;
}

const PILL_BASE =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase";

// Ordered by precedence. First two matches are returned.
const BADGE_RULES: readonly BadgeRule[] = [
  {
    predicate: (s) => s.userStressSignal === "high",
    badge: {
      emoji: "🧘",
      label: "Quiet Reset",
      className: `${PILL_BASE} bg-signal-ambient/15 text-signal-ambient`,
    },
  },
  {
    predicate: (s) => s.userStressSignal === "fatigued",
    badge: {
      emoji: "🌙",
      label: "Recovery Time",
      className: `${PILL_BASE} bg-signal-social/15 text-signal-social`,
    },
  },
  {
    predicate: (s) => s.weather === "rainy",
    badge: {
      emoji: "🧖",
      label: "Indoor Comfort",
      className: `${PILL_BASE} bg-signal-environmental/15 text-signal-environmental`,
    },
  },
  {
    predicate: (s) => s.weather === "overcast",
    badge: {
      emoji: "☁️",
      label: "Mood Lift",
      className: `${PILL_BASE} bg-signal-environmental/15 text-signal-environmental`,
    },
  },
  {
    predicate: (s) => s.weather === "sunny",
    badge: {
      emoji: "☀️",
      label: "Good Weather",
      className: `${PILL_BASE} bg-signal-behavioral/15 text-signal-behavioral`,
    },
  },
  {
    predicate: (s) => s.weather === "heatwave",
    badge: {
      emoji: "🔥",
      label: "Heat Refuge",
      className: `${PILL_BASE} bg-signal-event/15 text-signal-event`,
    },
  },
  {
    predicate: (s) => s.weather === "cold",
    badge: {
      emoji: "❄️",
      label: "Warm-Up Stop",
      className: `${PILL_BASE} bg-signal-environmental/15 text-signal-environmental`,
    },
  },
  {
    predicate: (s) => s.timeOfDay === "morning",
    badge: {
      emoji: "🌅",
      label: "Morning Momentum",
      className: `${PILL_BASE} bg-signal-presence/15 text-signal-presence`,
    },
  },
  {
    predicate: (s) => s.timeOfDay === "evening" || s.timeOfDay === "night",
    badge: {
      emoji: "🌒",
      label: "Wind-Down",
      className: `${PILL_BASE} bg-signal-social/15 text-signal-social`,
    },
  },
  {
    predicate: (s) => s.dayOfWeek === "weekend",
    badge: {
      emoji: "🪴",
      label: "Weekend Restoration",
      className: `${PILL_BASE} bg-signal-presence/15 text-signal-presence`,
    },
  },
];

const MAX_BADGES = 2;

export function getBadgesForSignals(signals: AmbientSignals): PillBadge[] {
  const matches: PillBadge[] = [];
  for (const rule of BADGE_RULES) {
    // Predicates check exact string equality (e.g. `s.weather === "rainy"`),
    // so "unknown" weather / stress values simply fail every predicate
    // and emit no badge. That's the intended graceful degradation when
    // no real sensor is wired up.
    if (rule.predicate(signals)) {
      matches.push(rule.badge);
      if (matches.length === MAX_BADGES) break;
    }
  }
  return matches;
}

/**
 * Intent-derived badge (shown first, prepended to ambient badges).
 *
 * Returned independently so callers can render it even when ambient signals
 * are entirely "unknown" (typical at first paint before client mount).
 */
const INTENT_BADGES: Record<WellnessIntent, PillBadge> = {
  clear_head: {
    emoji: "🧘",
    label: "Mental Reset",
    className: `${PILL_BASE} bg-signal-ambient/15 text-signal-ambient`,
  },
  decompress: {
    emoji: "🌬",
    label: "Quiet Reset",
    className: `${PILL_BASE} bg-signal-ambient/15 text-signal-ambient`,
  },
  gentle_movement: {
    emoji: "🧎",
    label: "Gentle Movement",
    className: `${PILL_BASE} bg-signal-presence/15 text-signal-presence`,
  },
  healthy_nearby: {
    emoji: "🍵",
    label: "Nourishment Stop",
    className: `${PILL_BASE} bg-signal-behavioral/15 text-signal-behavioral`,
  },
  restore_energy: {
    emoji: "🛁",
    label: "Recovery Time",
    className: `${PILL_BASE} bg-signal-social/15 text-signal-social`,
  },
  low_effort_reset: {
    emoji: "✨",
    label: "Low-Effort Reset",
    className: `${PILL_BASE} bg-signal-social/15 text-signal-social`,
  },
};

export function getIntentBadge(
  intent: WellnessIntent | undefined,
): PillBadge | undefined {
  return intent ? INTENT_BADGES[intent] : undefined;
}

/**
 * Combined badge feed for the card. Intent badge first (when present),
 * then up to one ambient badge — capped at MAX_BADGES.
 */
export function getBadgesForContext(
  signals: AmbientSignals,
  intent: WellnessIntent | undefined,
): PillBadge[] {
  const out: PillBadge[] = [];
  const intentBadge = getIntentBadge(intent);
  if (intentBadge) out.push(intentBadge);

  for (const rule of BADGE_RULES) {
    if (out.length === MAX_BADGES) break;
    if (rule.predicate(signals)) {
      // Avoid double-emitting a redundant duplicate label.
      if (out.some((b) => b.label === rule.badge.label)) continue;
      out.push(rule.badge);
    }
  }
  return out;
}
