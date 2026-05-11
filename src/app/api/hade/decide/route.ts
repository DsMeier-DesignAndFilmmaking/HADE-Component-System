import { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { generateSyntheticDecision } from "@/core/engine/synthetic";
import type { GeoLocation, HadeDecision, LocationNode, ScoringWeights, SpontaneousObject } from "@/types/hade";
import { getLocationWeights, locationNodeExists, createLocationNode } from "@/lib/hade/weights";
import { setOfflineCache, getValidCache } from "@/lib/hade/cache";
import type { CacheEntry, CachedVenue, CachedLocationNode } from "@/lib/hade/cache";
import { haversineDistanceMeters } from "@/lib/hade/engine";
import { getRedisMode } from "@/lib/hade/redis";
import { fetchNearbyGrounded } from "@/core/services/places";
import { RADIUS } from "@/core/constants/radius";
import { LENS_PROFILES, getLensProfile, type LensProfile, type LensProfileId } from "@/lib/hade/lensProfiles";
import { hadeLog, roundGeo, safeError, safePayloadSummary, sanitizeLogText } from "@/lib/hade/logging";

export const runtime = "nodejs";

import { computeConfidence } from "@/lib/hade/confidence";
import { buildExplanation } from "@/lib/hade/explanation";


// ─── Configuration ───────────────────────────────────────────────────────────

const COPY_ENHANCEMENT_TIMEOUT_MS = 1500;
const GROQ_COPY_MODEL = "llama-3.1-8b-instant";

// ─── Stage result types ──────────────────────────────────────────────────────

type ParseResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string };

type ValidationResult = { ok: true } | { ok: false; error: string };

type CopyProvider = "none" | "upstream" | "groq" | "auto";

type CopyEnhancement = {
  headline?: string;
  reason?: string;
  why_now?: string;
  cta?: string;
  vibe_label?: string;
};

type CopyEnhancementResult =
  | { ok: true; copy: CopyEnhancement; provider: Exclude<CopyProvider, "none" | "auto"> }
  | { ok: false; reason: string; timeout?: boolean; provider?: Exclude<CopyProvider, "none" | "auto"> };

async function getDecisionNode(venueId: string): Promise<LocationNode | null> {
  const [node] = await getLocationWeights([venueId]);
  return node ?? null;
}

// ─── Degraded-state observability ────────────────────────────────────────────
//
// Wraps a JSON response body + init with the degraded contract:
//   • body.degraded            — boolean flag added to the JSON payload
//   • header x-hade-degraded   — "1" / "0" mirror for non-JSON consumers
//
// Pure observability — does not influence ranking, tier selection, or any
// decision-engine output. Captures the current process-level Redis state at
// the moment the Response is constructed via getRedisMode().
function withDegradedSignal(
  body: Record<string, unknown>,
  init: ResponseInit,
): Response {
  const degraded = getRedisMode() !== "FULL";
  const enriched = { ...body, degraded };
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) ?? {}),
    "x-hade-degraded": degraded ? "1" : "0",
  };
  return new Response(JSON.stringify(enriched), { ...init, headers });
}

// ─── Copy-only enhancement layer ─────────────────────────────────────────────

const COPY_FIELDS: Record<keyof CopyEnhancement, number> = {
  headline: 80,
  reason: 220,
  why_now: 180,
  cta: 36,
  vibe_label: 32,
};

function resolveCopyProvider(): CopyProvider {
  const raw = process.env.HADE_COPY_PROVIDER;
  if (raw === "none" || raw === "upstream" || raw === "groq" || raw === "auto") {
    return raw;
  }
  return "none";
}

function buildCopyOnlyPayload(
  data: Record<string, unknown>,
  requestBody: Record<string, unknown>,
) {
  const decision = data.decision && typeof data.decision === "object"
    ? (data.decision as Record<string, unknown>)
    : {};
  const snapshot = data.context_snapshot && typeof data.context_snapshot === "object"
    ? (data.context_snapshot as Record<string, unknown>)
    : {};

  return {
    selected_candidate: {
      id: decision.id,
      venue_name: decision.venue_name,
      title: decision.title,
      category: decision.category,
      geo: roundGeo(decision.geo as { lat?: unknown; lng?: unknown } | null | undefined),
      distance_meters: decision.distance_meters,
      eta_minutes: decision.eta_minutes,
      neighborhood: decision.neighborhood,
      existing_vibe_label: decision.vibe_tag,
      confidence_label: decision.confidence_label,
      is_fallback: decision.is_fallback === true,
      source: decision.source ?? data.source,
    },
    existing_copy: {
      headline: decision.title ?? decision.venue_name,
      reason: decision.rationale,
      why_now: decision.why_now,
      vibe_label: decision.vibe_tag,
      decision_frame: decision.decision_frame,
    },
    context_summary: {
      ...safePayloadSummary(requestBody),
      situation_summary: snapshot.situation_summary,
      interpreted_intent: snapshot.interpreted_intent,
      decision_basis: snapshot.decision_basis,
    },
    strict_schema: {
      allowed_fields: Object.keys(COPY_FIELDS),
      forbidden_fields: [
        "id",
        "venue_id",
        "venue_name",
        "geo",
        "location",
        "coordinates",
        "rating",
        "score",
        "rank",
        "category",
        "distance_meters",
        "eta_minutes",
      ],
      max_lengths: COPY_FIELDS,
    },
  };
}

function validateCopyEnhancement(input: unknown): CopyEnhancementResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "copy_not_object" };
  }

  const raw = input as Record<string, unknown>;
  const keys = Object.keys(raw);
  const allowed = new Set(Object.keys(COPY_FIELDS));
  const unknownKeys = keys.filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    return { ok: false, reason: "copy_extra_fields" };
  }

  const copy: CopyEnhancement = {};
  for (const [field, maxLength] of Object.entries(COPY_FIELDS) as Array<[keyof CopyEnhancement, number]>) {
    const value = raw[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") {
      return { ok: false, reason: `copy_${field}_not_string` };
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > maxLength) {
      return { ok: false, reason: `copy_${field}_too_long` };
    }
    if (/https?:\/\//i.test(trimmed) || /\b\d(?:\.\d)?\s*stars?\b/i.test(trimmed)) {
      return { ok: false, reason: `copy_${field}_unsupported_fact` };
    }
    copy[field] = trimmed;
  }

  if (Object.keys(copy).length === 0) {
    return { ok: false, reason: "copy_empty" };
  }

  return { ok: true, copy, provider: "groq" };
}

function parseCopyJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("copy_response_non_json");
    return JSON.parse(match[0]);
  }
}

