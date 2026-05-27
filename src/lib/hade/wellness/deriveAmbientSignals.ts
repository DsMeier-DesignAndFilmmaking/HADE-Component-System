/**
 * Pure, SSR-safe derivation of AmbientSignals from a Date.
 *
 * The wellness engine treats ambient context as invisible infrastructure:
 * time-of-day and day-type are derived deterministically from the local
 * clock; weather and stress are marked "unknown" because no real sensors
 * are wired up in this demo. Marking them "unknown" rather than guessing
 * keeps the resolver honest and lets badge / footer logic gate gracefully.
 *
 * SSR safety: callers MUST either pass a fixed `now` (deterministic) or
 * use `SSR_DEFAULT_SIGNALS` for the initial render, then update to a real
 * `new Date()` after mount. This prevents server-vs-client hydration drift.
 */

import type { AmbientSignals, DayOfWeek, TimeOfDay } from "./types";

export function deriveTimeOfDay(hour: number): TimeOfDay {
  // Anchored on the spec's loose guidance but extended slightly so the
  // ambient resolver can still distinguish midday from afternoon (matters
  // for the "Context suggests Nourishment" hint surfaced when the user
  // picks low_effort_reset on a weekday midday).
  if (hour >= 5 && hour <= 10) return "morning";
  if (hour >= 11 && hour <= 14) return "midday";
  if (hour >= 15 && hour <= 16) return "afternoon";
  if (hour >= 17 && hour <= 20) return "evening";
  return "night";
}

export function deriveDayOfWeek(weekday: number): DayOfWeek {
  // Date.getDay() — 0 = Sunday, 6 = Saturday.
  return weekday === 0 || weekday === 6 ? "weekend" : "weekday";
}

/**
 * Pure. Deterministic when `now` is provided.
 * Calling without `now` reads the local clock — only safe on the client.
 */
export function deriveAmbientSignals(now: Date = new Date()): AmbientSignals {
  return {
    timeOfDay: deriveTimeOfDay(now.getHours()),
    dayOfWeek: deriveDayOfWeek(now.getDay()),
    weather: "unknown",
    userStressSignal: "unknown",
  };
}

/**
 * Stable SSR seed. The hook initializes with this on first render so the
 * server-rendered HTML matches the first client paint exactly — no hydration
 * mismatch — then swaps to the real `deriveAmbientSignals(new Date())` on
 * mount via useEffect.
 */
export const SSR_DEFAULT_SIGNALS: AmbientSignals = {
  timeOfDay: "midday",
  dayOfWeek: "weekday",
  weather: "unknown",
  userStressSignal: "unknown",
};
