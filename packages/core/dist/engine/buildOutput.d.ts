import { d as DecisionSource, b as DecisionEngineOutput, C as ConfidenceBand } from '../DecisionEngineOutput-RR3Y_eDj.js';
import { ResolvedHadeConfig } from '../config/schema.js';

/** Minimal structural input matching {@link HadeDecision} without importing app types. */
interface HadeDecisionLike {
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
    ugc_meta?: {
        is_ugc: true;
    };
    commitment?: unknown;
}
/** Mirrors {@link DecideResponse} fields needed for output assembly. */
interface DecideResponseLike {
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
interface BuildOutputOptions {
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
    cited_signals?: Array<{
        signal_id: string;
        weight: number;
    }>;
    copy_keys?: Record<string, string>;
    debug?: DecisionEngineOutput["debug"];
}
/**
 * Maps a {@link HadeDecisionLike} (and optional decide metadata) to {@link DecisionEngineOutput}.
 */
declare function fromHadeDecision(decision: HadeDecisionLike, options?: BuildOutputOptions): DecisionEngineOutput;
/**
 * Maps a decide API-shaped response to {@link DecisionEngineOutput}.
 */
declare function fromDecideResponse(response: DecideResponseLike, options?: BuildOutputOptions): DecisionEngineOutput;
/**
 * Assembles the headless output contract from a decision-shaped record.
 */
declare function buildDecisionEngineOutput(decision: HadeDecisionLike, options?: BuildOutputOptions): DecisionEngineOutput;
declare function normalizeDecisionSource(engineSource?: DecisionSource | string | null, decisionSource?: string | null, isFallback?: boolean): DecisionSource;
declare function confidenceBand(score: number, confidenceThreshold?: number, config?: ResolvedHadeConfig["confidence"]): ConfidenceBand;
declare function confidenceLabelId(confidenceLabel: string, score: number, config?: ResolvedHadeConfig["confidence"]): string;

export { type BuildOutputOptions, type DecideResponseLike, type HadeDecisionLike, buildDecisionEngineOutput, confidenceBand, confidenceLabelId, fromDecideResponse, fromHadeDecision, normalizeDecisionSource };
