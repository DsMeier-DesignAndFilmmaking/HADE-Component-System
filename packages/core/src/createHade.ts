/**
 * createHade — the v1.0 factory.
 *
 * Returns a {@link HadeClient} whose decide/refine methods orchestrate the
 * wired adapter bundle. Phase C delivers a minimal-but-real decide():
 *
 *   1. Resolve geo (caller-supplied OR via GeoAdapter)
 *   2. Call venue.searchForContext for candidates
 *   3. Build a DecisionEngineOutput via the existing buildDecisionEngineOutput
 *      (no synthetic ranking yet — that lands in Phase D/E)
 *
 * Failures degrade to a fallback output via DecisionSource = "static_tier3_fallback"
 * preserving the engine's existing no-key path.
 *
 * See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md §1
 */

import {
  fromDecideResponse,
  type DecideResponseLike,
  type HadeDecisionLike,
} from "./engine/buildOutput.js";
import { resolveAdapters } from "./adapters/registry.js";
import { emptyVenues } from "./adapters/defaults/emptyVenues.js";
import { noopLLM } from "./adapters/defaults/noopLLM.js";
import { memoryCache } from "./adapters/defaults/memoryCache.js";
import { staticGeo } from "./adapters/geo/staticGeo.js";
import { callAdapter } from "./internal/callAdapter.js";
import { loadConfig, resolveEffectiveCopy } from "./config/loadConfig.js";
import { computeConfigHashSync } from "./config/hash.js";
import type {
  DecideInput,
  DecideOptions,
  HadeClient,
  HadeClientConfig,
  RefineInput,
  ResolvedHadeConfig,
} from "./types/HadeClient.js";
import type {
  GeoCoords,
  HadeAdapters,
  VenueCandidate,
  VenueContextLike,
} from "./types/adapters.js";
import type { DecisionEngineOutput } from "./types/DecisionEngineOutput.js";

const DEFAULT_GEO: GeoCoords = { lat: 40.7128, lng: -74.006 }; // NYC fallback for no-geo runs.

let clientCounter = 0;

/**
 * Builds and returns a HadeClient. Sync. Edge-safe. No I/O.
 *
 * If `clientConfig.adapters` is omitted (or partial), defaults are filled in:
 *   - venue → emptyVenues()
 *   - llm   → noopLLM()
 *   - cache → memoryCache()
 *   - geo   → staticGeo({ coords: DEFAULT_GEO })
 *
 * If `registerDefaultAdapters` has been called at app boot, those win over the
 * built-in defaults; explicit `adapters` in `clientConfig` wins over both.
 */
export function createHade(clientConfig: HadeClientConfig = {}): HadeClient {
  // Resolve adapter bundle: explicit > registered > built-in defaults.
  const overrides = clientConfig.adapters;
  const adapters: HadeAdapters = (() => {
    try {
      const resolved = resolveAdapters(overrides);
      // resolveAdapters() throws if no venue is registered AND no override given.
      // We catch and fall back to defaults to keep `createHade()` always succeed.
      return resolved;
    } catch {
      return {
        venue: overrides?.venue ?? emptyVenues(),
        llm: overrides?.llm ?? noopLLM(),
        cache: overrides?.cache ?? memoryCache(),
        geo: overrides?.geo ?? staticGeo({ coords: DEFAULT_GEO }),
      };
    }
  })();

  // Fill any slots resolveAdapters returned undefined for.
  const venue = adapters.venue ?? emptyVenues();
  const llm = adapters.llm ?? noopLLM();
  const cache = adapters.cache ?? memoryCache();
  const geo = adapters.geo ?? staticGeo({ coords: DEFAULT_GEO });

  const resolvedAdapters: HadeAdapters = { venue, llm, cache, geo };

  const clientId = clientConfig.clientId ?? `hade-client-${++clientCounter}`;
  // First pass — load with a placeholder hash so the resolved shape is fully
  // materialized (built-in domains, copy defaults, scoring profiles all merged).
  const preliminary = loadConfig(clientConfig.config, { clientId });
  // Second pass — hash the resolved config (volatile fields stripped inside
  // computeConfigHashSync) so identical inputs across processes / restarts
  // produce identical hashes. Replaces the legacy FNV-on-raw-input stub.
  const resolvedConfig: ResolvedHadeConfig = {
    ...preliminary,
    config_hash: computeConfigHashSync(preliminary),
    defaults: {
      ...preliminary.defaults,
      config_hash: computeConfigHashSync(preliminary),
    },
  };

  let lastOutput: DecisionEngineOutput | null = null;

  async function decide(input: DecideInput, options?: DecideOptions): Promise<DecisionEngineOutput> {
    const requestId = options?.requestId ?? input.request_id ?? generateRequestId();
    const timeoutMs = options?.timeoutMs ?? resolvedConfig.timeouts.adapter_ms;
    const radius = input.radius_meters ?? resolvedConfig.defaults.radius_meters;
    const categories = input.categories ?? [];

    // Step 1: resolve geo (caller-supplied wins).
    const coords = input.geo ?? (await resolveGeoSafely(geo));

    // Step 2: fetch candidates if we have coords. Without coords, fall straight to Tier-3.
    let candidates: VenueCandidate[] = [];
    let venueFailed = false;
    if (coords) {
      const context: VenueContextLike = {
        geo: coords,
        radius_meters: radius,
        situation: { intent: input.situation?.intent ?? null },
      };
      const result = await callAdapter(
        { timeoutMs, requestId, parentSignal: options?.signal, adapter: { kind: "venue", name: idToName(venue.id) } },
        async () => venue.searchForContext(context, [...categories]),
      );
      if (result.ok) {
        candidates = [...result.value];
      } else {
        venueFailed = true;
      }
    }

    // Step 3: pick a candidate (no ranking yet — Phase D/E adds synthetic scoring).
    const top = candidates[0];
    const output = top
      ? buildOutputFromCandidate(top, coords, requestId, resolvedConfig)
      : buildFallbackOutput(requestId, resolvedConfig, venueFailed ? "venue_failed" : coords ? "no_candidates" : "no_geo");

    lastOutput = output;
    return output;
  }

  async function refine(
    input: RefineInput,
    prior?: DecisionEngineOutput,
    options?: DecideOptions,
  ): Promise<DecisionEngineOutput> {
    const base = prior ?? lastOutput;
    const refinedInput = normalizeRefineInput(input, base);
    return decide(refinedInput, options);
  }

  function getConfig(): ResolvedHadeConfig {
    return resolvedConfig;
  }

  async function close(): Promise<void> {
    // Phase D wires adapter close() lifecycle hooks. No-op for Phase C.
  }

  return {
    decide,
    refine,
    getConfig,
    adapters: resolvedAdapters,
    close,
  };
}

