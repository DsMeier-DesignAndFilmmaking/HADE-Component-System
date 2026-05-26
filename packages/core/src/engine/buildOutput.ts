import type {
  ActionToken,
  ConfidenceBand,
  DecisionEngineOutput,
  DecisionSource,
  UxEscalationStep,
  UxNextAction,
  UxSuggestedSheet,
} from "../types/DecisionEngineOutput.js";
import { DECISION_ENGINE_OUTPUT_VERSION } from "../types/DecisionEngineOutput.js";
import { DEFAULT_HADE_CONFIG } from "../config/defaults.js";
import type { ResolvedHadeConfig } from "../config/schema.js";

/** Minimal structural input matching {@link HadeDecision} without importing app types. */
export interface HadeDecisionLike {
  id: string;
  venue_name: string;
  category: string;
  geo: { lat: number; lng: number };
  distance_meters: number;
  eta_minutes: number;
  neighborhood?: string;
  address?: string;
  rationale: string;
  why_now: string;
  why_this: string;
  decision_frame: string;
  confidence_label: string;
  confidence: number;
  situation_summary: string;
  is_fallback?: boolean;
  /** Venue provenance on SpontaneousObject; not always an engine tier. */
  source?: string;
  ugc_meta?: { is_ugc: true };
  commitment?: unknown;
}

/** Mirrors {@link DecideResponse} fields needed for output assembly. */
export interface DecideResponseLike {
  decision: HadeDecisionLike;
  source?: string;
  context_snapshot?: {
    decision_basis?: "llm" | "fallback";
    candidates_evaluated?: number;
    llm_failure_reason?: string;
  };
  ux?: {
    ui_state?: "high" | "medium" | "low";
    cta?: string;
  };
}

export interface BuildOutputOptions {
  request_id?: string;
  generated_at_ms?: number;
  /** Engine tier; normalized when a legacy alias is passed. */
  source?: DecisionSource | string;
  locale?: string;
  config_hash?: string;
  /**
   * Shifts high/medium confidence bars (matches `_deriveUX` in hooks.ts).
   * At 0: high ≥ 0.7, medium ≥ 0.4.
   */
  confidence_threshold?: number;
  /** Runtime confidence thresholds. Defaults preserve legacy bars and labels. */
  confidence?: ResolvedHadeConfig["confidence"];
  /** Override UX hints; otherwise derived from confidence (demo `resolveUiState` / CTA routing). */
  ux_state?: Partial<DecisionEngineOutput["ux_state"]>;
  analytics?: Partial<DecisionEngineOutput["analytics"]>;
  fallback_meta?: DecisionEngineOutput["fallback_meta"];
  palette_ref?: string;
  cited_signals?: Array<{ signal_id: string; weight: number }>;
  copy_keys?: Record<string, string>;
  debug?: DecisionEngineOutput["debug"];
}

const DEFAULT_LOCALE = DEFAULT_HADE_CONFIG.defaults.locale;
const DEFAULT_CONFIG_HASH = "sha256:unconfigured";
const DEFAULT_ESCALATION: UxEscalationStep[] = ["refine", "expand_radius", "switch_mode"];

/** Subset aligned with `@hade/copy` en-US; avoids a package dependency in core. */
const BUILTIN_COPY_KEYS: Record<string, string> = {
  "eyebrow.your_move": "Your move",
  "action.take_me_there": "Take me there",
  "action.refine": "Refine",
  "action.show_alts": "See alternatives",
  "action.explore_nearby": "Explore nearby",
  "action.go_now": "Go now",
  "action.help_refine": "Help me refine",
  "label.strong_pick": "Strong pick",
  "label.good_fit": "Good fit",
  "label.exploratory": "Exploratory",
  "reason.primary": "Primary rationale",
  "reason.why_now": "Why now",
  "reason.why_this": "Why this",
  "reason.decision_frame": "Decision frame",
};

const CONFIDENCE_LABEL_TO_ID: Record<string, string> = {
  "Strong pick": "strong_pick",
  "Good fit": "good_fit",
  Exploratory: "exploratory",
};

