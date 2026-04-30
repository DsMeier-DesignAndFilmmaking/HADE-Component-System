/**
 * viewModel.ts — Frontend data contract for the HADE decision card.
 *
 * Owns the boundary between raw API responses and UI rendering:
 *   • Reads backend-owned values directly (confidence, rationale, category, etc.)
 *   • Computes only display-layer concerns (temporal_state, distance_label)
 *   • Handles every missing-field case so components receive guaranteed shapes
 *
 * Rules:
 *   ✓ temporal_state — client-side: tied to Date.now(), changes every ~5 min
 *   ✓ distance_label — client-side: display formatting, not business logic
 *   ✗ CTA label      — already computed by _deriveUX() → response.ux.cta; read, don't re-derive
 *   ✗ confidence     — backend-owned; never re-score client-side
 *   ✗ distance_copy  — UGC only; backend pre-computes bucket label in ugc_meta.distance_copy
 */

import type { HadeResponse, SpontaneousObject, UiState } from "@/types/hade";
import type { DecisionCandidate } from "@/core/types/decision";
import { computeTemporalState, type TemporalState } from "@/lib/hade/ugcCopy";
import { formatDistance, formatEta } from "@/lib/hade/format";

// ─── Type ─────────────────────────────────────────────────────────────────────

export interface DecisionViewModel {
  // ── Identity (direct from backend) ──────────────────────────────────────────
  id:            string;
  title:         string;
  category:      string;
  neighborhood?: string;

  // ── Display labels (client-formatted — display concern, not business logic) ──
  /** Metric distance for Google results ("80m", "1.2km").
   *  Bucket copy for UGC ("Around the corner") — taken from ugc_meta.distance_copy. */
  distance_label: string;
  /** Walking ETA, undefined when ≤ 0. */
  eta_label?: string;

  // ── Scoring (read-only; backend owns all scoring logic) ─────────────────────
  /** 0–1 composite score, as returned by the backend. */
  confidence: number;

  // ── UX state (computed by _deriveUX client-side hook; read here, never re-derived) ──
  /** Confidence tier that drives card presentation intensity. */
  ui_state:  UiState;
  /** Primary call-to-action label. */
  cta_label: string;

  // ── Source metadata ──────────────────────────────────────────────────────────
  /** True when the decision was served from the Tier 3 static stub. */
  is_fallback: boolean;

  // ── UGC ─────────────────────────────────────────────────────────────────────
  /** True when the winning candidate was a user-created entity. */
  is_ugc: boolean;
  /**
   * Temporal label computed from expires_at / created_at using a 5-minute
   * bucket — the only legitimately client-side computation on UGC timing.
   * Absent for Google results and for UGC in the "suppressed" state.
   */
  temporal_state?: Exclude<TemporalState, "suppressed">;
  /** Raw UGC timing + pre-computed distance copy for components that need them. */
  ugc_meta?: {
    is_ugc:       true;
    expires_at?:  string;  // ISO-8601
    created_at:   string;  // ISO-8601
    distance_copy: string; // pre-computed by backend — "Around the corner" etc.
  };

  // ── Explanation signals ("Why this?" sheet) ──────────────────────────────────
  explanation_signals?: {
    vibe_match:   "strong" | "moderate" | "none";
    social_proof: "high"   | "moderate" | "none";
  };

  // ── Conditional display flags (driven by DecisionCandidate.metadata) ─────────
  /** False when time_relevance is absent — components should hide time labels. */
  show_time_label: boolean;
  /** False when social_signal is absent or zero — components should hide going count. */
  show_going_ui:   boolean;

