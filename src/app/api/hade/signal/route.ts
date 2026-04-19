/**
 * POST /api/hade/signal
 *
 * UGC VibeSignal ingest endpoint.
 *
 * Accepts a batch of VibeSignals from the client's idle-flush queue,
 * validates and sanitizes each signal, computes weight deltas, and
 * upserts the LocationNode registry for use in the next decide() call.
 *
 * Returns 202 Accepted with per-signal IDs and updated node versions.
 * Returns 400 on malformed input. Never returns 5xx for partial failures —
 * each signal is processed independently; bad signals are rejected, good ones accepted.
 *
 * Auth: None (MVP). Add request signing / user token validation here in Phase 2.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID }                from "crypto";
import type {
  SignalIngestRequest,
  SignalIngestResponse,
  VibeSignal,
} from "@/types/hade";
import { VIBE_TAG_SENTIMENT }        from "@/types/hade";
import {
  computeWeightDelta,
  upsertLocationNode,
}                                    from "@/lib/hade/weights";
import {
  aggregateSignals,
  filterExpiredSignals,
}                                    from "@/lib/hade/signals";

// ─── Valid VibeTag set for sanitization ───────────────────────────────────────

const VALID_VIBE_TAGS = new Set(Object.keys(VIBE_TAG_SENTIMENT));

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const reqId = randomUUID().slice(0, 8);
  const t0    = Date.now();

  console.log(`[hade-signal ${reqId}] ← POST received`);

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!isSignalIngestRequest(body)) {
    return NextResponse.json(
      { error: "Body must be { signals: VibeSignal[] }" },
      { status: 400 },
    );
  }

  const { signals: rawSignals, session_id } = body;

  if (rawSignals.length === 0) {
    return NextResponse.json<SignalIngestResponse>({
      accepted:      0,
      rejected:      0,
      signal_ids:    [],
      node_versions: {},
    });
  }

  // ── Pre-process: deduplicate + strip expired ────────────────────────────────
  const fresh = filterExpiredSignals(rawSignals);
  const deduped = aggregateSignals(fresh) as VibeSignal[];

  console.log(
    `[hade-signal ${reqId}]   raw=${rawSignals.length}` +
    ` fresh=${fresh.length} deduped=${deduped.length}`,
  );

  // ── Validate + apply each signal ───────────────────────────────────────────
  const accepted:    string[] = [];
  const rejected:    number   = rawSignals.length - deduped.length; // dropped as dupes/expired
  const nodeVersions: Record<string, number> = {};

  for (const signal of deduped) {
    const result = validateAndSanitize(signal, session_id);
    if (!result.ok) {
      console.warn(`[hade-signal ${reqId}]   reject signal ${signal.id}: ${result.reason}`);
      continue;
    }

    const clean = result.signal;
    const delta = computeWeightDelta(clean);
    const node  = await upsertLocationNode(clean.location_node_id, clean, delta);

    accepted.push(clean.id);
    nodeVersions[clean.location_node_id] = node.version;

    console.log(
      `[hade-signal ${reqId}]   accepted ${clean.id}` +
      ` venue=${clean.location_node_id} Δw=${delta.toFixed(3)} node.v=${node.version}`,
    );
  }

  const ms = Date.now() - t0;
  console.log(
    `[hade-signal ${reqId}] → done in ${ms}ms` +
    ` accepted=${accepted.length} rejected=${rejected + (deduped.length - accepted.length)}`,
  );

  return NextResponse.json<SignalIngestResponse>(
    {
      accepted:      accepted.length,
      rejected:      rejected + (deduped.length - accepted.length),
      signal_ids:    accepted,
      node_versions: nodeVersions,
    },
    { status: 202 },
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true;  signal: VibeSignal }
  | { ok: false; reason: string };

function validateAndSanitize(
  raw:        VibeSignal,
  sessionId?: string,
): ValidationResult {
  // Required fields
  if (!raw.location_node_id?.trim()) {
    return { ok: false, reason: "missing location_node_id" };
  }

  if (!Array.isArray(raw.vibe_tags) || raw.vibe_tags.length === 0) {
    return { ok: false, reason: "vibe_tags must be a non-empty array" };
  }

  // Sanitize tags to known enum values only
  const cleanTags = raw.vibe_tags.filter((t) => VALID_VIBE_TAGS.has(t));
  if (cleanTags.length === 0) {
    return { ok: false, reason: "no valid vibe_tags after sanitization" };
  }

  // Clamp strength to [0, 1]
  const strength = Math.max(0, Math.min(1, raw.strength ?? 0.7));

  // Derive sentiment from tag majority if not provided or invalid
  const posCount = cleanTags.filter(
    (t) => VIBE_TAG_SENTIMENT[t] === "positive",
  ).length;
  const negCount = cleanTags.length - posCount;
  const sentiment: VibeSignal["sentiment"] =
    posCount > negCount ? "positive" : negCount > posCount ? "negative" : "neutral";

  const signal: VibeSignal = {
    ...raw,
    id:               raw.id ?? `vsig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    vibe_tags:        cleanTags,
    strength,
    sentiment,
    source:           "user",
    category:         "vibe",
    shareable:        raw.shareable ?? false,
    validation_status: "approved",
  };

  // Attach session if the signal didn't carry one
  if (sessionId && !signal.source_user_id) {
    signal.source_user_id = sessionId;
  }

  return { ok: true, signal };
}

// ─── Type guard ───────────────────────────────────────────────────────────────

function isSignalIngestRequest(v: unknown): v is SignalIngestRequest {
  return (
    typeof v === "object" &&
    v !== null &&
    "signals" in v &&
    Array.isArray((v as SignalIngestRequest).signals)
  );
}
