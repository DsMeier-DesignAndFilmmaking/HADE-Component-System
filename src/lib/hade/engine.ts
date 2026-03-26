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
} from "@/types/hade";

// ─── Default Config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<HadeConfig> = {
  api_url: process.env.NEXT_PUBLIC_HADE_API_URL ?? "http://localhost:8000",
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
 * weekend_prime = Friday/Saturday evening — the highest social energy window.
 */
export function getDayType(): DayType {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const h = now.getHours();

  // Friday or Saturday after 18:00 = weekend prime
  if ((day === 5 || day === 6) && h >= 18) return "weekend_prime";

  // Saturday or Sunday daytime
  if (day === 0 || day === 6) return "weekend";

  // Weekday after 18:00
  if (h >= 18) return "weekday_evening";

  return "weekday";
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
 * from the time of day. Used in situation summary and backend scoring.
 */
export function inferIntentFromTime(time: TimeOfDay): Intent | null {
  switch (time) {
    case "morning":
    case "midday":
      return "eat";
    case "afternoon":
      return "chill";
    case "early_evening":
    case "evening":
      return "eat";
    case "late_night":
      return "drink";
    default:
      return null;
  }
}

// ─── scoreOpportunity ─────────────────────────────────────────────────────────

/**
 * Computes a composite 0–1 score for a candidate venue given the current context.
 * Weights: proximity (40%), signal strength (35%), intent alignment (25%).
 *
 * Used to pre-filter venue candidates before the LLM call.
 * The LLM may override this ranking — this is a pre-filter, not the decision.
 */
export function scoreOpportunity(
  opp: Opportunity,
  ctx: HadeContext,
  maxRadiusMeters?: number
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

  return proximityScore * 0.4 + signalScore * 0.35 + intentScore * 0.25;
}

function getIntentAlignmentScore(category: string, intent: Intent): number {
  const affinityMap: Record<Intent, string[]> = {
    eat: ["restaurant", "cafe", "food", "dining", "brunch", "bistro", "brasserie"],
    drink: ["bar", "cocktail", "wine", "brewery", "lounge", "pub", "tavern"],
    chill: ["park", "coffee", "bookstore", "gallery", "spa", "museum", "garden"],
    scene: ["club", "rooftop", "lounge", "event", "popup", "venue", "nightlife"],
    anything: [],
  };

  const keywords = affinityMap[intent] ?? [];
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
