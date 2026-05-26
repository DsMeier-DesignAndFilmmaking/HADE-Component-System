'use strict';

// src/types/DecisionEngineOutput.ts
var DECISION_ENGINE_OUTPUT_VERSION = "1.0";
var DEFAULT_HADE_CONFIG = {
  defaults: {
    locale: "en-US"},
  confidence: {
    bands: {
      high: 0.7,
      medium: 0.4,
      threshold_high_multiplier: 0.5,
      threshold_medium_multiplier: 0.3
    },
    labels: {
      strong_pick: 0.65,
      good_fit: 0.4
    },
    node: {
      default_score: 0.5,
      min_score: 0.3,
      max_score: 0.95,
      signal_count_full_strength: 10,
      signal_strength_min: 0.3,
      signal_strength_max: 1,
      agreement_min: 0.4,
      agreement_max: 1,
      trust_score: 1,
      recency_default_score: 0.5,
      recency_fresh_ms: 2 * 60 * 60 * 1e3,
      recency_recent_ms: 6 * 60 * 60 * 1e3,
      recency_day_ms: 24 * 60 * 60 * 1e3,
      recency_fresh_score: 1,
      recency_recent_score: 0.85,
      recency_day_score: 0.7,
      recency_stale_score: 0.5
    },
    synthetic: {
      default_score: 0.5,
      min_score: 0.3,
      max_score: 0.95,
      base_score: 0.3,
      score_weight: 0.65
    }
  }};