/**
 * Maps a {@link HadeDecisionLike} (and optional decide metadata) to {@link DecisionEngineOutput}.
 */
export function fromHadeDecision(
  decision: HadeDecisionLike,
  options: BuildOutputOptions = {},
): DecisionEngineOutput {
  return buildDecisionEngineOutput(decision, options);
}

/**
 * Maps a decide API-shaped response to {@link DecisionEngineOutput}.
 */
export function fromDecideResponse(
  response: DecideResponseLike,
  options: BuildOutputOptions = {},
): DecisionEngineOutput {
  const engineSource = normalizeDecisionSource(
    options.source ?? response.source,
    response.decision.source,
    response.decision.is_fallback === true,
  );

  const merged: BuildOutputOptions = {
    ...options,
    source: engineSource,
    analytics: {
      candidates_considered:
        options.analytics?.candidates_considered ??
        response.context_snapshot?.candidates_evaluated ??
        0,
      ...options.analytics,
    },
    ux_state: response.ux?.ui_state
      ? uxStateFromUiTier(response.ux.ui_state, options.ux_state)
      : options.ux_state,
  };

  if (
    response.decision.is_fallback === true &&
    !merged.fallback_meta &&
    engineSource === "offline_cache"
  ) {
    merged.fallback_meta = {
      reason: "offline_cache",
      degraded_fields: [],
      user_visible: true,
    };
  }

  return buildDecisionEngineOutput(response.decision, merged);
}

/**
 * Assembles the headless output contract from a decision-shaped record.
 */
export function buildDecisionEngineOutput(
  decision: HadeDecisionLike,
  options: BuildOutputOptions = {},
): DecisionEngineOutput {
  const now = options.generated_at_ms ?? Date.now();
  const requestId = options.request_id ?? `req_${now}`;
  const locale = options.locale ?? DEFAULT_LOCALE;
  const threshold = options.confidence_threshold ?? 0;
  const confidence = options.confidence ?? DEFAULT_HADE_CONFIG.confidence;

  const source = normalizeDecisionSource(
    options.source,
    decision.source,
    decision.is_fallback === true,
  );

  const band = confidenceBand(decision.confidence, threshold, confidence);
  const labelId = confidenceLabelId(decision.confidence_label, decision.confidence, confidence);
  const ux = resolveUxState(band, options.ux_state);

  const primaryAction = buildPrimaryAction(decision);
  const secondaryActions = buildSecondaryActions(ux.next_action);

  const copyKeys = buildCopyTokens(decision, labelId, ux, locale, options.copy_keys);

  const showSlots = buildShowSlots(decision);

  return {
    output_version: DECISION_ENGINE_OUTPUT_VERSION,
    request_id: requestId,
    generated_at_ms: now,
    source,
    is_fallback: decision.is_fallback === true || isFallbackSource(source),

    decision: {
      id: decision.id,
      venue_name: decision.venue_name,
      category: decision.category,
      geo: { lat: decision.geo.lat, lng: decision.geo.lng },
      distance_meters: decision.distance_meters,
      eta_minutes: decision.eta_minutes,
      ...(decision.neighborhood ? { neighborhood: decision.neighborhood } : {}),
      ...(decision.address ? { address: decision.address } : {}),
    },

    confidence: {
      score: clamp01(decision.confidence),
      label_id: labelId,
      band,
    },

    rationale: {
      primary_id: "reason.primary",
      primary_text: decision.rationale,
      secondary_id: "reason.why_now",
      secondary_text: decision.why_now,
      cited_signals: options.cited_signals ?? [],
    },

    action_tokens: {
      primary: primaryAction,
      secondary: secondaryActions,
    },

    layout_tokens: {
      surface: "hero_card",
      density: "comfortable",
      show_slots: showSlots,
    },

    copy_tokens: {
      locale,
      keys: copyKeys,
    },

    theme_tokens: {
      palette_ref: options.palette_ref ?? "default",
      semantic: themeSemanticForBand(band),
    },

    ux_state: ux,

    ...(options.fallback_meta ? { fallback_meta: options.fallback_meta } : {}),

    analytics: {
      candidates_considered: 0,
      candidates_scored: 0,
      timings_ms: { total: 0 },
      ...options.analytics,
      engine_tier: source,
      config_hash:
        options.config_hash ?? options.analytics?.config_hash ?? DEFAULT_CONFIG_HASH,
    },

    ...(options.debug ? { debug: options.debug } : {}),
  };
}

