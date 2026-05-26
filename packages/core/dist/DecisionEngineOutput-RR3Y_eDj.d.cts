/**
 * Headless, framework-agnostic decision payload (SDK audit § DecisionEngineOutput).
 * Data, semantic tokens, and UX hints only — no HTML/CSS.
 */
declare const DECISION_ENGINE_OUTPUT_VERSION: "1.0";
type DecisionEngineOutputVersion = typeof DECISION_ENGINE_OUTPUT_VERSION;
/** Engine tier that produced the decision (replaces incomplete DecideResponse.source unions). */
type DecisionSource = "llm" | "synthetic" | "static_fallback" | "cold_start_synthetic" | "offline_cache";
type ConfidenceBand = "low" | "medium" | "high";
type UxNextAction = "commit" | "refine" | "expand_radius" | "compare_modes" | "show_alternatives";
type UxSuggestedSheet = "refine" | "vibe" | "commitment" | "micro_adventure" | null;
type UxEscalationStep = "refine" | "expand_radius" | "switch_mode";
type LayoutSurface = "hero_card" | "list_row" | "map_pin" | "compact_pill";
type LayoutDensity = "comfortable" | "compact";
type LayoutSlot = "badge" | "support_text" | "trust_attribution" | "commitment_preview";
type ActionKind = "navigate" | "open_sheet" | "call" | "custom";
interface ActionToken {
    kind: ActionKind | string;
    payload: Record<string, unknown>;
    label_id: string;
}
interface DecisionEngineOutput {
    output_version: DecisionEngineOutputVersion;
    request_id: string;
    generated_at_ms: number;
    source: DecisionSource;
    is_fallback: boolean;
    decision: {
        id: string;
        venue_name: string;
        category: string;
        geo: {
            lat: number;
            lng: number;
        };
        distance_meters: number;
        eta_minutes: number;
        neighborhood?: string;
        address?: string;
    };
    confidence: {
        score: number;
        label_id: string;
        band: ConfidenceBand;
    };
    rationale: {
        primary_id?: string;
        primary_text?: string;
        secondary_id?: string;
        secondary_text?: string;
        cited_signals: Array<{
            signal_id: string;
            weight: number;
        }>;
    };
    action_tokens: {
        primary: ActionToken;
        secondary: ActionToken[];
    };
    layout_tokens: {
        surface: LayoutSurface;
        density: LayoutDensity;
        show_slots: LayoutSlot[];
    };
    copy_tokens: {
        locale: string;
        keys: Record<string, string>;
    };
    theme_tokens: {
        palette_ref: string;
        semantic: {
            confidence_color_id: string;
            surface_color_id: string;
            accent_color_id: string;
        };
    };
    ux_state: {
        next_action: UxNextAction;
        suggested_sheet?: UxSuggestedSheet;
        escalation_path: UxEscalationStep[];
    };
    fallback_meta?: {
        reason: "no_signal" | "places_timeout" | "llm_failed" | "offline_cache";
        degraded_fields: string[];
        user_visible: boolean;
    };
    analytics: {
        candidates_considered: number;
        candidates_scored: number;
        engine_tier: DecisionSource;
        timings_ms: {
            upstream?: number;
            scoring?: number;
            copy?: number;
            total: number;
        };
        config_hash: string;
    };
    debug?: {
        config_snapshot_ref?: string;
        prompt_id?: string;
        request_echo?: unknown;
    };
}

export { type ActionKind as A, type ConfidenceBand as C, DECISION_ENGINE_OUTPUT_VERSION as D, type LayoutDensity as L, type UxEscalationStep as U, type ActionToken as a, type DecisionEngineOutput as b, type DecisionEngineOutputVersion as c, type DecisionSource as d, type LayoutSlot as e, type LayoutSurface as f, type UxNextAction as g, type UxSuggestedSheet as h };
