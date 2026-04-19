import type {
  HadeContext,
  HadeConfig,
  HadeDecision,
  Opportunity,
  Intent,
  TimeOfDay,
  DayType,
  GeoLocation,
  Signal,
  ScoringWeights,
} from "@/types/hade";
import { DEFAULT_SCORING_WEIGHTS } from "@/types/hade";

// ─── Config-driven maps (loaded once at module init) ─────────────────────────

// Inline JSON imports so the maps are available in both Node (API routes)
// and Edge/browser (hooks) without dynamic import() race conditions.
import intentAffinityMap  from "@/config/intent_affinity_map.json";
import timeIntentDefaults from "@/config/time_intent_defaults.json";

const _affinityMap = intentAffinityMap  as unknown as Record<string, string[]>;
const _timeIntents = timeIntentDefaults as unknown as Record<string, string | null>;

// ─── Default Config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<HadeConfig> = {
  api_url: process.env.NEXT_PUBLIC_HADE_API_URL ?? "/api",
  default_radius: 1500,
  auto_emit_presence: false,
  trust_threshold: 0.3,
};

// ─── Time Derivation ──────────────────────────────────────────────────────────

/**
 * Derives TimeOfDay with 6-bucket resolution from the current clock.
 * More precise than the legacy 4-value enum — drives intent inference.
 */
export function getTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 13) return "midday";
  if (h >= 13 && h < 17) return "afternoon";
  if (h >= 17 && h < 19) return "early_evening";
  if (h >= 19 && h < 22) return "evening";
  return "late_night";
}

/**
 * Derives DayType with 5-bucket resolution.
 * weekend_prime = the highest social energy window of the locale's week.
 *
 * @param locale - Optional IETF BCP-47 locale tag. Defaults to "en-US".
 *   The locale's week structure determines which days are "prime" (the
 *   culturally significant high-energy evening, typically Fri–Sat in US/EU).
 *   Pass "en-AE" for a Fri–Sat work week, "en-IL" for Sun–Thu, etc.
 *
 *   Currently uses a simplified prime-day map; a full locale-aware
 *   implementation can replace primeDays without changing the signature.
 */
export function getDayType(locale: string = "en-US"): DayType {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const h   = now.getHours();

  // Locale-aware prime days: the two highest-energy evenings of the week
  const primeDays = getPrimeDays(locale);

  // Prime evening: after 18:00 on a prime day
  if (primeDays.has(day) && h >= 18) return "weekend_prime";

  // Weekend daytime — Sat or Sun in most locales
  const weekendDays = getWeekendDays(locale);
  if (weekendDays.has(day)) return "weekend";

  // Weekday after 18:00
  if (h >= 18) return "weekday_evening";

  return "weekday";
}

/** Returns the set of JS day indices (0=Sun…6=Sat) that are "prime" evenings. */
function getPrimeDays(locale: string): Set<number> {
  // Middle East work week (Fri–Sat off): Thu/Fri evenings are prime
  if (locale.endsWith("-AE") || locale.endsWith("-SA") || locale.endsWith("-QA")) {
    return new Set([4, 5]); // Thu, Fri
  }
  // Israel (Sun–Thu work week): Fri/Sat evenings prime
  if (locale.endsWith("-IL")) return new Set([5, 6]); // Fri, Sat
  // Default (US/EU Fri–Sat)
  return new Set([5, 6]); // Fri, Sat
}

/** Returns the set of JS day indices that are the weekend rest days. */
function getWeekendDays(locale: string): Set<number> {
  if (locale.endsWith("-AE") || locale.endsWith("-SA") || locale.endsWith("-QA")) {
    return new Set([5, 6]); // Fri, Sat
  }
  if (locale.endsWith("-IL")) return new Set([5, 6]); // Fri, Sat
  return new Set([0, 6]); // Sun, Sat (default)
}

// ─── buildContext ─────────────────────────────────────────────────────────────

/**
 * Constructs a fully-resolved HadeContext from partial user input.
 * Applies defaults for all nested groups. Auto-derives time and day type.
 *
 * Supports deep partial merging for nested groups — callers can provide
 * a partial HadeContext and each nested field will be merged with defaults.
 */
export function buildContext(
  input: Partial<HadeContext>,
  config: HadeConfig = {}
): HadeContext {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    geo: input.geo ?? null,
    time_of_day: input.time_of_day ?? getTimeOfDay(),
    day_type: input.day_type ?? getDayType(),

    situation: {
      intent: input.situation?.intent ?? null,
      urgency: input.situation?.urgency ?? "low",
    },

    state: {
      energy: input.state?.energy ?? "medium",
      openness: input.state?.openness ?? "open",
    },

    social: {
      group_size: input.social?.group_size ?? 1,
      group_type: input.social?.group_type ?? "solo",
    },

    constraints: {
      budget: input.constraints?.budget,
      time_available_minutes: input.constraints?.time_available_minutes,
      distance_tolerance: input.constraints?.distance_tolerance,
    },

    radius_meters: input.radius_meters ?? cfg.default_radius,
    session_id: input.session_id ?? null,
    signals: input.signals ?? [],
    rejection_history: input.rejection_history ?? [],
  };
}

