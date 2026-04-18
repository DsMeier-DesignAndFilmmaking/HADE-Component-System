"use client";

import { motion } from "framer-motion";
import type { HadeResponse, UiState } from "@/types/hade";
import { HadeCard } from "@/components/hade/layout/HadeCard";
import { HadeButton } from "@/components/hade/buttons/HadeButton";
import { HadeHeading } from "@/components/hade/typography/HadeHeading";
import { HadeText } from "@/components/hade/typography/HadeText";

interface DecisionCardProps {
  response: HadeResponse;
  agentId?: string;
  onCta?: () => void;
  onPivot?: (reason: string) => void;
  className?: string;
}

const glowByState: Record<UiState, boolean | "blue" | "lime"> = {
  high: "blue",
  medium: false,
  low: false,
};

export function DecisionCard({
  response,
  agentId,
  onCta,
  onPivot,
  className = "",
}: DecisionCardProps) {
  if (!response?.decision) return null;

  const { decision, context_snapshot } = response;
  const fallbackState: UiState =
    decision.confidence >= 0.7 ? "high" : decision.confidence >= 0.4 ? "medium" : "low";
  const state: UiState = response.ux?.ui_state ?? fallbackState;
  const ctaLabel =
    typeof response.ux?.cta === "string" && response.ux.cta.trim().length > 0
      ? response.ux.cta
      : state === "low"
      ? "Refine decision"
      : state === "medium"
      ? "Expand search"
      : "Go now";
  const badges = Array.isArray(response.ux?.badges) ? response.ux.badges : [];
  const isFallback = context_snapshot.decision_basis === "fallback";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={className}
    >
      <HadeCard glow={glowByState[state]}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-accent mb-1">
              {agentId ? `${agentId} · ` : ""}
              {isFallback ? "Best Match" : "AI Decision"}
            </p>
            <HadeHeading level={3}>{decision.venue_name}</HadeHeading>
            <HadeText variant="caption" color="muted">
              {decision.category}
              {decision.neighborhood ? ` · ${decision.neighborhood}` : ""}
              {` · ${decision.eta_minutes}m away`}
            </HadeText>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="rounded-lg bg-accentSoft px-3 py-1.5 font-mono text-xs font-bold text-accent">
              {Math.round(decision.confidence * 100)}% confidence
            </span>
            <span
              className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider font-semibold ${
                state === "high"
                  ? "bg-green-500/10 text-green-400"
                  : state === "medium"
                  ? "bg-yellow-500/10 text-yellow-400"
                  : "bg-ink/10 text-ink/40"
              }`}
            >
              {state}
            </span>
          </div>
        </div>

        {/* ── Rationale ──────────────────────────────────────────────────────── */}
        <HadeText variant="body" color="ink" className="italic">
          &quot;{decision.rationale}&quot;
        </HadeText>

        {/* ── Why Now — MEDIUM + LOW only ────────────────────────────────────── */}
        {state !== "high" && decision.why_now && (
          <HadeText variant="caption" color="muted" className="mt-2">
            {decision.why_now}
          </HadeText>
        )}

        {/* ── Badges ─────────────────────────────────────────────────────────── */}
        {badges.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink/60"
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        {/* ── Low state: refinement prompt ───────────────────────────────────── */}
        {state === "low" && (
          <div className="mt-4 rounded-xl border border-dashed border-line p-3 text-center">
            <p className="text-xs text-ink/40">
              Low confidence — refine your signals for a sharper match.
            </p>
            {onPivot && (
              <button
                className="mt-2 text-xs text-accent underline underline-offset-2 hover:text-accent/80 transition-colors"
                onClick={() => onPivot("low_confidence")}
              >
                Try another option
              </button>
            )}
          </div>
        )}

        {/* ── Footer: CTA + system metadata ──────────────────────────────────── */}
        <div className="mt-4 pt-3 border-t border-line flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 font-mono text-[10px] text-ink/30">
            <span className={isFallback ? "text-yellow-400/60" : "text-green-400/60"}>
              ● {context_snapshot.decision_basis}
            </span>
            {context_snapshot.llm_failure_reason && (
              <span className="text-red-400/60">{context_snapshot.llm_failure_reason}</span>
            )}
            <span>{context_snapshot.candidates_evaluated} candidates</span>
          </div>
          <HadeButton
            variant={state === "low" ? "primary" : "secondary"}
            size="sm"
            onClick={onCta}
          >
            {ctaLabel}
          </HadeButton>
        </div>

        {/* ── Situation summary ───────────────────────────────────────────────── */}
        {decision.situation_summary && (
          <p className="mt-3 font-mono text-xs text-ink/30 border-t border-line pt-3">
            <span className="text-ink/20 mr-1">↳</span>
            {decision.situation_summary}
          </p>
        )}

      </HadeCard>
    </motion.div>
  );
}