// ─── helpers ───────────────────────────────────────────────────────────────────

function generateRequestId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `req_${Date.now().toString(36)}_${rand}`;
}

function idToName(id: string): `${string}@${string}` {
  return id.includes("@") ? (id as `${string}@${string}`) : (`${id}@unknown` as `${string}@${string}`);
}

async function resolveGeoSafely(geo: HadeAdapters["geo"]): Promise<GeoCoords | null> {
  if (!geo) return null;
  try {
    return await geo.resolveCoords();
  } catch {
    return null;
  }
}

function haversineMeters(a: GeoCoords, b: GeoCoords): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

function buildOutputFromCandidate(
  candidate: VenueCandidate,
  origin: GeoCoords | null,
  requestId: string,
  config: ResolvedHadeConfig,
): DecisionEngineOutput {
  const distance =
    typeof candidate.distance_meters === "number"
      ? candidate.distance_meters
      : origin
        ? haversineMeters(origin, candidate.geo)
        : 0;

  const eta = Math.max(1, Math.round(distance / 80));

  const decision: HadeDecisionLike = {
    id: candidate.id,
    venue_name: candidate.name,
    category: candidate.category,
    geo: candidate.geo,
    distance_meters: distance,
    eta_minutes: eta,
    address: candidate.address,
    rationale: `${candidate.name} is ${distance} m away.`,
    why_now: "",
    why_this: candidate.vibe || "",
    decision_frame: "",
    confidence_label: "Worth a try",
    confidence: 0.5,
    situation_summary: "",
    is_fallback: false,
    source: candidate.location_source,
  };

  const response: DecideResponseLike = {
    decision,
    source: "synthetic",
    context_snapshot: {
      decision_basis: "fallback",
      candidates_evaluated: 1,
    },
  };

  return fromDecideResponse(response, {
    request_id: requestId,
    locale: config.defaults.locale,
    config_hash: config.config_hash,
    confidence: config.confidence,
    copy_keys: resolveEffectiveCopy(config),
  });
}

function buildFallbackOutput(
  requestId: string,
  config: ResolvedHadeConfig,
  reason: "no_geo" | "no_candidates" | "venue_failed",
): DecisionEngineOutput {
  const decision: HadeDecisionLike = {
    id: `fallback-${requestId}`,
    venue_name: "Take a walk nearby",
    category: "walk",
    geo: { lat: 0, lng: 0 },
    distance_meters: 0,
    eta_minutes: 1,
    rationale: "No matching venues right now. A quick walk is always nearby.",
    why_now: "",
    why_this: "",
    decision_frame: "",
    confidence_label: "Exploratory",
    confidence: 0.3,
    situation_summary: "",
    is_fallback: true,
  };

  const response: DecideResponseLike = {
    decision,
    source: "static_fallback",
    context_snapshot: { decision_basis: "fallback", candidates_evaluated: 0 },
  };

  // Map our internal reason taxonomy onto the public DecisionEngineOutput vocabulary.
  const publicReason: NonNullable<DecisionEngineOutput["fallback_meta"]>["reason"] =
    reason === "venue_failed" ? "places_timeout" : "no_signal";

  return fromDecideResponse(response, {
    request_id: requestId,
    locale: config.defaults.locale,
    config_hash: config.config_hash,
    confidence: config.confidence,
    copy_keys: resolveEffectiveCopy(config),
    fallback_meta: {
      reason: publicReason,
      degraded_fields: reason === "no_geo" ? ["geo", "candidates"] : ["candidates"],
      user_visible: true,
    },
  });
}

function normalizeRefineInput(input: RefineInput, prior: DecisionEngineOutput | null): DecideInput {
  // Tone shorthand → engine treatment is intentionally minimal in Phase C.
  // Phase D/E will route tones into real urgency/radius/intent adjustments.
  if (typeof input === "string") {
    return inheritFromPrior(prior, { request_id: undefined });
  }
  if ("tone" in input) {
    return inheritFromPrior(prior, { request_id: undefined });
  }

  return inheritFromPrior(prior, {
    situation: input.intent !== undefined ? { intent: input.intent } : undefined,
    radius_meters: input.radius_meters,
    categories: input.categories,
  });
}

function inheritFromPrior(
  prior: DecisionEngineOutput | null,
  patch: Partial<DecideInput>,
): DecideInput {
  if (!prior) return { ...patch };
  // Phase C doesn't carry rich prior context — Phase E will round-trip through context_snapshot.
  return { ...patch };
}