// ─── generateSituationSummary ─────────────────────────────────────────────────

/**
 * Collapses the full HadeContext into a single natural-language anchor sentence.
 *
 * This summary is the primary "anchor" for LLM reasoning — it prevents the
 * model from hallucinating context by giving it a concise human-readable
 * description of the exact moment being decided for.
 *
 * Output format:
 * "{Day/Time}, {social}, {energy} energy, {openness}[, {intent}][, {constraints}]."
 *
 * Examples:
 * "Saturday prime evening, couple, high energy, adventurous, no specific intent, 2-hour window, walking distance, medium budget."
 * "Late night on a weekday, solo, low energy, wants comfort, looking to eat."
 * "Sunday afternoon, friends (4), medium energy, open to anything, low budget."
 */
export function generateSituationSummary(context: HadeContext): string {
  const parts: string[] = [];

  // 1. Time + Day
  parts.push(formatTimePart(context.time_of_day, context.day_type));

  // 2. Social
  parts.push(formatSocialPart(context.social.group_size, context.social.group_type));

  // 3. Energy + Openness
  parts.push(formatStatePart(context.state.energy, context.state.openness));

  // 4. Intent (if set)
  const intentPhrase = formatIntentPart(context.situation.intent, context.time_of_day);
  if (intentPhrase) parts.push(intentPhrase);

  // 5. Constraints (only those with meaningful values)
  const constraintPhrases = formatConstraintsPart(context.constraints);
  parts.push(...constraintPhrases);

  return parts.join(", ") + ".";
}

function formatTimePart(time: TimeOfDay, day: DayType): string {
  const timeLabels: Record<TimeOfDay, string> = {
    morning: "morning",
    midday: "midday",
    afternoon: "afternoon",
    early_evening: "early evening",
    evening: "evening",
    late_night: "late night",
  };

  switch (day) {
    case "weekend_prime":
      return `${capitalizeFirst(timeLabels[time])} on a prime weekend`;
    case "weekend":
      return `${capitalizeFirst(timeLabels[time])} on a weekend`;
    case "weekday_evening":
      return `${capitalizeFirst(timeLabels[time])} on a weekday`;
    case "weekday":
      return `${capitalizeFirst(timeLabels[time])} on a weekday`;
    case "holiday":
      return `${capitalizeFirst(timeLabels[time])} on a holiday`;
  }
}

function formatSocialPart(groupSize: number, groupType: GroupType): string {
  if (groupSize === 1) return "solo";
  if (groupType === "couple") return "couple";
  if (groupType === "friends") return `friends (${groupSize})`;
  if (groupType === "family") return `family (${groupSize})`;
  if (groupType === "work") return `work group (${groupSize})`;
  return `group of ${groupSize}`;
}

function formatStatePart(energy: string, openness: string): string {
  const energyLabel = energy === "medium" ? "medium energy" : `${energy} energy`;

  const opennessLabel: Record<string, string> = {
    comfort: "wants familiar comfort",
    open: "open to anything",
    adventurous: "adventurous",
  };

  return `${energyLabel}, ${opennessLabel[openness] ?? openness}`;
}

function formatIntentPart(intent: Intent | null, time: TimeOfDay): string | null {
  if (!intent || intent === "anything") {
    // Derive implied intent from time of day
    const implied = inferIntentFromTime(time);
    if (implied) return `no specific intent (likely ${implied})`;
    return "no specific intent";
  }

  const intentLabels: Record<Intent, string> = {
    eat: "looking to eat",
    drink: "wants a drink",
    chill: "looking to chill",
    scene: "wants a scene",
    anything: "no specific intent",
  };

  return intentLabels[intent];
}

function formatConstraintsPart(constraints: HadeContext["constraints"]): string[] {
  const parts: string[] = [];

  if (constraints.time_available_minutes) {
    const hours = Math.floor(constraints.time_available_minutes / 60);
    const mins = constraints.time_available_minutes % 60;
    if (hours > 0 && mins > 0) parts.push(`${hours}h ${mins}min window`);
    else if (hours > 0) parts.push(`${hours}-hour window`);
    else parts.push(`${mins}-minute window`);
  }

  if (constraints.distance_tolerance && constraints.distance_tolerance !== "any") {
    const labels: Record<string, string> = {
      walking: "walking distance only",
      short_drive: "short drive okay",
    };
    parts.push(labels[constraints.distance_tolerance] ?? constraints.distance_tolerance);
  }

  if (constraints.budget && constraints.budget !== "unlimited") {
    parts.push(`${constraints.budget} budget`);
  }

  return parts;
}

// ─── Intent Inference ─────────────────────────────────────────────────────────

