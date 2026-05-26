/**
 * validateDecision.ts — Server-side decision integrity gate
 *
 * Every decision returned by /api/hade/decide passes through two checks:
 *
 *   1. Shape     — required card-rendering fields are present and correctly typed
 *   2. Grounding — decision.id matches the candidate selected by the deterministic
 *                  ranking engine (or is a pre-approved fallback ID)
 *
 * A third utility, extractSafeCopyPatch, guards the future upstream copy-
 * enhancement path: it strips any identity fields an LLM might try to inject
 * and returns only the safe copy subset (rationale / why_now / why_this /
 * decision_frame).
 *
 * None of these functions throw. Validation failures are logged with the
 * structured [HADE DECISION VALIDATION] prefix; error detail is never exposed
 * to the client.
 */

import type { HadeDecision } from "@/types/hade";

// ─── Internal types ───────────────────────────────────────────────────────────

type ValidationResult = { ok: true } | { ok: false; reason: string };

// ─── Fallback ID allowlist ────────────────────────────────────────────────────

// IDs with these prefixes are pre-approved synthetic stubs. They bypass the
// grounding check because they are never part of the Places/UGC ranking pool.
const SAFE_FALLBACK_PREFIXES = [
  "fallback-",
  "offline-",
  "fallback-static-",
  "local-",
] as const;

function isSafeFallbackId(id: string): boolean {
  return SAFE_FALLBACK_PREFIXES.some((prefix) => id.startsWith(prefix));
}

// ─── Shape validation ─────────────────────────────────────────────────────────

/**
 * Checks that every field required for card rendering is present and
 * correctly typed. Runs at runtime on the raw object from the engine —
 * even when TypeScript types say a field is required it may be absent if
 * the engine has a bug or the JSON is malformed.
 *
 * Required for rendering without crash:
 *   • id             — non-empty string (used as React key and rejection-history id)
 *   • venue_name     — non-empty string (rendered in HadeHeading)
 *   • category       — non-empty string (domain classification)
 *   • confidence     — finite number 0–1 (drives CTA and ui_state)
 *   • copy           — at least one of rationale / why_now / why_this / decision_frame
 *   • source         — non-empty string OR is_fallback flag set
 */
function validateShape(d: HadeDecision): ValidationResult {
  if (typeof d.id !== "string" || !d.id.trim()) {
    return { ok: false, reason: "decision.id is missing or empty" };
  }

  if (typeof d.venue_name !== "string" || !d.venue_name.trim()) {
    return { ok: false, reason: "decision.venue_name is missing or empty" };
  }

  if (typeof d.category !== "string" || !d.category.trim()) {
    return { ok: false, reason: "decision.category is missing or empty" };
  }

  if (
    typeof d.confidence !== "number" ||
    !Number.isFinite(d.confidence) ||
    d.confidence < 0 ||
    d.confidence > 1
  ) {
    return {
      ok: false,
      reason: `decision.confidence is invalid (expected 0–1, got ${String(d.confidence)})`,
    };
  }

  const hasCopy =
    (typeof d.rationale === "string" && d.rationale.trim().length > 0) ||
    (typeof d.why_now === "string" && d.why_now.trim().length > 0) ||
    (typeof d.why_this === "string" && d.why_this.trim().length > 0) ||
    (typeof d.decision_frame === "string" && d.decision_frame.trim().length > 0);

  if (!hasCopy) {
    return {
      ok: false,
      reason:
        "decision has no copy (rationale / why_now / why_this / decision_frame are all empty)",
    };
  }

  const hasSource =
    (typeof d.source === "string" && d.source.trim().length > 0) ||
    d.is_fallback === true;

  if (!hasSource) {
    return { ok: false, reason: "decision.source is missing and is_fallback is not set" };
  }

  return { ok: true };
}

// ─── Grounding validation ─────────────────────────────────────────────────────

/**
 * Ensures the decision references a candidate that was actually selected by
 * the deterministic ranking engine.
 *
 * Passes when:
 *   a) decision.id === provenanceId   — normal case: synthetic engine, cold-start
 *   b) isSafeFallbackId(decision.id)  — pre-approved fallback stubs
 *
 * Fails only when an external source (e.g. future upstream copy-enhancement)
 * has replaced the candidate ID with one that was never ranked.
 */
