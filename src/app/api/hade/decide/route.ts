import { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { generateSyntheticDecision } from "@/core/engine/synthetic";
import type { GeoLocation } from "@/types/hade";

export const runtime = "nodejs";

// ─── Configuration ───────────────────────────────────────────────────────────

const UPSTREAM_TIMEOUT_MS = 8000;
const DEFAULT_GEO: GeoLocation = { lat: 39.7392, lng: -104.9903 }; // Denver

// ─── Stage result types ──────────────────────────────────────────────────────

type ParseResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string };

type ValidationResult = { ok: true } | { ok: false; error: string };

type UpstreamResult =
  | { ok: true; text: string; status: number }
  | {
      ok: false;
      reason:
        | "upstream_unreachable"
        | "upstream_timeout"
        | "upstream_error"
        | "upstream_non_json";
      detail: string;
    };

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const reqId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  console.log(`[hade-decide ${reqId}] ← POST received`);

  try {
    // Stage 1: Parse body
    const parsed = await safeParseBody(request, reqId);
    if (!parsed.ok) {
      return fallbackResponse(reqId, "parse_error", parsed.error, null);
    }

    // Stage 2: Validate minimal shape
    const validated = validatePayload(parsed.body, reqId);
    const geoHint = extractGeo(parsed.body);
    if (!validated.ok) {
      return fallbackResponse(reqId, "validation_error", validated.error, geoHint);
    }

    // Stage 3+4: Generate the decision (upstream call + success/fallback routing)
    return await generateDecision(parsed.body, reqId, geoHint, startedAt);
  } catch (err) {
    // Belt-and-braces — should be unreachable because every stage catches its own errors.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[hade-decide ${reqId}] ✗ unexpected throw: ${detail}`);
    return fallbackResponse(reqId, "unexpected_error", detail, null);
  }
}

// ─── Decision generation ─────────────────────────────────────────────────────

/**
 * Three-tier decision pipeline:
 *
 *  Tier 1 — Upstream LLM  : forward to HADE_UPSTREAM_URL, inject source tag
 *  Tier 2 — Synthetic     : build a grounded decision from real Places API results
 *  Tier 3 — Static fallback: hardcoded cafe stub when all else fails
 *
 * Always returns a valid Response — never throws past this boundary.
 */