async function callGroqCopyEnhancement(
  data: Record<string, unknown>,
  requestBody: Record<string, unknown>,
): Promise<CopyEnhancementResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { ok: false, reason: "groq_missing_key", provider: "groq" };

  const payload = buildCopyOnlyPayload(data, requestBody);
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_COPY_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You rewrite HADE card copy only. Return strict JSON with only these optional string keys: headline, reason, why_now, cta, vibe_label. Do not choose venues, do not change IDs, locations, scores, categories, ratings, distances, or facts. Use only facts present in the user payload. If unsure, return {}.",
          },
          {
            role: "user",
            content: JSON.stringify(payload),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 160,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(COPY_ENHANCEMENT_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
    if (isTimeout) {
      hadeLog("warn", "[HADE COPY] provider=groq timeout=true");
      return { ok: false, reason: "groq_timeout", timeout: true, provider: "groq" };
    }
    return { ok: false, reason: sanitizeLogText(err), provider: "groq" };
  }

  if (!response.ok) {
    return { ok: false, reason: `groq_http_${response.status}`, provider: "groq" };
  }

  try {
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return { ok: false, reason: "groq_missing_content", provider: "groq" };
    }
    const validated = validateCopyEnhancement(parseCopyJson(content));
    return validated.ok
      ? { ok: true, copy: validated.copy, provider: "groq" }
      : { ...validated, provider: "groq" };
  } catch (err) {
    return { ok: false, reason: sanitizeLogText(err), provider: "groq" };
  }
}

async function callUpstreamCopyEnhancement(
  data: Record<string, unknown>,
  requestBody: Record<string, unknown>,
): Promise<CopyEnhancementResult> {
  if (!process.env.HADE_UPSTREAM_URL) {
    return { ok: false, reason: "upstream_not_configured", provider: "upstream" };
  }

  const url = `${serverEnv.hadeUpstreamUrl}/hade/copy`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (serverEnv.hadeApiKey && serverEnv.hadeApiKey !== "your_secret_here") {
    headers["x-api-key"] = serverEnv.hadeApiKey;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(buildCopyOnlyPayload(data, requestBody)),
      cache: "no-store",
      signal: AbortSignal.timeout(COPY_ENHANCEMENT_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, reason: `upstream_http_${response.status}`, provider: "upstream" };
    }
    const validated = validateCopyEnhancement(await response.json());
    return validated.ok
      ? { ok: true, copy: validated.copy, provider: "upstream" }
      : { ...validated, provider: "upstream" };
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
    return {
      ok: false,
      reason: isTimeout ? "upstream_copy_timeout" : sanitizeLogText(err),
      timeout: isTimeout,
      provider: "upstream",
    };
  }
}

function applyCopyEnhancement(
  data: Record<string, unknown>,
  copy: CopyEnhancement,
  provider: string,
): Record<string, unknown> {
  const decision = data.decision && typeof data.decision === "object"
    ? { ...(data.decision as Record<string, unknown>) }
    : null;
  if (!decision) return data;

  const enhancedDecision = {
    ...decision,
    ...(copy.headline ? { title: copy.headline, decision_frame: copy.headline } : {}),
    ...(copy.reason ? { rationale: copy.reason } : {}),
    ...(copy.why_now ? { why_now: copy.why_now } : {}),
    ...(copy.vibe_label ? { vibe_tag: copy.vibe_label } : {}),
  };

  const existingUx = data.ux && typeof data.ux === "object"
    ? (data.ux as Record<string, unknown>)
    : {};

  return {
    ...data,
    decision: enhancedDecision,
    copy_provider: provider,
    ...(copy.cta ? { ux: { ...existingUx, cta: copy.cta } } : {}),
  };
}

async function enhanceDecisionCopy(
  data: Record<string, unknown>,
  requestBody: Record<string, unknown>,
  reqId: string,
): Promise<Record<string, unknown>> {
  const configured = resolveCopyProvider();
  if (configured === "none") {
    hadeLog("log", "[HADE COPY] fallback=deterministic", { reason: "provider_none" });
    return data;
  }

  const providers: Array<Exclude<CopyProvider, "none" | "auto">> =
    configured === "auto"
      ? (process.env.GROQ_API_KEY
          ? ["groq"]
          : (process.env.HADE_UPSTREAM_URL ? ["upstream"] : []))
      : [configured];

  for (const provider of providers) {
    const result =
      provider === "groq"
        ? await callGroqCopyEnhancement(data, requestBody)
        : await callUpstreamCopyEnhancement(data, requestBody);

    if (result.ok) {
      hadeLog("log", `[HADE COPY] provider=${provider} success=true`, { reqId });
      return applyCopyEnhancement(data, result.copy, provider);
    }

    if (provider === "groq" && result.timeout) {
      // callGroqCopyEnhancement already emits the exact timeout log line.
    } else {
      hadeLog("debug", `[HADE COPY] provider=${provider} success=false`, {
        reason: result.reason,
      }, { debugOnly: true });
    }
  }

  hadeLog("log", "[HADE COPY] fallback=deterministic", { reason: "provider_failed" });
  return data;
}

// ─── Fallback candidate builder ───────────────────────────────────────────────

type FallbackSource = "static_fallback" | "offline_cache" | "degraded_location";

type FallbackContext = {
  timeOfDay: string;
  dayType: string;
  urgency: string;
  energy: string;
  openness: string;
  groupType: string;
  groupSize: number;
  hasKnownLocation: boolean;
};

type FallbackCatalogEntry = {
  id: string;
  domain: LensProfileId;
  title: string;
  category: string;
  vibe_tag: string;
  rationale: string;
  why_now: string;
  why_this: string;
  decision_frame: string;
  cta_hint?: string;
  tags: readonly string[];
};

const STATIC_FALLBACK_TITLES = [
  "Choose a simple next step",
  "Take a low-friction reset",
  "Make a practical move now",
] as const;