  object: SpontaneousObject;
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

const FALLBACK_CTA      = "Go now";
const FALLBACK_UI_STATE: UiState = "low";

/**
 * Maps a raw HadeResponse into a DecisionViewModel.
 *
 * Returns null when `response.decision` is absent (pre-ready state).
 * Never throws — all missing fields are handled with safe defaults.
 */
export function buildDecisionViewModel(response: HadeResponse): DecisionViewModel | null {
  const dec = response.decision;
  if (!dec) return null;

  const isUGC = dec.ugc_meta?.is_ugc === true;

  // ── temporal_state ────────────────────────────────────────────────────────
  // Client-side computation: `computeTemporalState` uses Date.now() internally
  // via 5-minute bucket quantization. Only meaningful for UGC entities.
  let temporalState: Exclude<TemporalState, "suppressed"> | undefined;
  if (isUGC && dec.ugc_meta) {
    const raw = computeTemporalState(dec.ugc_meta.expires_at, dec.ugc_meta.created_at);
    if (raw !== "suppressed") temporalState = raw;
  }

  // ── distance_label ────────────────────────────────────────────────────────
  // UGC:    backend pre-computed a human bucket label (e.g. "Around the corner").
  //         Use it directly — do not recompute.
  // Google: format raw meters as metric display label (e.g. "350m", "1.2km").
  //         This is a display concern, not business logic.
  const distanceLabel =
    isUGC && dec.ugc_meta?.distance_copy
      ? dec.ugc_meta.distance_copy
      : formatDistance(dec.distance_meters);
  const now = Date.now();
  const object: SpontaneousObject = {
    id: dec.id,
    type: dec.type ?? (isUGC ? "ugc_event" : "place_opportunity"),
    title: dec.title ?? dec.venue_name,
    time_window: dec.time_window ?? { start: now, end: now + 60 * 60 * 1000 },
    location: dec.location ?? { lat: dec.geo.lat, lng: dec.geo.lng },
    radius: dec.radius ?? dec.distance_meters,
    going_count: dec.going_count ?? 0,
    maybe_count: dec.maybe_count ?? 0,
    user_state: dec.user_state ?? null,
    created_at: dec.created_at ?? now,
    expires_at: dec.expires_at ?? now + 60 * 60 * 1000,
    trust_score: dec.trust_score ?? dec.confidence,
    vibe_tag: dec.vibe_tag,
    source: dec.source,
  };

  return {
    // Identity
    id:            dec.id,
    title:         dec.venue_name,
    category:      dec.category,
    neighborhood:  dec.neighborhood,

    // Display labels
    distance_label: distanceLabel,
    eta_label:      formatEta(dec.eta_minutes),

    // Scoring — read, never recompute
    confidence: dec.confidence,

    // UX state — produced by _deriveUX() in hooks.ts; read here
    ui_state:  response.ux?.ui_state  ?? FALLBACK_UI_STATE,
    cta_label: response.ux?.cta       ?? FALLBACK_CTA,

    // Source
    is_fallback: dec.is_fallback === true || response.source === "fallback" || response.source === "static_fallback",

    // UGC
    is_ugc:       isUGC,
    ...(temporalState !== undefined ? { temporal_state: temporalState } : {}),
    ...(dec.ugc_meta               ? { ugc_meta: dec.ugc_meta }        : {}),

    // Signals
    explanation_signals: response.explanation_signals,

    // Default flags: HadeResponse carries all signals, so both are shown
    show_time_label: true,
    show_going_ui:   true,

    object,
  };
}

// ─── DecisionCandidate-first mapper ──────────────────────────────────────────

/**
 * Builds a DecisionViewModel using a DecisionCandidate as the authoritative
 * source for metadata-derived display flags, with HadeResponse supplying the
 * remaining fields.
 *
 * Fallback rules:
 *   • show_time_label → false when candidate.metadata.time_relevance is absent
 *   • show_going_ui   → false when candidate.metadata.social_signal is absent or 0
 *
 * The original SpontaneousObject is preserved in `object` via buildDecisionViewModel
 * so no downstream components break.
 */
export function mapToDecisionViewModel(
  candidate: DecisionCandidate,
  response: HadeResponse,
): DecisionViewModel | null {
  const base = buildDecisionViewModel(response);
  if (!base) return null;

  const { time_relevance, social_signal } = candidate.metadata;

  return {
    ...base,
    show_time_label: time_relevance !== undefined,
    show_going_ui:   social_signal !== undefined && social_signal > 0,
  };
}