// ─── Source normalization ───────────────────────────────────────────────────

export function normalizeDecisionSource(
  engineSource?: DecisionSource | string | null,
  decisionSource?: string | null,
  isFallback?: boolean,
): DecisionSource {
  const raw = (engineSource ?? "").trim().toLowerCase();
  if (raw === "llm") return "llm";
  if (raw === "synthetic") return "synthetic";
  if (raw === "cold_start_synthetic") return "cold_start_synthetic";
  if (raw === "offline_cache" || raw === "offline") return "offline_cache";
  if (
    raw === "static_fallback" ||
    raw === "cold_start_fallback" ||
    raw === "fallback" ||
    raw.startsWith("static_synthetic")
  ) {
    return "static_fallback";
  }

  const decisionRaw = (decisionSource ?? "").trim().toLowerCase();
  if (decisionRaw === "offline_cache") return "offline_cache";
  if (decisionRaw === "static_fallback" || decisionRaw.includes("static_synthetic")) {
    return "static_fallback";
  }
  if (decisionRaw === "cold_start_synthetic") return "cold_start_synthetic";
  if (decisionRaw === "synthetic") return "synthetic";
  if (decisionRaw === "llm") return "llm";

  if (isFallback === true) return "static_fallback";
  return "synthetic";
}

function isFallbackSource(source: DecisionSource): boolean {
  return source === "static_fallback" || source === "offline_cache";
}

// ─── Confidence & UX (mirrors hooks `_deriveUX` + demo CTA routing) ───────────

export function confidenceBand(
  score: number,
  confidenceThreshold = 0,
  config: ResolvedHadeConfig["confidence"] = DEFAULT_HADE_CONFIG.confidence,
): ConfidenceBand {
  const highBar =
    config.bands.high + confidenceThreshold * config.bands.threshold_high_multiplier;
  const medBar =
    config.bands.medium + confidenceThreshold * config.bands.threshold_medium_multiplier;
  const c = clamp01(score);
  if (c >= highBar) return "high";
  if (c >= medBar) return "medium";
  return "low";
}

export function confidenceLabelId(
  confidenceLabel: string,
  score: number,
  config: ResolvedHadeConfig["confidence"] = DEFAULT_HADE_CONFIG.confidence,
): string {
  const mapped = CONFIDENCE_LABEL_TO_ID[confidenceLabel.trim()];
  if (mapped) return mapped;
  const c = clamp01(score);
  if (c >= config.labels.strong_pick) return "strong_pick";
  if (c >= config.labels.good_fit) return "good_fit";
  return "exploratory";
}

function resolveUxState(
  band: ConfidenceBand,
  override?: Partial<DecisionEngineOutput["ux_state"]>,
): DecisionEngineOutput["ux_state"] {
  const derived = uxStateFromBand(band);
  if (!override) return derived;
  return {
    next_action: override.next_action ?? derived.next_action,
    suggested_sheet:
      override.suggested_sheet !== undefined
        ? override.suggested_sheet
        : derived.suggested_sheet,
    escalation_path: override.escalation_path ?? derived.escalation_path,
  };
}

function uxStateFromBand(band: ConfidenceBand): DecisionEngineOutput["ux_state"] {
  if (band === "high") {
    return {
      next_action: "commit",
      suggested_sheet: null,
      escalation_path: [...DEFAULT_ESCALATION],
    };
  }
  if (band === "medium") {
    return {
      next_action: "expand_radius",
      suggested_sheet: null,
      escalation_path: ["expand_radius", "refine", "switch_mode"],
    };
  }
  return {
    next_action: "refine",
    suggested_sheet: "refine",
    escalation_path: ["refine", "expand_radius", "switch_mode"],
  };
}