const FALLBACK_CATALOG: Record<LensProfileId, FallbackCatalogEntry[]> = {
  food_dining: [
    {
      id: "food-quick-counter",
      domain: "food_dining",
      title: "Pick a simple counter-service meal",
      category: "food",
      vibe_tag: "low_effort_food",
      rationale: "When live places are unavailable, a counter-service spot is the safest food pattern: quick, flexible, and easy to abandon.",
      why_now: "You need momentum more than a perfect restaurant pick.",
      why_this: "Low planning, low wait, easy exit.",
      decision_frame: "Offline fallback: choose the simplest reliable food format.",
      tags: ["food", "eat", "urgent", "low_energy", "solo", "weekday"],
    },
    {
      id: "food-cafe-pause",
      domain: "food_dining",
      title: "Use a cafe as the reset point",
      category: "cafe",
      vibe_tag: "cafe_reset",
      rationale: "A cafe gives you food, seating, and a softer decision surface without needing live local ranking.",
      why_now: "Good for a lower-energy moment where comfort beats novelty.",
      why_this: "Comfortable, flexible, and socially neutral.",
      decision_frame: "Fallback mode: anchor on an easy cafe pattern, then reassess.",
      tags: ["food", "chill", "low_energy", "comfort", "unknown_location"],
    },
    {
      id: "food-group-casual",
      domain: "food_dining",
      title: "Choose the most consensus-friendly casual place",
      category: "restaurant",
      vibe_tag: "group_food",
      rationale: "For a group, the fallback should reduce negotiation: casual menu, flexible seating, and no strong cuisine bet.",
      why_now: "The group needs a workable answer more than a clever one.",
      why_this: "Broad appeal and fewer veto points.",
      decision_frame: "Offline fallback: optimize for group agreement.",
      tags: ["food", "group", "friends", "family", "social", "medium_energy"],
    },
  ],
  urban_mobility: [
    {
      id: "mobility-short-loop",
      domain: "urban_mobility",
      title: "Take a short orientation loop",
      category: "mobility",
      vibe_tag: "orientation",
      rationale: "Without live network context, a short loop is useful because it improves your read of the area without committing you far.",
      why_now: "It buys clarity while keeping you close to your starting point.",
      why_this: "Movement plus optionality.",
      decision_frame: "Degraded mode: make the next move reversible.",
      tags: ["mobility", "travel", "unknown_location", "open", "low_urgency"],
    },
    {
      id: "mobility-transit-anchor",
      domain: "urban_mobility",
      title: "Head toward the clearest transit or rideshare anchor",
      category: "transit",
      vibe_tag: "transit_anchor",
      rationale: "When the engine cannot verify live options, a transit-visible anchor keeps the next decision practical.",
      why_now: "High urgency favors a reliable movement option over exploration.",
      why_this: "Fastest path back to control.",
      decision_frame: "Fallback mode: prioritize a known mobility anchor.",
      tags: ["mobility", "urgent", "travel", "weekday", "solo", "work"],
    },
    {
      id: "mobility-scenic-low-stakes",
      domain: "urban_mobility",
      title: "Choose a low-stakes scenic route",
      category: "walk",
      vibe_tag: "scenic_route",
      rationale: "If you are open and not rushed, a scenic route turns missing network data into a useful reset.",
      why_now: "You have enough openness for discovery without needing a precise venue.",
      why_this: "Low risk, high optionality.",
      decision_frame: "Offline fallback: keep moving, but keep it easy to change course.",
      tags: ["mobility", "adventurous", "open", "low_urgency", "wellness"],
    },
  ],
  entertainment: [
    {
      id: "entertainment-walkup",
      domain: "entertainment",
      title: "Look for a walk-up entertainment option",
      category: "entertainment",
      vibe_tag: "walkup_fun",
      rationale: "A walk-up format avoids relying on stale schedules or invented event details.",
      why_now: "The safer offline move is a venue type with visible availability.",
      why_this: "No fake event data, no over-planning.",
      decision_frame: "Fallback mode: choose entertainment you can verify at the door.",
      tags: ["entertainment", "evening", "weekend", "friends", "group", "scene"],
    },
    {
      id: "entertainment-light-culture",
      domain: "entertainment",
      title: "Pick a light culture stop",
      category: "culture",
      vibe_tag: "culture_stop",
      rationale: "A gallery, museum lobby, bookstore event board, or venue poster wall can generate options without live data.",
      why_now: "You want stimulation, but the engine should not invent what is happening.",
      why_this: "Discovery without hallucinated listings.",
      decision_frame: "Offline fallback: use visible local signals, not guessed events.",
      tags: ["entertainment", "afternoon", "adventurous", "solo", "couple"],
    },
  ],
  social_interaction: [
    {
      id: "social-optional",
      domain: "social_interaction",
      title: "Choose a social-optional third place",
      category: "social",
      vibe_tag: "social_optional",
      rationale: "A social-optional place lets interaction happen without forcing it, which is safer when live venue confidence is low.",
      why_now: "You need a flexible social surface, not a brittle plan.",
      why_this: "Easy to join, easy to stay private.",
      decision_frame: "Fallback mode: optimize for optional connection.",
      tags: ["social", "solo", "friends", "open", "medium_energy"],
    },
    {
      id: "social-group-base",
      domain: "social_interaction",
      title: "Set a simple group base",
      category: "social",
      vibe_tag: "group_base",
      rationale: "For groups, a clear base beats endless coordination when the engine cannot verify live local conditions.",
      why_now: "Shared context matters more than finding the perfect spot.",
      why_this: "One anchor point, fewer messages.",
      decision_frame: "Offline fallback: pick a meetup base everyone can understand.",
      tags: ["social", "group", "friends", "family", "urgent"],
    },
  ],
  wellness: [
    {
      id: "wellness-breath-walk",
      domain: "wellness",
      title: "Take a ten-minute reset walk",
      category: "wellness",
      vibe_tag: "reset_walk",
      rationale: "A timed walk is honest, useful, and does not require the engine to claim live knowledge it lacks.",
      why_now: "Lower energy calls for a recovery move before another decision.",
      why_this: "A small reset with a clear endpoint.",
      decision_frame: "Degraded mode: choose a body-first reset.",
      tags: ["wellness", "low_energy", "chill", "morning", "unknown_location"],
    },
    {
      id: "wellness-quiet-seat",
      domain: "wellness",
      title: "Find a quiet place to sit and recalibrate",
      category: "wellness",
      vibe_tag: "quiet_reset",
      rationale: "When signal is thin, the most useful decision may be lowering stimulation before choosing again.",
      why_now: "This is a better move if urgency is low and your energy is tapped.",
      why_this: "Low commitment, immediate relief.",
      decision_frame: "Fallback mode: reduce load before adding options.",
      tags: ["wellness", "low_energy", "comfort", "low_urgency", "solo"],
    },
  ],
  retail_shopping: [
    {
      id: "retail-browse",
      domain: "retail_shopping",
      title: "Browse one small shop with a time box",
      category: "retail",
      vibe_tag: "timeboxed_browse",
      rationale: "A short browse gives you novelty without pretending the engine knows live inventory.",
      why_now: "Good for open-ended energy when you want discovery, not logistics.",
      why_this: "Novelty with a clean exit.",
      decision_frame: "Offline fallback: make retail exploratory and time-boxed.",
      tags: ["retail", "shopping", "adventurous", "afternoon", "weekend"],
    },
    {
      id: "retail-practical",
      domain: "retail_shopping",
      title: "Handle one practical errand",
      category: "retail",
      vibe_tag: "practical_errand",
      rationale: "If the network is down, a practical errand is a grounded fallback that can still make the moment productive.",
      why_now: "Higher urgency favors usefulness over browsing.",
      why_this: "Concrete, quick, and easy to verify.",
      decision_frame: "Fallback mode: choose utility over discovery.",
      tags: ["retail", "urgent", "weekday", "work", "low_energy"],
    },
  ],
};

function normalizeFallbackToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function extractStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function extractRejectedFallbackTitles(body?: Record<string, unknown> | null): Set<string> {
  const raw = body?.rejection_history;
  if (!Array.isArray(raw)) return new Set();

  const titles = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const venueName = (entry as { venue_name?: unknown }).venue_name;
      return typeof venueName === "string" ? venueName.trim().toLowerCase() : null;
    })
    .filter((title): title is string => typeof title === "string" && title.length > 0);

  return new Set(titles);
}

function resolveStaticFallbackProfile(body?: Record<string, unknown> | null): LensProfile {
  const categories = extractStringArray(body?.candidate_categories).map(normalizeFallbackToken);
  if (categories.length > 0) {
    const categorySet = new Set(categories);
    let bestProfile: LensProfile | null = null;
    let bestScore = 0;

    for (const profile of Object.values(LENS_PROFILES)) {
      const score = profile.candidateCategories
        .map(normalizeFallbackToken)
        .filter((category) => categorySet.has(category))
        .length;
      if (score > bestScore) {
        bestProfile = profile;
        bestScore = score;
      }
    }

    if (bestProfile) return bestProfile;
  }

  const mode = typeof body?.mode === "string" ? body.mode : undefined;
  return getLensProfile(mode);
}

