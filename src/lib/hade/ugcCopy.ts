/**
 * ugcCopy.ts — UGC card copy system.
 *
 * All user-facing strings for UGC decision cards are defined here.
 * No copy is embedded in components — import from this module instead.
 *
 * Temporal state computation uses a 5-minute bucket (matching the backend
 * `bucketedNowMs()` in weights.ts) so labels are stable across renders
 * within the same window.
 */

import type { UiState } from "@/types/hade";

// ─── Temporal state ───────────────────────────────────────────────────────────

export type TemporalState =
  | "happening_now"  // timeToExpiry < 2h OR timeSinceCreated < 30min
  | "on_tonight"     // timeToExpiry in [2h, 6h)
  | "on_today"       // timeToExpiry in [6h, 24h)
  | "this_week"      // timeToExpiry >= 24h
  | "spotted_nearby" // no expires_at (permanent entry)
  | "wrapping_up"    // timeToExpiry in [15min, 30min)
  | "suppressed";    // timeToExpiry < 15min — card must not render

export const TEMPORAL_COPY: Record<Exclude<TemporalState, "suppressed">, string> = {
  happening_now:  "Happening right now",
  on_tonight:     "On tonight",
  on_today:       "On today",
  this_week:      "Around this week",
  spotted_nearby: "Spotted nearby",
  wrapping_up:    "Wrapping up soon",
};

// 5-minute bucket matches backend bucketedNowMs() — prevents label flicker
const BUCKET_MS     = 5 * 60 * 1000;
const SUPPRESS_MS   = 15 * 60 * 1000;
const WRAP_UP_MS    = 30 * 60 * 1000;
const HAPPENING_MS  = 2 * 60 * 60 * 1000;
const FRESH_CREATED = 30 * 60 * 1000;
const SIX_HOURS_MS  = 6 * 60 * 60 * 1000;
const DAY_MS        = 24 * 60 * 60 * 1000;

function bucketedNow(): number {
  return Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
}

/**
 * Derives temporal state from `expires_at` and `created_at`.
 * Returns `"suppressed"` when the entry has < 15 minutes remaining —
 * callers must not render UGC cards in this state.
 */
export function computeTemporalState(
  expires_at: string | undefined,
  created_at: string,
): TemporalState {
  const now = bucketedNow();
  const timeSinceCreated = now - Date.parse(created_at);

  if (!expires_at) return "spotted_nearby";

  const timeToExpiry = Date.parse(expires_at) - now;

  if (timeToExpiry <= 0)          return "suppressed";
  if (timeToExpiry < SUPPRESS_MS) return "suppressed";
  if (timeToExpiry < WRAP_UP_MS)  return "wrapping_up";
  // "Happening now": very fresh entry OR < 2 h remaining
  if (timeSinceCreated < FRESH_CREATED || timeToExpiry < HAPPENING_MS) return "happening_now";
  if (timeToExpiry < SIX_HOURS_MS) return "on_tonight";
  if (timeToExpiry < DAY_MS)       return "on_today";
  return "this_week";
}

// ─── Distance buckets ─────────────────────────────────────────────────────────

/**
 * Human-readable walking proximity copy.
 * UGC cards use buckets ("Around the corner") instead of numeric distance.
 * Google cards keep their existing numeric display — do not use this for them.
 */
export function getDistanceCopy(meters: number): string {
  if (meters < 80)   return "Steps away";
  if (meters < 300)  return "Right around the corner";
  if (meters < 600)  return "Around the corner";
  if (meters < 1200) return "A short walk";
  const mins = Math.round(meters / 80); // ~80 m/min walking pace
  return `${mins} min walk`;
}

// ─── CTA matrix ───────────────────────────────────────────────────────────────

/**
 * UGC-specific CTA labels.
 * `wrapping_up` temporal state overrides the confidence axis entirely.
 */
export function getUGCCta(temporal: TemporalState, ui_state: UiState): string {
  if (temporal === "wrapping_up") return "Head over now";
  switch (ui_state) {
    case "high":   return "Head over";
    case "medium": return "Check it out";
    case "low":    return "Sounds interesting?";
  }
}

// ─── Pivot reasons ────────────────────────────────────────────────────────────

/** Stable UGC pivot reasons (always shown). */
export const UGC_PIVOT_REASONS_BASE = [
  "Too far",
  "Doesn't sound right",
  "Wrong vibe",
  "Not what I'm after",
] as const;

/** Reason added for entries older than 2 hours. */
export const UGC_FEELS_OUTDATED = "Feels outdated" as const;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Returns the UGC pivot reason grid for a given entry.
 * "Feels outdated" is suppressed for fresh entries (< 2h old) to prevent
 * false trust-score penalties on newly created moments.
 */
export function getUGCPivotReasons(created_at: string): string[] {
  const timeSinceCreated = Date.now() - Date.parse(created_at);
  const showOutdated = timeSinceCreated >= TWO_HOURS_MS;
  return showOutdated
    ? [...UGC_PIVOT_REASONS_BASE, UGC_FEELS_OUTDATED]
    : [...UGC_PIVOT_REASONS_BASE];
}

// ─── "Why this?" sentence assembly ───────────────────────────────────────────

export interface ExplanationSignals {
  distance_meters: number;
  temporal: TemporalState;
  trust_level: "high" | "moderate" | "none";
  vibe_match: "strong" | "moderate" | "none";
  is_verified: boolean;
}

/**
 * Assembles 1–3 plain-language sentences for the "Why this?" bottom sheet.
 * No numbers, no scores, no internal terminology.
 */
export function getUGCExplanationSentences(signals: ExplanationSignals): string[] {
  const sentences: string[] = [];

  // 1. Always lead with proximity
  if (signals.distance_meters < 80) {
    sentences.push("It's practically on your route right now.");
  } else if (signals.distance_meters < 300) {
    sentences.push("It's one of the closest options to you right now.");
  } else if (signals.distance_meters < 600) {
    sentences.push("It's close enough to reach quickly.");
  } else {
    sentences.push("It's reachable without too much effort from where you are.");
  }

  // 2. UGC temporal / verification
  if (sentences.length < 3) {
    const { temporal, is_verified, trust_level } = signals;
    if (temporal === "happening_now" || temporal === "wrapping_up") {
      if (is_verified || trust_level === "high") {
        sentences.push("Someone added this recently and people have confirmed it's there.");
      } else {
        sentences.push("Someone added this recently — it hasn't been confirmed yet.");
      }
    } else if (temporal !== "suppressed") {
      if (is_verified || trust_level !== "none") {
        sentences.push("People have checked and confirmed it's there.");
      } else {
        sentences.push("Someone nearby added this — it hasn't been confirmed yet.");
      }
    }
  }

  // 3. Vibe match (if space remains)
  if (sentences.length < 3 && signals.vibe_match !== "none") {
    if (signals.vibe_match === "strong") {
      sentences.push("The atmosphere tends to fit what you've been gravitating toward.");
    } else {
      sentences.push("The vibe feels right for where you are today.");
    }
  }

  return sentences.slice(0, 3);
}