/**
 * When intent is null or "anything", infer the most likely intent
 * from the time of day. Driven by config/time_intent_defaults.json —
 * edit that file to change inference rules for a new domain or locale.
 */
export function inferIntentFromTime(time: TimeOfDay): Intent | null {
  const raw = _timeIntents[time];
  if (!raw) return null;
  return raw as Intent;
}

// ─── scoreOpportunity ─────────────────────────────────────────────────────────

/**
 * Computes a composite 0–1 score for a candidate venue given the current context.
 *
 * Weights are configurable via the `weights` parameter (defaults to
 * DEFAULT_SCORING_WEIGHTS: proximity 0.4, signal 0.35, intent 0.25).
 * Override via HadeSettings.scoring_weights for per-user or per-domain tuning.
 *
 * Used to pre-filter venue candidates before the LLM call.
 * The LLM may override this ranking — this is a pre-filter, not the decision.
 */
export function scoreOpportunity(
  opp:             Opportunity,
  ctx:             HadeContext,
  maxRadiusMeters?: number,
  weights:         ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): number {
  const radius = maxRadiusMeters ?? ctx.radius_meters;

  // Proximity score: inverse linear decay over radius
  const proximityScore = Math.max(0, 1 - opp.distance_meters / radius);

  // Signal strength score: average trust attribution edge weight
  const signalScore =
    opp.trust_attributions.length > 0
      ? opp.trust_attributions.reduce((sum, a) => sum + a.edge_weight, 0) /
        opp.trust_attributions.length
      : opp.primary_signal?.strength ?? 0;

  // Intent alignment: resolve null intent before scoring
  const resolvedIntent =
    ctx.situation.intent === null || ctx.situation.intent === "anything"
      ? inferIntentFromTime(ctx.time_of_day)
      : ctx.situation.intent;

  const intentScore = resolvedIntent
    ? getIntentAlignmentScore(opp.category, resolvedIntent)
    : 0.5;

  return (
    proximityScore * weights.proximity +
    signalScore    * weights.signal    +
    intentScore    * weights.intent
  );
}

/**
 * Returns an alignment score [0, 1] for a venue category given an intent.
 * Uses the config-driven intent_affinity_map.json — edit that file to add
 * new verticals without touching this function.
 */
function getIntentAlignmentScore(category: string, intent: Intent): number {
  const keywords: string[] = _affinityMap[intent] ?? [];
  const cat = category.toLowerCase();
  return keywords.some((k) => cat.includes(k)) ? 1.0 : 0.2;
}

// ─── rankOpportunities ────────────────────────────────────────────────────────

/**
 * Sorts candidate venues by composite score descending.
 * Returns top candidates for LLM pre-filtering — not the final decision.
 */
export function rankOpportunities(
  opps: Opportunity[],
  ctx: HadeContext
): Opportunity[] {
  return opps
    .map((opp) => ({ ...opp, score: scoreOpportunity(opp, ctx) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

// ─── generateRationale (legacy fallback) ─────────────────────────────────────

/**
 * Client-side rationale fallback. Used only when the backend provides no rationale.
 * Production rationale is generated by the LLM via prompt.ts — this is a stub.
 */
export function generateRationale(
  opp: Opportunity,
  ctx: HadeContext
): string {
  if (opp.rationale) return opp.rationale;

  const timeLabel: Record<TimeOfDay, string> = {
    morning: "this morning",
    midday: "at lunch",
    afternoon: "this afternoon",
    early_evening: "this evening",
    evening: "tonight",
    late_night: "late tonight",
  };

  const firstAttribution = opp.trust_attributions[0];
  if (firstAttribution?.quote) {
    return `${firstAttribution.display_name}, ${firstAttribution.time_ago}: "${firstAttribution.quote}"`;
  }

  if (firstAttribution) {
    return `${firstAttribution.display_name} was here ${firstAttribution.time_ago} — ${timeLabel[ctx.time_of_day]} looks right.`;
  }

  if (opp.primary_signal?.content) {
    return opp.primary_signal.content;
  }

  // This line is the quality floor — the LLM should never let it surface
  return `Worth a look${opp.neighborhood ? ` in ${opp.neighborhood}` : " nearby"}.`;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export function getDefaultConfig(): Required<HadeConfig> {
  return { ...DEFAULT_CONFIG };
}

// ─── Geo Utilities ────────────────────────────────────────────────────────────

export function haversineDistanceMeters(a: GeoLocation, b: GeoLocation): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const ac =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(ac), Math.sqrt(1 - ac));
}

export function signalsWithinRadius(
  signals: Signal[],
  origin: GeoLocation,
  radiusMeters: number
): Signal[] {
  return signals.filter(
    (s) => haversineDistanceMeters(origin, s.geo) <= radiusMeters
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Re-export GroupType for use in formatSocialPart without importing from types
type GroupType = "solo" | "couple" | "friends" | "family" | "work";