function readNestedString(
  body: Record<string, unknown> | null | undefined,
  group: string,
  key: string,
  fallback: string,
): string {
  const parent = body?.[group];
  if (!parent || typeof parent !== "object") return fallback;
  const value = (parent as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function readNestedNumber(
  body: Record<string, unknown> | null | undefined,
  group: string,
  key: string,
  fallback: number,
): number {
  const parent = body?.[group];
  if (!parent || typeof parent !== "object") return fallback;
  const value = (parent as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isKnownGeo(geo: GeoLocation | null): geo is GeoLocation {
  return Boolean(
    geo &&
      Number.isFinite(geo.lat) &&
      Number.isFinite(geo.lng) &&
      !(geo.lat === 0 && geo.lng === 0),
  );
}

function resolveFallbackContext(
  body: Record<string, unknown> | null | undefined,
  geo: GeoLocation | null,
): FallbackContext {
  return {
    timeOfDay: typeof body?.time_of_day === "string" ? body.time_of_day : "unknown_time",
    dayType: typeof body?.day_type === "string" ? body.day_type : "unknown_day",
    urgency: readNestedString(body, "situation", "urgency", "medium"),
    energy: readNestedString(body, "state", "energy", "medium"),
    openness: readNestedString(body, "state", "openness", "open"),
    groupType: readNestedString(body, "social", "group_type", "solo"),
    groupSize: readNestedNumber(body, "social", "group_size", 1),
    hasKnownLocation: isKnownGeo(geo),
  };
}

function fallbackContextTags(ctx: FallbackContext): Set<string> {
  const tags = new Set<string>([
    ctx.timeOfDay,
    ctx.dayType,
    `${ctx.urgency}_urgency`,
    `${ctx.energy}_energy`,
    ctx.openness,
    ctx.groupType,
  ]);
  if (ctx.groupSize > 1) tags.add("group");
  if (!ctx.hasKnownLocation) tags.add("unknown_location");
  if (ctx.timeOfDay === "evening" || ctx.timeOfDay === "late_night") tags.add("evening");
  if (ctx.dayType === "weekend" || ctx.dayType === "weekend_prime") tags.add("weekend");
  if (ctx.urgency === "high") tags.add("urgent");
  return tags;
}

function stableFallbackOffset(seed: string, count: number): number {
  if (count <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % count;
}

function buildStaticFallbackEntries(
  body?: Record<string, unknown> | null,
  geo?: GeoLocation | null,
  reqId = "fallback",
): {
  profile: LensProfile;
  entries: FallbackCatalogEntry[];
  context: FallbackContext;
  source: FallbackSource;
} {
  const profile = resolveStaticFallbackProfile(body);
  const context = resolveFallbackContext(body, geo ?? null);
  const rejectedTitles = extractRejectedFallbackTitles(body);
  const contextTags = fallbackContextTags(context);
  const source: FallbackSource = context.hasKnownLocation ? "static_fallback" : "degraded_location";

  const domainEntries = FALLBACK_CATALOG[profile.id];
  const scored = domainEntries
    .filter((entry) => !rejectedTitles.has(entry.title.toLowerCase()))
    .map((entry) => ({
      entry,
      score: entry.tags.filter((tag) => contextTags.has(tag)).length,
    }))
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));

  const ranked = scored.map(({ entry }) => entry);
  const genericEntries = STATIC_FALLBACK_TITLES.map((title, index): FallbackCatalogEntry => ({
    id: `generic-${index}`,
    domain: profile.id,
    title,
    category: profile.id,
    vibe_tag: profile.id,
    rationale: "The live engine is unavailable, so HADE is giving you a useful decision pattern instead of pretending to know the perfect place.",
    why_now: "Use this as a short, reversible move until live context returns.",
    why_this: "Honest fallback with low commitment.",
    decision_frame: "Fallback mode: choose a simple next step.",
    tags: [],
  }));
  const fallbackEntries = genericEntries.filter((entry) => !rejectedTitles.has(entry.title.toLowerCase()));

  const candidates = ranked.length > 0 ? ranked : (fallbackEntries.length > 0 ? fallbackEntries : genericEntries);
  const offset = stableFallbackOffset(
    `${reqId}:${context.timeOfDay}:${context.dayType}:${context.urgency}:${context.energy}:${context.openness}:${context.groupType}`,
    candidates.length,
  );
  const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];
  const entries = rotated.slice(0, 3);

  return {
    profile,
    entries: entries.length > 0 ? entries : genericEntries.slice(0, 1),
    context,
    source,
  };
}

function createFallbackDecisionFromObject(
  object: SpontaneousObject,
  entry: FallbackCatalogEntry,
  context: FallbackContext,
  source: FallbackSource,
  geo: GeoLocation | null,
): HadeDecision {
  const hasKnownLocation = context.hasKnownLocation;
  const fallbackGeo = geo ?? { lat: 0, lng: 0 };
  const distanceMeters = hasKnownLocation ? object.radius : RADIUS.FALLBACK_STATIC;
  const locationCopy = hasKnownLocation
    ? "Using a broad fallback pattern near your last known area."
    : "Location is unavailable, so this is not a live nearby venue.";

  return {
    ...object,
    id: object.id,
    venue_name: object.title,
    title: object.title,
    category: entry.category,
    geo: { lat: fallbackGeo.lat, lng: fallbackGeo.lng },
    distance_meters: distanceMeters,
    eta_minutes: hasKnownLocation ? Math.max(1, Math.ceil(distanceMeters / 80)) : 0,
    rationale: `${entry.rationale} ${locationCopy}`,
    why_now: entry.why_now,
    why_this: entry.why_this,
    decision_frame: entry.decision_frame,
    confidence: hasKnownLocation ? 0.45 : 0.35,
    confidence_label: "Exploratory",
    situation_summary: `${source === "degraded_location" ? "Unknown location" : "Static fallback"}: ${context.timeOfDay}, ${context.groupType}, ${context.energy} energy.`,
    is_fallback: true,
    source,
  } as HadeDecision;
}

/**
 * Returns at least 1 SpontaneousObject for use as fallback candidates.
 *
 * Resolution order:
 *   1. Fetch real nearby places via Google Places API
 *   2. If Places fails or returns nothing, emit 3 static synthetic objects
 *
 * The `fallback-` prefix on static IDs is intentional — the client's pivot
 * guard refuses to add fallback IDs to rejection_history, preventing loops.
 */
async function buildFallbackCandidates(
  geo: GeoLocation | null,
  reqId: string,
  body?: Record<string, unknown> | null,
): Promise<Array<SpontaneousObject & { fallback_entry?: FallbackCatalogEntry; source?: string }>> {
  const now = Date.now();

  if (isKnownGeo(geo)) {
    try {
      hadeLog("debug", "[HADE TRACE] Places fetch executing at: src/app/api/hade/decide/route.ts", {
        geo: roundGeo(geo),
        radius_meters: RADIUS.SEARCH_DEFAULT,
        open_now: true,
        caller: "buildFallbackCandidates",
      }, { debugOnly: true });
      const places = await fetchNearbyGrounded({ geo, radius_meters: RADIUS.SEARCH_DEFAULT, open_now: true });
      if (places.length > 0) {
        hadeLog("log", `[hade-decide ${reqId}] fallback: resolved Google Places`, {
          count: places.length,
        });
        return places.map((place) => ({
          id: place.id,
          type: "place_opportunity" as const,
          title: place.name,
          time_window: { start: now, end: now + 60 * 60 * 1000 },
          location: { lat: place.geo.lat, lng: place.geo.lng, place_id: place.id },
          radius: Math.round(haversineDistanceMeters(geo, place.geo)),
          going_count: 0,
          maybe_count: 0,
          user_state: null,
          created_at: now,
          expires_at: now + 60 * 60 * 1000,
          trust_score: place.rating !== undefined
            ? Math.max(0, Math.min(1, (place.rating - 1) / 4))
            : 0.5,
          vibe_tag: place.vibe,
          source: "static_fallback",
        }));
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      hadeLog("warn", `[hade-decide ${reqId}] fallback: Google Places failed`, {
        error: sanitizeLogText(detail),
      });
    }
  }

  // Static synthetic floor — guaranteed >= 1. This is last-resort only: Places,
  // synthetic ranking, UGC, and offline cache all get earlier chances to win.
  const staticFallback = buildStaticFallbackEntries(body, geo, reqId);
  hadeLog("log",
    `[hade-decide ${reqId}] fallback: using ${staticFallback.entries.length} ${staticFallback.profile.id} ${staticFallback.source} object(s)`,
  );
  return staticFallback.entries.map((entry, i) => ({
    id: `fallback-static-${i}-${now}`,
    type: "place_opportunity" as const,
    title: entry.title,
    time_window: { start: now, end: now + 60 * 60 * 1000 },
    location: { lat: geo?.lat ?? 0, lng: geo?.lng ?? 0 },
    radius: RADIUS.FALLBACK_STATIC,
    going_count: 0,
    maybe_count: 0,
    user_state: null,
    created_at: now,
    expires_at: now + 60 * 60 * 1000,
    trust_score: staticFallback.source === "degraded_location" ? 0.35 : 0.45,
    vibe_tag: entry.vibe_tag,
    source: staticFallback.source,
    fallback_entry: entry,
  }));
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const reqId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  hadeLog("log", `[hade-decide ${reqId}] ← POST received`);

  try {
    // Stage 1: Parse body
    const parsed = await safeParseBody(request, reqId);
    if (!parsed.ok) {
      hadeLog("log", "[HADE FALLBACK TRIGGER]", { reason: "INVALID_RESPONSE" });
      return await fallbackResponse(reqId, "parse_error", parsed.error, null);
    }

    // Stage 2: Validate minimal shape
    const validated = validatePayload(parsed.body, reqId);
    const geoHint = extractGeo(parsed.body);
    if (!validated.ok) {
      hadeLog("log", "[HADE FALLBACK TRIGGER]", { reason: "INVALID_RESPONSE" });
      return await fallbackResponse(reqId, "validation_error", validated.error, geoHint, parsed.body);
    }

    // Stage 3: Inject LocationNode weights for any node_hints in the body
    const enrichedBody = await enrichWithNodeWeights(parsed.body, reqId);

    // Stage 4+5: Generate the decision (upstream call + success/fallback routing)
    return await generateDecision(enrichedBody, reqId, geoHint, startedAt);
  } catch (err) {
    // Belt-and-braces — should be unreachable because every stage catches its own errors.
    const detail = err instanceof Error ? err.message : String(err);
    hadeLog("error", `[hade-decide ${reqId}] ✗ unexpected throw`, {
      error: sanitizeLogText(detail),
    });
    hadeLog("log", "[HADE FALLBACK TRIGGER]", { reason: "LLM_ERROR" });
    return await fallbackResponse(reqId, "unexpected_error", detail, null);
  }
}

// ─── Decision generation ─────────────────────────────────────────────────────

/**
 * Three-tier decision pipeline:
 *
 *  Cold-start — Use the deterministic synthetic engine immediately when the
 *               request carries no intent, signals, or rejection history.
 *  Tier 1 — Synthetic     : build a grounded deterministic decision from real
 *               Places/UGC candidates, then optionally enhance copy only.
 *  Tier 2.5 — Offline cache: scored cached venues when Tiers 1-2 both fail
 *  Tier 3 — Static fallback: guaranteed non-null SpontaneousObject, always 200
 *
 * Always returns a valid Response with a non-null decision — never throws past
 * this boundary and never emits a 503.
 */
async function generateDecision(
  body: Record<string, unknown>,
  reqId: string,
  geoHint: GeoLocation | null,
  startedAt: number,
): Promise<Response> {
  try {
    // ── Cold-start guard (before any external call) ───────────────────────────
    const intent = (body as { situation?: { intent?: unknown } }).situation?.intent;
    const signals = (body as { signals?: unknown[] }).signals;
    const rejectionHistory = (body as { rejection_history?: unknown[] }).rejection_history;

    const isColdStart =
      !intent &&
      (!Array.isArray(signals) || signals.length === 0) &&
      (!Array.isArray(rejectionHistory) || rejectionHistory.length === 0);

    if (isColdStart) {
      hadeLog("log", `[hade-decide ${reqId}] cold start — attempting Places fetch before fallback`);

      if (geoHint) {
        let coldStartSynthetic: Awaited<ReturnType<typeof generateSyntheticDecision>>;
        try {
          coldStartSynthetic = await generateSyntheticDecision(body, reqId, geoHint);
        } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      hadeLog("warn", `[hade-decide ${reqId}] ✗ cold-start synthetic threw`, {
        error: sanitizeLogText(detail),
      });
          coldStartSynthetic = { ok: false };
        }

        if (coldStartSynthetic.ok) {
          const elapsed = Date.now() - startedAt;
          hadeLog("log",
            `[hade-decide ${reqId}] ✓ cold-start Places ok in ${elapsed}ms` +
              ` — ${coldStartSynthetic.objects.length} object(s)`,
          );
          const decisionNode = await getDecisionNode(coldStartSynthetic.data.decision.id);
          const debugMode =
            (body as { settings?: { debug?: unknown } }).settings?.debug === true;
          const enrichedColdStart = await enhanceDecisionCopy({
            ...coldStartSynthetic.data,
            source: "cold_start_synthetic",
            decision_node: decisionNode,
            ...(debugMode ? { debug: coldStartSynthetic.debugPayload } : {}),
            ...(coldStartSynthetic.explanation_signals
              ? { explanation_signals: coldStartSynthetic.explanation_signals }
              : {}),
          }, body, reqId);
          void writeCacheFromSynthetic(coldStartSynthetic.objects, body);
          return withDegradedSignal(enrichedColdStart, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "x-hade-source": "cold_start_synthetic",
            },
          });
        }
      }

      console.warn("[HADE] Falling back due to no places");
      hadeLog("log", `[hade-decide ${reqId}] cold start — no places available, returning fallback`);
      const candidates = await buildFallbackCandidates(geoHint, reqId, body);
      const fallbackContext = resolveFallbackContext(body, geoHint);
      const selected = candidates[0];
      const selectedEntry =
        selected.fallback_entry ??
        buildStaticFallbackEntries(body, geoHint, reqId).entries[0] ??
        FALLBACK_CATALOG[resolveStaticFallbackProfile(body).id][0];
      const source: FallbackSource = selected.source === "degraded_location" ? "degraded_location" : "static_fallback";
      const decision = selected.fallback_entry
        ? createFallbackDecisionFromObject(selected, selectedEntry, fallbackContext, source, geoHint)
        : ({
            ...selected,
            venue_name: selected.title,
            title: selected.title,
            category: selectedEntry.category,
            geo: selected.location,
            distance_meters: selected.radius,
            eta_minutes: Math.max(1, Math.ceil(selected.radius / 80)),
            rationale: "HADE could not build the normal live decision, but this fallback lookup found a grounded local lead.",
            why_now: "Use it as a practical starting point while richer context is unavailable.",
            why_this: "Grounded fallback candidate with minimal assumptions.",
            decision_frame: "Fallback mode: useful local lead, not a live ranked decision.",
            confidence: 0.5,
            confidence_label: "Exploratory",
            situation_summary: "Cold-start fallback decision",
            is_fallback: true,
            source,
          } as HadeDecision);
      const responseBody = await enhanceDecisionCopy({
          decision,
          fallback_places: candidates,
          source,
          degraded: true,
        }, body, reqId);
      return new Response(
        JSON.stringify(responseBody),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-hade-source": source,
            "x-hade-degraded": "1",
          },
        },
      );
    }

    // ── Tier 1: Deterministic synthetic selection (real Places/UGC candidates) ─
    let synthetic: Awaited<ReturnType<typeof generateSyntheticDecision>>;
    try {
      synthetic = await generateSyntheticDecision(body, reqId, geoHint);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      hadeLog("warn", `[hade-decide ${reqId}] ✗ generateSyntheticDecision threw`, {
        error: sanitizeLogText(detail),
      });
      synthetic = { ok: false };
    }

    if (synthetic.ok) {
      const elapsed = Date.now() - startedAt;
      hadeLog("log",
        `[hade-decide ${reqId}] ✓ Tier 1 (synthetic) ok in ${elapsed}ms` +
          ` — ${synthetic.objects.length} object(s)`,
      );

      const decisionNode = await getDecisionNode(synthetic.data.decision.id);
      const debugMode =
        (body as { settings?: { debug?: unknown } }).settings?.debug === true;
      const enrichedSyntheticData = await enhanceDecisionCopy({
        ...synthetic.data,
        decision_node: decisionNode,
        ...(debugMode ? { debug: synthetic.debugPayload } : {}),
        ...(synthetic.explanation_signals
          ? { explanation_signals: synthetic.explanation_signals }
          : {}),
      }, body, reqId);

      // ── Tier 2.5: Write offline cache (fire-and-forget, non-blocking) ────────
      void writeCacheFromSynthetic(synthetic.objects, body);

      return withDegradedSignal(enrichedSyntheticData, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-hade-source": "synthetic",
        },
      });
    }

    console.warn("[HADE] Falling back due to no places");
    hadeLog("log", "[HADE FALLBACK TRIGGER]", { reason: "EMPTY_DECISION" });
    hadeLog("warn", `[hade-decide ${reqId}] ↓ deterministic synthetic failed, trying offline cache`);

    // ── Tier 2.5: Serve from offline cache ───────────────────────────────────
    let cached: CacheEntry | null = null;
    try {
      cached = await getValidCache();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      hadeLog("warn", `[hade-decide ${reqId}] ✗ getValidCache threw`, {
        error: sanitizeLogText(detail),
      });
    }

    if (cached && cached.venues.length > 0 && geoHint) {
      const offlineResponse = await buildOfflineResponse(cached, geoHint, reqId, body);
      if (offlineResponse) {
        const elapsed = Date.now() - startedAt;
        hadeLog("log", `[hade-decide ${reqId}] ✓ Tier 2.5 (offline_cache) ok in ${elapsed}ms`);
        return offlineResponse;
      }
    }

    console.warn("[HADE] Falling back due to no places");
    hadeLog("log", "[HADE FALLBACK TRIGGER]", { reason: "EMPTY_DECISION" });
    hadeLog("warn", `[hade-decide ${reqId}] ↓ offline cache failed, falling to static fallback`);

    // ── Tier 3: Static fallback — always 200, never null ─────────────────────
    return await fallbackResponse(reqId, "deterministic_unavailable", "No deterministic candidates available", geoHint, body);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    hadeLog("error", `[hade-decide ${reqId}] ✗ generateDecision threw`, {
      error: sanitizeLogText(detail),
    });
    hadeLog("log", "[HADE FALLBACK TRIGGER]", { reason: "LLM_ERROR" });
    return await fallbackResponse(reqId, "decision_error", detail, geoHint, body);
  }
}