// src/engine/buildOutput.ts
var DEFAULT_LOCALE = DEFAULT_HADE_CONFIG.defaults.locale;
var DEFAULT_CONFIG_HASH2 = "sha256:unconfigured";
var DEFAULT_ESCALATION = ["refine", "expand_radius", "switch_mode"];
var BUILTIN_COPY_KEYS = {
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
  "reason.decision_frame": "Decision frame"
};
var CONFIDENCE_LABEL_TO_ID = {
  "Strong pick": "strong_pick",
  "Good fit": "good_fit",
  Exploratory: "exploratory"
};
function fromHadeDecision(decision, options = {}) {
  return buildDecisionEngineOutput(decision, options);
}
function fromDecideResponse(response, options = {}) {
  const engineSource = normalizeDecisionSource(
    options.source ?? response.source,
    response.decision.source,
    response.decision.is_fallback === true
  );
  const merged = {
    ...options,
    source: engineSource,
    analytics: {
      candidates_considered: options.analytics?.candidates_considered ?? response.context_snapshot?.candidates_evaluated ?? 0,
      ...options.analytics
    },
    ux_state: response.ux?.ui_state ? uxStateFromUiTier(response.ux.ui_state, options.ux_state) : options.ux_state
  };
  if (response.decision.is_fallback === true && !merged.fallback_meta && engineSource === "offline_cache") {
    merged.fallback_meta = {
      reason: "offline_cache",
      degraded_fields: [],
      user_visible: true
    };
  }
  return buildDecisionEngineOutput(response.decision, merged);
}
function buildDecisionEngineOutput(decision, options = {}) {
  const now = options.generated_at_ms ?? Date.now();
  const requestId = options.request_id ?? `req_${now}`;
  const locale = options.locale ?? DEFAULT_LOCALE;
  const threshold = options.confidence_threshold ?? 0;
  const confidence = options.confidence ?? DEFAULT_HADE_CONFIG.confidence;
  const source = normalizeDecisionSource(
    options.source,
    decision.source,
    decision.is_fallback === true
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
      ...decision.neighborhood ? { neighborhood: decision.neighborhood } : {},
      ...decision.address ? { address: decision.address } : {}
    },
    confidence: {
      score: clamp01(decision.confidence),
      label_id: labelId,
      band
    },
    rationale: {
      primary_id: "reason.primary",
      primary_text: decision.rationale,
      secondary_id: "reason.why_now",
      secondary_text: decision.why_now,
      cited_signals: options.cited_signals ?? []
    },
    action_tokens: {
      primary: primaryAction,
      secondary: secondaryActions
    },
    layout_tokens: {
      surface: "hero_card",
      density: "comfortable",
      show_slots: showSlots
    },
    copy_tokens: {
      locale,
      keys: copyKeys
    },
    theme_tokens: {
      palette_ref: options.palette_ref ?? "default",
      semantic: themeSemanticForBand(band)
    },
    ux_state: ux,
    ...options.fallback_meta ? { fallback_meta: options.fallback_meta } : {},
    analytics: {
      candidates_considered: 0,
      candidates_scored: 0,
      timings_ms: { total: 0 },
      ...options.analytics,
      engine_tier: source,
      config_hash: options.config_hash ?? options.analytics?.config_hash ?? DEFAULT_CONFIG_HASH2
    },
    ...options.debug ? { debug: options.debug } : {}
  };
}
function normalizeDecisionSource(engineSource, decisionSource, isFallback) {
  const raw = (engineSource ?? "").trim().toLowerCase();
  if (raw === "llm") return "llm";
  if (raw === "synthetic") return "synthetic";
  if (raw === "cold_start_synthetic") return "cold_start_synthetic";
  if (raw === "offline_cache" || raw === "offline") return "offline_cache";
  if (raw === "static_fallback" || raw === "cold_start_fallback" || raw === "fallback" || raw.startsWith("static_synthetic")) {
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
function isFallbackSource(source) {
  return source === "static_fallback" || source === "offline_cache";
}
function confidenceBand(score, confidenceThreshold = 0, config = DEFAULT_HADE_CONFIG.confidence) {
  const highBar = config.bands.high + confidenceThreshold * config.bands.threshold_high_multiplier;
  const medBar = config.bands.medium + confidenceThreshold * config.bands.threshold_medium_multiplier;
  const c = clamp01(score);
  if (c >= highBar) return "high";
  if (c >= medBar) return "medium";
  return "low";
}
function confidenceLabelId(confidenceLabel, score, config = DEFAULT_HADE_CONFIG.confidence) {
  const mapped = CONFIDENCE_LABEL_TO_ID[confidenceLabel.trim()];
  if (mapped) return mapped;
  const c = clamp01(score);
  if (c >= config.labels.strong_pick) return "strong_pick";
  if (c >= config.labels.good_fit) return "good_fit";
  return "exploratory";
}
function resolveUxState(band, override) {
  const derived = uxStateFromBand(band);
  if (!override) return derived;
  return {
    next_action: override.next_action ?? derived.next_action,
    suggested_sheet: override.suggested_sheet !== void 0 ? override.suggested_sheet : derived.suggested_sheet,
    escalation_path: override.escalation_path ?? derived.escalation_path
  };
}
function uxStateFromBand(band) {
  if (band === "high") {
    return {
      next_action: "commit",
      suggested_sheet: null,
      escalation_path: [...DEFAULT_ESCALATION]
    };
  }
  if (band === "medium") {
    return {
      next_action: "expand_radius",
      suggested_sheet: null,
      escalation_path: ["expand_radius", "refine", "switch_mode"]
    };
  }
  return {
    next_action: "refine",
    suggested_sheet: "refine",
    escalation_path: ["refine", "expand_radius", "switch_mode"]
  };
}
function uxStateFromUiTier(uiState, override) {
  const band = uiState;
  return { ...uxStateFromBand(band), ...override };
}
function buildPrimaryAction(decision) {
  return {
    kind: "navigate",
    payload: {
      lat: decision.geo.lat,
      lng: decision.geo.lng,
      mode: "walking",
      venue_id: decision.id
    },
    label_id: "action.take_me_there"
  };
}
function buildSecondaryActions(nextAction) {
  const secondary = [
    {
      kind: "open_sheet",
      payload: { sheet: "refine" },
      label_id: "action.refine"
    },
    {
      kind: "open_sheet",
      payload: { sheet: "alternatives" },
      label_id: "action.show_alts"
    }
  ];
  if (nextAction === "expand_radius") {
    return [
      {
        kind: "custom",
        payload: { action: "expand_radius", factor: 1.5 },
        label_id: "action.explore_nearby"
      },
      ...secondary
    ];
  }
  return secondary;
}
function buildShowSlots(decision) {
  const slots = [
    "badge",
    "support_text",
    "trust_attribution"
  ];
  if (decision.commitment != null) {
    slots.push("commitment_preview");
  }
  return slots;
}
function buildCopyTokens(decision, labelId, ux, locale, extra) {
  const keys = {
    ...BUILTIN_COPY_KEYS,
    [`label.${labelId}`]: BUILTIN_COPY_KEYS[`label.${labelId}`] ?? decision.confidence_label,
    "eyebrow.your_move": BUILTIN_COPY_KEYS["eyebrow.your_move"]
  };
  if (ux.next_action === "commit") {
    keys["action.primary_cta"] = BUILTIN_COPY_KEYS["action.go_now"];
  } else if (ux.next_action === "expand_radius") {
    keys["action.primary_cta"] = BUILTIN_COPY_KEYS["action.explore_nearby"];
  } else {
    keys["action.primary_cta"] = BUILTIN_COPY_KEYS["action.help_refine"];
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      keys[key] = value;
    }
  }
  keys["reason.primary"] = decision.rationale;
  keys["reason.why_now"] = decision.why_now;
  keys["reason.why_this"] = decision.why_this;
  keys["reason.decision_frame"] = decision.decision_frame;
  return keys;
}
function themeSemanticForBand(band) {
  const confidenceColorId = band === "high" ? "color.signal.strong" : band === "medium" ? "color.signal.moderate" : "color.signal.weak";
  return {
    confidence_color_id: confidenceColorId,
    surface_color_id: "color.surface.elevated",
    accent_color_id: "color.brand.accent"
  };
}
function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

exports.buildDecisionEngineOutput = buildDecisionEngineOutput;
exports.confidenceBand = confidenceBand;
exports.confidenceLabelId = confidenceLabelId;
exports.fromDecideResponse = fromDecideResponse;
exports.fromHadeDecision = fromHadeDecision;
exports.normalizeDecisionSource = normalizeDecisionSource;
//# sourceMappingURL=buildOutput.cjs.map
//# sourceMappingURL=buildOutput.cjs.map