async function generateDecision(
  body: Record<string, unknown>,
  reqId: string,
  geoHint: GeoLocation | null,
  startedAt: number,
): Promise<Response> {
  try {
    // ── Tier 1: Upstream LLM ─────────────────────────────────────────────────
    const upstream = await callUpstream(body, reqId);

    if (upstream.ok) {
      const elapsed = Date.now() - startedAt;
      console.log(`[hade-decide ${reqId}] ✓ Tier 1 (llm) ok in ${elapsed}ms`);

      // Upstream body is validated JSON (checked in callUpstream) — safe to parse.
      const data = JSON.parse(upstream.text) as Record<string, unknown>;
      const enriched = { ...data, source: "llm", fallback_places: [] };

      return new Response(JSON.stringify(enriched), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-hade-source": "llm",
        },
      });
    }

    console.warn(
      `[hade-decide ${reqId}] ↓ Tier 1 failed (${upstream.reason}), trying Tier 2 (synthetic)`,
    );

    // ── Tier 2: Synthetic (real Places API candidates) ────────────────────────
    const synthetic = await generateSyntheticDecision(body, reqId, geoHint);

    if (synthetic.ok) {
      const elapsed = Date.now() - startedAt;
      console.log(
        `[hade-decide ${reqId}] ✓ Tier 2 (synthetic) ok in ${elapsed}ms` +
          ` — ${synthetic.places.length} place(s)`,
      );

      return new Response(JSON.stringify(synthetic.data), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-hade-source": "synthetic",
        },
      });
    }

    console.warn(`[hade-decide ${reqId}] ↓ Tier 2 failed, falling to Tier 3 (static)`);

    // ── Tier 3: Static fallback ───────────────────────────────────────────────
    return fallbackResponse(reqId, upstream.reason, upstream.detail, geoHint);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[hade-decide ${reqId}] ✗ generateDecision threw: ${detail}`);
    return fallbackResponse(reqId, "decision_error", detail, geoHint);
  }
}

// ─── Stage 1: Parse body ─────────────────────────────────────────────────────

async function safeParseBody(
  request: NextRequest,
  reqId: string,
): Promise<ParseResult> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const summary = summarizePayload(body);
    console.log(`[hade-decide ${reqId}]   payload: ${summary}`);
    return { ok: true, body };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown parse error";
    console.warn(`[hade-decide ${reqId}] ✗ parse failed: ${error}`);
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
    console.warn(`[hade-decide ${reqId}] ✗ validation: ${msg}`);
    return { ok: false, error: msg };
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

// ─── Stage 3: Upstream call ──────────────────────────────────────────────────

async function callUpstream(
  body: Record<string, unknown>,
  reqId: string,
): Promise<UpstreamResult> {
  const url = `${serverEnv.hadeUpstreamUrl}/hade/decide`;
  const headers: HeadersInit = { "Content-Type": "application/json" };

  if (serverEnv.hadeApiKey && serverEnv.hadeApiKey !== "your_secret_here") {
    headers["x-api-key"] = serverEnv.hadeApiKey;
  }

  console.log(`[hade-decide ${reqId}]   → upstream POST ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (err instanceof DOMException && err.name === "TimeoutError") {
      console.warn(
        `[hade-decide ${reqId}] ✗ upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`,
      );
      return { ok: false, reason: "upstream_timeout", detail };
    }
    console.warn(`[hade-decide ${reqId}] ✗ upstream unreachable: ${detail}`);
    return { ok: false, reason: "upstream_unreachable", detail };
  }

  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[hade-decide ${reqId}] ✗ upstream body read failed: ${detail}`);
    return { ok: false, reason: "upstream_error", detail };
  }

  if (!response.ok) {
    console.warn(
      `[hade-decide ${reqId}] ✗ upstream ${response.status}: ${text.slice(0, 200)}`,
    );
    return {
      ok: false,
      reason: "upstream_error",
      detail: `${response.status} ${response.statusText}`,
    };
  }

  // Confirm body is valid JSON before forwarding. An upstream that returns 200
  // with an HTML error page would otherwise break the client's res.json().
  try {
    JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(
      `[hade-decide ${reqId}] ✗ upstream non-JSON body: ${text.slice(0, 200)}`,
    );
    return { ok: false, reason: "upstream_non_json", detail };
  }

  return { ok: true, text, status: response.status };
}

// ─── Stage 4: Fallback response ──────────────────────────────────────────────

function fallbackResponse(
  reqId: string,
  reason: string,
  detail: string,
  geoHint: GeoLocation | null,
): Response {
  const geo = geoHint ?? DEFAULT_GEO;

  const body = {
    decision: {
      id: `fallback-${reqId}`,
      venue_name: "Try a nearby coffee shop",
      category: "cafe",
      geo,
      distance_meters: 140,
      eta_minutes: 2,
      rationale: "A familiar cafe within easy walking distance.",
      why_now: "Good time for a break",
      confidence: 0.5,
      situation_summary: "Fallback decision — upstream engine unavailable",
    },
    context_snapshot: {
      situation_summary: "Fallback decision — upstream engine unavailable",
      interpreted_intent: "chill",
      decision_basis: "fallback" as const,
      candidates_evaluated: 0,
      llm_failure_reason: "provider_error" as const,
    },
    session_id: `fallback-${reqId}`,
    source: "static_fallback" as const,
    fallback_places: [],
  };

  console.warn(`[hade-decide ${reqId}] ⚠ fallback (${reason}): ${detail}`);

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "x-hade-source": "fallback",
      "x-hade-fallback-reason": reason,
    },
  });
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

  return `${geoStr} intent=${String(intent)} persona=${String(personaId)}`;
}