// ─── Stage 3: Enrich with LocationNode weights ───────────────────────────────

/**
 * Reads node_hints from the request body and fetches any known LocationNode
 * weights from the in-process registry. Injects them as `location_nodes` so
 * the upstream LLM (or Tier 2 synthetic engine) can apply vibe-weighted scoring.
 *
 * No-ops silently if node_hints is absent or empty.
 */
async function enrichWithNodeWeights(
  body:  Record<string, unknown>,
  reqId: string,
): Promise<Record<string, unknown>> {
  const hints = (body as { node_hints?: unknown }).node_hints;
  if (!Array.isArray(hints) || hints.length === 0) return body;

  const venueIds = hints.filter((h): h is string => typeof h === "string");
  if (venueIds.length === 0) return body;

  const nodes = await getLocationWeights(venueIds);
  if (nodes.length === 0) return body;

  hadeLog("debug",
    `[hade-decide ${reqId}]   ↗ injecting ${nodes.length} LocationNode(s) from hints: ${venueIds.join(",")}`,
    undefined,
    { debugOnly: true },
  );

  return { ...body, location_nodes: nodes };
}

// ─── Stage 1: Parse body ─────────────────────────────────────────────────────

async function safeParseBody(
  request: NextRequest,
  reqId: string,
): Promise<ParseResult> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const summary = summarizePayload(body);
    hadeLog("log", `[hade-decide ${reqId}]   payload: ${summary}`);
    hadeLog("debug", `[hade-decide ${reqId}]   payload_debug`, safePayloadSummary(body), { debugOnly: true });
    return { ok: true, body };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown parse error";
    hadeLog("warn", `[hade-decide ${reqId}] ✗ parse failed`, safeError(err));
    return { ok: false, error };
  }
}