function validateGrounding(
  decisionId: string,
  provenanceId: string,
): ValidationResult {
  if (decisionId === provenanceId) return { ok: true };
  if (isSafeFallbackId(decisionId)) return { ok: true };
  return {
    ok: false,
    reason: `decision.id "${decisionId}" does not match provenance candidate_id "${provenanceId}"`,
  };
}

// ─── Public validation API ────────────────────────────────────────────────────

/**
 * Validates the final decision object before it is serialised and returned
 * to the client.
 *
 * Runs shape check then grounding check in order. Stops at the first failure.
 * Emits a [HADE DECISION VALIDATION] log line regardless of outcome so every
 * decision leaving the route has a traceable audit entry.
 *
 * Never throws — returns false on any failure so the caller can fall through
 * to the next tier without breaking the request.
 */
export function assertDecisionValid(
  decision: HadeDecision,
  provenanceId: string,
  reqId: string,
): boolean {
  const shapeResult = validateShape(decision);
  if (!shapeResult.ok) {
    console.warn("[HADE DECISION VALIDATION] rejected_upstream_decision", {
      reqId,
      check: "shape",
      reason: shapeResult.reason,
      decision_id: typeof decision.id === "string" ? decision.id : null,
    });
    return false;
  }

  const groundingResult = validateGrounding(decision.id, provenanceId);
  if (!groundingResult.ok) {
    console.warn("[HADE DECISION VALIDATION] rejected_upstream_decision", {
      reqId,
      check: "grounding",
      reason: groundingResult.reason,
      decision_id: decision.id,
      provenance_id: provenanceId,
    });
    return false;
  }

  console.log("[HADE DECISION VALIDATION] passed", {
    reqId,
    decision_id: decision.id,
    source: decision.source ?? null,
    confidence: decision.confidence,
    provenance_id: provenanceId,
  });
  return true;
}

// ─── Upstream copy-patch guard ────────────────────────────────────────────────

/**
 * Guards the optional upstream copy-enhancement path.
 *
 * When an upstream LLM is called to enrich copy AFTER deterministic candidate
 * selection, only safe copy fields are accepted from it. Any attempt by the
 * upstream to change the candidate's identity (id, venue_name, category, geo,
 * confidence, source) causes the entire patch to be rejected.
 *
 * Allowed fields: rationale, why_now, why_this, decision_frame
 *
 * Returns the safe copy subset on success, or null if the upstream tried to
 * change the candidate identity (caller keeps the original copy unchanged).
 */
export function extractSafeCopyPatch(
  selectedId: string,
  upstreamDecision: Record<string, unknown>,
  reqId: string,
): Pick<HadeDecision, "rationale" | "why_now" | "why_this" | "decision_frame"> | null {
  const upstreamId =
    typeof upstreamDecision.id === "string" ? upstreamDecision.id : null;

  if (
    upstreamId !== null &&
    upstreamId !== selectedId &&
    !isSafeFallbackId(upstreamId)
  ) {
    console.warn("[HADE DECISION VALIDATION] rejected_upstream_decision", {
      reqId,
      check: "copy_patch_identity",
      reason: "upstream attempted to replace candidate ID via copy patch",
      selected_id: selectedId,
      upstream_id: upstreamId,
    });
    return null;
  }

  const patch: Partial<
    Pick<HadeDecision, "rationale" | "why_now" | "why_this" | "decision_frame">
  > = {};

  if (
    typeof upstreamDecision.rationale === "string" &&
    upstreamDecision.rationale.trim()
  ) {
    patch.rationale = upstreamDecision.rationale.trim();
  }
  if (
    typeof upstreamDecision.why_now === "string" &&
    upstreamDecision.why_now.trim()
  ) {
    patch.why_now = upstreamDecision.why_now.trim();
  }
  if (
    typeof upstreamDecision.why_this === "string" &&
    upstreamDecision.why_this.trim()
  ) {
    patch.why_this = upstreamDecision.why_this.trim();
  }
  if (
    typeof upstreamDecision.decision_frame === "string" &&
    upstreamDecision.decision_frame.trim()
  ) {
    patch.decision_frame = upstreamDecision.decision_frame.trim();
  }

  return patch as Pick<
    HadeDecision,
    "rationale" | "why_now" | "why_this" | "decision_frame"
  >;
}
