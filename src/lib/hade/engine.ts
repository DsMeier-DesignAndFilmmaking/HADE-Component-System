import type {
  HadeContext,
  HadeConfig,
  Opportunity,
  Intent,
  EnergyLevel,
  GeoLocation,
  Signal,
} from "@/types/hade";

// ─── Default Context ──────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<HadeConfig> = {
  api_url: process.env.NEXT_PUBLIC_HADE_API_URL ?? "http://localhost:8000",
  default_radius: 1500,
  default_intent: "anything",
  auto_emit_presence: false,
  trust_threshold: 0.3,
};

function getTimeOfDay(): HadeContext["time_of_day"] {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

function getDayType(): HadeContext["day_type"] {
  const day = new Date().getDay();
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

// ─── buildContext ─────────────────────────────────────────────────────────────

/**
 * Constructs a fully-resolved HadeContext from partial user input.
 * Fills in time-of-day, day type, and defaults from config.
 */
export function buildContext(
  input: Partial<HadeContext>,
  config: HadeConfig = {}
): HadeContext {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    geo: input.geo ?? null,
    intent: input.intent ?? cfg.default_intent,
    energy_level: input.energy_level ?? "medium",
    group_size: input.group_size ?? 1,
    radius_meters: input.radius_meters ?? cfg.default_radius,
    session_id: input.session_id ?? null,
    time_of_day: input.time_of_day ?? getTimeOfDay(),
    day_type: input.day_type ?? getDayType(),
    signals: input.signals ?? [],
    rejection_history: input.rejection_history ?? [],
  };
}

// ─── scoreOpportunity ─────────────────────────────────────────────────────────

/**
 * Computes a composite 0–1 score for an opportunity given the current context.
 * Weights: proximity (40%), signal strength (35%), intent alignment (25%).
 *
 * Extend this with real trust-layer weighting from the backend.
 */
export function scoreOpportunity(
  opp: Opportunity,
  ctx: HadeContext,
  maxRadiusMeters?: number
): number {
  const radius = maxRadiusMeters ?? ctx.radius_meters;

  // Proximity score: inverse linear decay over radius
  const proximityScore = Math.max(
    0,
    1 - opp.distance_meters / radius
  );

  // Signal strength score: average strength of attributing signals
  const signalScore =
    opp.trust_attributions.length > 0
      ? opp.trust_attributions.reduce((sum, a) => sum + a.edge_weight, 0) /
        opp.trust_attributions.length
      : opp.primary_signal?.strength ?? 0;

  // Intent alignment: stub — extend with category→intent affinity map
  const intentScore = getIntentAlignmentScore(opp.category, ctx.intent);

  return (
    proximityScore * 0.4 + signalScore * 0.35 + intentScore * 0.25
  );
}

function getIntentAlignmentScore(category: string, intent: Intent): number {
  const affinityMap: Record<Intent, string[]> = {
    eat: ["restaurant", "cafe", "food", "dining", "brunch"],
    drink: ["bar", "cocktail", "wine", "brewery", "lounge"],
    chill: ["park", "coffee", "bookstore", "gallery", "spa"],
    scene: ["club", "rooftop", "lounge", "event", "popup"],
    anything: [],
  };

  if (intent === "anything") return 0.5;

  const keywords = affinityMap[intent];
  const cat = category.toLowerCase();
  return keywords.some((k) => cat.includes(k)) ? 1 : 0.2;
}

// ─── generateRationale ───────────────────────────────────────────────────────

/**
 * Produces a human-voiced rationale string for a given opportunity + context.
 * In production, this would be delegated to the LLM decision layer.
 */
export function generateRationale(
  opp: Opportunity,
  ctx: HadeContext
): string {
  // Use existing rationale if provided by backend
  if (opp.rationale) return opp.rationale;

  const timeLabel: Record<HadeContext["time_of_day"], string> = {
    morning: "this morning",
    afternoon: "this afternoon",
    evening: "tonight",
    night: "late night",
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

  return `New discovery ${opp.neighborhood ? `in ${opp.neighborhood}` : "nearby"} — worth checking out.`;
}

// ─── rankOpportunities ───────────────────────────────────────────────────────

/**
 * Sorts opportunities by composite score descending.
 * Returns [primary, ...fallbacks].
 */
export function rankOpportunities(
  opps: Opportunity[],
  ctx: HadeContext
): Opportunity[] {
  return opps
    .map((opp) => ({ ...opp, score: scoreOpportunity(opp, ctx) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

// ─── Config ──────────────────────────────────────────────────────────────────

export function getDefaultConfig(): Required<HadeConfig> {
  return { ...DEFAULT_CONFIG };
}

// ─── Geo Utilities ───────────────────────────────────────────────────────────

export function haversineDistanceMeters(a: GeoLocation, b: GeoLocation): number {
  const R = 6371000; // Earth radius in meters
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