// ─── Stage 2: Validate ───────────────────────────────────────────────────────

function validatePayload(
  body: Record<string, unknown>,
  reqId: string,
): ValidationResult {
  const geo = extractGeo(body);
  if (!geo) {
    const msg = "geo is missing or invalid";
    hadeLog("warn", `[hade-decide ${reqId}] ✗ validation: ${msg}`);
    return { ok: false, error: msg };
  }

  const candidatesResult = validateCustomCandidates(body, reqId);
  if (!candidatesResult.ok) return candidatesResult;

  return { ok: true };
}

/**
 * Validates custom_candidates if present.
 *
 * Only checks the minimal SpontaneousObject contract: each entry must have a
 * non-empty string `id`, a non-empty string `title`, a valid `type`, and a
 * location with finite lat/lng.
 *
 * Returns { ok: true } when the field is absent (fully optional).
 * Returns { ok: false } on the first malformed entry.
 */
function validateCustomCandidates(
  body: Record<string, unknown>,
  reqId: string,
): ValidationResult {
  const raw = (body as { custom_candidates?: unknown }).custom_candidates;
  if (raw === undefined) return { ok: true };

  if (!Array.isArray(raw)) {
    const msg = "custom_candidates must be an array";
    hadeLog("warn", `[hade-decide ${reqId}] ✗ validation: ${msg}`);
    return { ok: false, error: msg };
  }

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== "object") {
      const msg = `custom_candidates[${i}]: must be an object`;
      hadeLog("warn", `[hade-decide ${reqId}] ✗ validation: ${msg}`);
      return { ok: false, error: msg };
    }

    const c = entry as Record<string, unknown>;

    if (typeof c.id !== "string" || !c.id.trim()) {
      const msg = `custom_candidates[${i}]: id must be a non-empty string`;
      hadeLog("warn", `[hade-decide ${reqId}] ✗ validation: ${msg}`);
      return { ok: false, error: msg };
    }

    if (c.type !== "ugc_event" && c.type !== "place_opportunity") {
      const msg = `custom_candidates[${i}]: type must be ugc_event or place_opportunity`;
      hadeLog("warn", `[hade-decide ${reqId}] ✗ validation: ${msg}`);
      return { ok: false, error: msg };
    }

    if (typeof c.title !== "string" || !c.title.trim()) {
      const msg = `custom_candidates[${i}]: title must be a non-empty string`;
      hadeLog("warn", `[hade-decide ${reqId}] ✗ validation: ${msg}`);
      return { ok: false, error: msg };
    }

    const location = c.location;
    const lat = location && typeof location === "object" ? (location as { lat?: unknown }).lat : null;
    const lng = location && typeof location === "object" ? (location as { lng?: unknown }).lng : null;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      const msg = `custom_candidates[${i}]: location must have finite lat and lng`;
      hadeLog("warn", `[hade-decide ${reqId}] ✗ validation: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  return { ok: true };
}

function extractGeo(body: Record<string, unknown> | null | undefined): GeoLocation | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { geo?: unknown }).geo;
  if (!raw || typeof raw !== "object") return null;
  const { lat, lng } = raw as { lat?: unknown; lng?: unknown };
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  return { lat, lng };
}

// ─── Stage 4: Fallback response ──────────────────────────────────────────────

/**
 * Returns a 200 response with guaranteed >= 1 SpontaneousObject in both
 * `decision` and `fallback_places`. Attempts Google Places first; if that
 * fails or returns nothing, emits 3 static synthetic objects.
 */
async function fallbackResponse(
  reqId: string,
  reason: string,
  detail: string,
  geoHint: GeoLocation | null,
  bodyHint?: Record<string, unknown> | null,
): Promise<Response> {
  const candidates = await buildFallbackCandidates(geoHint, reqId, bodyHint);
  const fallbackContext = resolveFallbackContext(bodyHint, geoHint);
  const catalogFallback = buildStaticFallbackEntries(bodyHint, geoHint, reqId);
  const selected = candidates[0];
  const selectedEntry =
    selected.fallback_entry ??
    catalogFallback.entries[0] ??
    FALLBACK_CATALOG[catalogFallback.profile.id][0];
  const source = (selected.source === "degraded_location" ? "degraded_location" : "static_fallback") satisfies FallbackSource;
  const decision: HadeDecision = selected.fallback_entry
    ? createFallbackDecisionFromObject(selected, selectedEntry, fallbackContext, source, geoHint)
    : ({
        ...selected,
        id: selected.id,
        venue_name: selected.title,
        title: selected.title,
        category: selectedEntry.category,
        geo: selected.location,
        distance_meters: selected.radius,
        eta_minutes: Math.max(1, Math.ceil(selected.radius / 80)),
        rationale: "Live ranking is unavailable, but this place came from a grounded fallback lookup. Treat it as a useful lead, not a fully scored HADE decision.",
        why_now: "It is the best available fallback while the decision engine is degraded.",
        why_this: "Grounded fallback candidate with minimal extra assumptions.",
        decision_frame: "Fallback mode: useful local lead, not a live ranked decision.",
        confidence: 0.5,
        confidence_label: "Exploratory",
        situation_summary: "Grounded fallback decision",
        is_fallback: true,
        source,
      } as HadeDecision);
  // candidates.length >= 1 guaranteed by buildFallbackCandidates
  const responseBody = await enhanceDecisionCopy({
    decision,
    decision_node: null,
    fallback_places: candidates,
    context_snapshot: {
      situation_summary: decision.situation_summary,
      interpreted_intent: readNestedString(bodyHint, "situation", "intent", "inferred"),
      decision_basis: "fallback" as const,
      candidates_evaluated: candidates.length,
      llm_failure_reason: "provider_error" as const,
      fallback_reason: reason,
    },
    session_id: null,
    source,
    degraded: true,
    error: { code: "engine_unavailable", reason, detail: sanitizeLogText(detail) },
  }, bodyHint ?? {}, reqId);

  hadeLog("warn", `[hade-decide ${reqId}] fallback`, {
    reason,
    detail: sanitizeLogText(detail),
    source,
    candidates: candidates.length,
  });

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "x-hade-source": source,
      "x-hade-fallback-reason": reason,
      "x-hade-degraded": "1",
    },
  });
}

// ─── Tier 2.5 helpers ────────────────────────────────────────────────────────

/**
 * Extracts venues and LocationNode weights from a Tier 2 result and writes
 * them to the offline cache. Fire-and-forget — called with `void`, never awaited
 * on the critical path.
 */
async function writeCacheFromSynthetic(
  objects: SpontaneousObject[],
  body: Record<string, unknown>,
): Promise<void> {
  if (objects.length === 0) return;

  // ── Cold-start seeding ────────────────────────────────────────────────────
  // For each venue with no existing LocationNode, create a trust-prior node
  // derived from its Google rating. This is a one-time initialization only:
  //   • Existing nodes are never read, modified, or overwritten.
  //   • weight_map stays empty — no synthetic vibe tags are injected.
  //   • trust_score encodes prior belief quality; UGC signals refine it later.
  for (const object of objects) {
    const exists = await locationNodeExists(object.id);
    if (exists) continue;

    await createLocationNode({
      venue_id: object.id,
      trust_score: Math.max(0, Math.min(1, object.trust_score)),
      weight_map: {} as LocationNode["weight_map"],
      signal_count: 0,
      last_updated: new Date().toISOString(),
      version: 0,
    });
  }

  const venues: CachedVenue[] = objects.map((object) => ({
    id: object.id,
    name: object.title,
    geo: { lat: object.location.lat, lng: object.location.lng },
    rating: 1 + Math.max(0, Math.min(1, object.trust_score)) * 4,
  }));

  const rawNodes = (body as { location_nodes?: unknown }).location_nodes;
  const nodes: CachedLocationNode[] = Array.isArray(rawNodes)
    ? rawNodes
        .filter((n): n is Record<string, unknown> => typeof n === "object" && n !== null)
        .map((n) => ({
          venue_id: String(n["venue_id"] ?? ""),
          weight_map: (n["weight_map"] as Record<string, number>) ?? {},
          signal_count: Number(n["signal_count"] ?? 0),
          last_updated: String(n["last_updated"] ?? new Date().toISOString()),
        }))
        .filter((n) => n.venue_id.length > 0)
    : [];

  await setOfflineCache(venues, nodes);
}

function buildOfflineCacheNarrative(
  body: Record<string, unknown>,
  candidatesEvaluated: number,
): Pick<HadeDecision, "rationale" | "why_now" | "why_this" | "decision_frame" | "situation_summary"> {
  const ctx = resolveFallbackContext(body, extractGeo(body));
  const groupCopy = ctx.groupSize > 1 || ctx.groupType !== "solo"
    ? "your group"
    : "you";
  const energyCopy =
    ctx.energy === "low"
      ? "lower-effort"
      : ctx.energy === "high"
        ? "momentum-friendly"
        : "balanced";
  const urgencyCopy =
    ctx.urgency === "high"
      ? "Because urgency is high, this favors a recent cached option over more searching."
      : "Since this is not urgent, treat it as a useful cached lead rather than a hard directive.";

  return {
    rationale: `Network context is degraded, so HADE is using a recent cached place instead of claiming a fresh live read. It is the strongest cached option from ${candidatesEvaluated} recent candidate${candidatesEvaluated === 1 ? "" : "s"} for ${groupCopy}.`,
    why_now: `${urgencyCopy} The copy is current, but the venue signal may be stale.`,
    why_this: `${energyCopy} cached option while live data is unavailable.`,
    decision_frame: "Offline cache: useful recent lead, not a live local ranking.",
    situation_summary: `Offline cache fallback: ${ctx.timeOfDay}, ${ctx.groupType}, ${ctx.energy} energy.`,
  };
}

/**
 * Scores cached venues by proximity + rating + UGC vibe overlay, picks the
 * best, and returns a Response shaped like a normal DecideResponse.
 *
 * Returns null if scoring produces no valid candidates (e.g. empty input).
 * Wrapped in try/catch — never throws past this boundary.
 */
async function buildOfflineResponse(
  cache: CacheEntry,
  geoHint: GeoLocation,
  reqId: string,
  body: Record<string, unknown>,
): Promise<Response | null> {
  try {
    const weights =
      (
        body as {
          settings?: { scoring_weights?: ScoringWeights | null };
        }
      )?.settings?.scoring_weights ?? undefined;
    const scored = cache.venues.map((venue) => {
      const dist = haversineDistanceMeters(geoHint, venue.geo);
      const proximityScore = Math.max(0, 1 - dist / 3000);
      const ratingScore = ((venue.rating ?? 3.5) - 1) / 4; // 1–5 → 0–1
      const proximityWeight = weights?.proximity ?? 0.6;
      const ratingWeight = weights?.rating ?? 0.4;
      const baseScore =
        proximityScore * proximityWeight +
        ratingScore * ratingWeight;

      // UGC overlay — matches the vibe scoring formula in synthetic.ts
      const node = cache.nodes.find((n) => n.venue_id === venue.id);
      const wValues = node ? Object.values(node.weight_map) : [];
      const vibeScore =
        wValues.length > 0
          ? wValues.reduce((s, v) => s + v, 0) / wValues.length
          : 0.5; // neutral when no UGC history
      const vibeDelta = (vibeScore - 0.5) * 0.2; // ±0.10 max

      const score = Math.max(0, Math.min(1, baseScore + vibeDelta));
      return { venue, dist, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return null;
    const decisionNode = cache.nodes.find((n) => n.venue_id === best.venue.id) ?? null;
    const now = Date.now();
    const fallbackObjects: SpontaneousObject[] = cache.venues.map((venue) => ({
      id: venue.id,
      type: "place_opportunity",
      title: venue.name,
      time_window: { start: now, end: now + 60 * 60 * 1000 },
      location: { lat: venue.geo.lat, lng: venue.geo.lng, place_id: venue.id },
      radius: Math.round(haversineDistanceMeters(geoHint, venue.geo)),
      going_count: 0,
      maybe_count: 0,
      user_state: null,
      created_at: now,
      expires_at: now + 60 * 60 * 1000,
      trust_score: Math.max(0, Math.min(1, ((venue.rating ?? 3.5) - 1) / 4)),
      source: "offline_cache",
    }));
    const bestObject = fallbackObjects.find((object) => object.id === best.venue.id);
    const narrative = buildOfflineCacheNarrative(body, cache.venues.length);

    const responseBody = await enhanceDecisionCopy({
      decision: {
        ...(bestObject ?? {}),
        id: best.venue.id,
        venue_name: best.venue.name,
        category: "venue",
        geo: best.venue.geo,
        distance_meters: Math.round(best.dist),
        eta_minutes: Math.max(1, Math.ceil(best.dist / 80)), // 80 m/min walking
        rationale: narrative.rationale,
        why_now: narrative.why_now,
        why_this: narrative.why_this,
        decision_frame: narrative.decision_frame,
        confidence: 0.55,
        confidence_label: "Exploratory" as const,
        situation_summary: narrative.situation_summary,
        source: "offline_cache" as const,
        is_fallback: true,
      },
      context_snapshot: {
        situation_summary: narrative.situation_summary,
        interpreted_intent: readNestedString(body, "situation", "intent", "inferred"),
        decision_basis: "fallback" as const,
        candidates_evaluated: cache.venues.length,
        llm_failure_reason: "provider_error" as const,
      },
      session_id: `offline-${reqId}`,
      source: "offline_cache",
      fallback_places: fallbackObjects,
      decision_node: decisionNode,
    }, body, reqId);

    return withDegradedSignal(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "x-hade-source": "offline_cache",
      },
    });
  } catch {
    return null;
  }
}

// ─── Logging helpers ─────────────────────────────────────────────────────────

function summarizePayload(body: Record<string, unknown>): string {
  const geo = extractGeo(body);
  const geoStr = geo
    ? `geo=(${geo.lat.toFixed(2)},${geo.lng.toFixed(2)})`
    : "geo=missing";

  const situation = (body as { situation?: { intent?: unknown } }).situation;
  const intent = situation?.intent ?? "null";

  const persona = (body as { persona?: { id?: unknown } }).persona;
  const personaId = persona?.id ?? "none";

  const rejHistory = (body as { rejection_history?: unknown[] }).rejection_history;
  const rejCount = Array.isArray(rejHistory) ? rejHistory.length : 0;

  const customCandidates = (body as { custom_candidates?: unknown[] }).custom_candidates;
  const customCount = Array.isArray(customCandidates) ? customCandidates.length : 0;

  const customStr = customCount > 0 ? ` custom_candidates=${customCount}` : "";
  return `${geoStr} intent=${String(intent)} persona=${String(personaId)} rejections=${rejCount}${customStr}`;
}