function uxStateFromUiTier(
  uiState: "high" | "medium" | "low",
  override?: Partial<DecisionEngineOutput["ux_state"]>,
): Partial<DecisionEngineOutput["ux_state"]> {
  const band: ConfidenceBand = uiState;
  return { ...uxStateFromBand(band), ...override };
}

// ─── Actions, layout, copy, theme ───────────────────────────────────────────

function buildPrimaryAction(decision: HadeDecisionLike): ActionToken {
  return {
    kind: "navigate",
    payload: {
      lat: decision.geo.lat,
      lng: decision.geo.lng,
      mode: "walking",
      venue_id: decision.id,
    },
    label_id: "action.take_me_there",
  };
}

function buildSecondaryActions(nextAction: UxNextAction): ActionToken[] {
  const secondary: ActionToken[] = [
    {
      kind: "open_sheet",
      payload: { sheet: "refine" },
      label_id: "action.refine",
    },
    {
      kind: "open_sheet",
      payload: { sheet: "alternatives" },
      label_id: "action.show_alts",
    },
  ];

  if (nextAction === "expand_radius") {
    return [
      {
        kind: "custom",
        payload: { action: "expand_radius", factor: 1.5 },
        label_id: "action.explore_nearby",
      },
      ...secondary,
    ];
  }

  return secondary;
}

function buildShowSlots(decision: HadeDecisionLike): DecisionEngineOutput["layout_tokens"]["show_slots"] {
  const slots: DecisionEngineOutput["layout_tokens"]["show_slots"] = [
    "badge",
    "support_text",
    "trust_attribution",
  ];
  if (decision.commitment != null) {
    slots.push("commitment_preview");
  }
  return slots;
}

function buildCopyTokens(
  decision: HadeDecisionLike,
  labelId: string,
  ux: DecisionEngineOutput["ux_state"],
  locale: string,
  extra?: Record<string, string>,
): Record<string, string> {
  void locale;

  // Layer 1: BUILTIN floor + special slots that resolve to a per-decision value
  // when not overridden. These survive byte-identically when `extra` is empty,
  // preserving the legacy /demo render.
  const keys: Record<string, string> = {
    ...BUILTIN_COPY_KEYS,
    [`label.${labelId}`]: BUILTIN_COPY_KEYS[`label.${labelId}`] ?? decision.confidence_label,
    "eyebrow.your_move": BUILTIN_COPY_KEYS["eyebrow.your_move"] ?? "Your move",
  };

  if (ux.next_action === "commit") {
    keys["action.primary_cta"] = BUILTIN_COPY_KEYS["action.go_now"] ?? "Go now";
  } else if (ux.next_action === "expand_radius") {
    keys["action.primary_cta"] = BUILTIN_COPY_KEYS["action.explore_nearby"] ?? "Explore nearby";
  } else {
    keys["action.primary_cta"] = BUILTIN_COPY_KEYS["action.help_refine"] ?? "Help me refine";
  }

  // Layer 2 (Phase G): override layer wins over BUILTIN + special slots.
  // Lets `cfg.copy.overrides` and `domains[active].copy_overrides` retitle
  // `action.take_me_there`, `label.strong_pick`, `eyebrow.your_move`, etc.
  // Empty/undefined `extra` is a no-op → byte-identical legacy behavior.
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      keys[key] = value;
    }
  }

  // Layer 3: decision-derived `reason.*` ALWAYS reflects the live decision
  // text. Static copy overrides MUST NOT replace the actual rationale —
  // these slots are derived, not configurable.
  keys["reason.primary"] = decision.rationale;
  keys["reason.why_now"] = decision.why_now;
  keys["reason.why_this"] = decision.why_this;
  keys["reason.decision_frame"] = decision.decision_frame;

  return keys;
}

function themeSemanticForBand(
  band: ConfidenceBand,
): DecisionEngineOutput["theme_tokens"]["semantic"] {
  const confidenceColorId =
    band === "high"
      ? "color.signal.strong"
      : band === "medium"
        ? "color.signal.moderate"
        : "color.signal.weak";

  return {
    confidence_color_id: confidenceColorId,
    surface_color_id: "color.surface.elevated",
    accent_color_id: "color.brand.accent",
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
