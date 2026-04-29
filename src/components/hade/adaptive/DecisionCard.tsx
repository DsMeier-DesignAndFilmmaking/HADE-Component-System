"use client";

import { motion } from "framer-motion";
import type { HadeResponse, LocationNode, UiState, VibeTag } from "@/types/hade";
import { HadeCard } from "@/components/hade/layout/HadeCard";
import { HadeButton } from "@/components/hade/buttons/HadeButton";
import { HadeHeading } from "@/components/hade/typography/HadeHeading";
import { HadeText } from "@/components/hade/typography/HadeText";

interface DecisionCardProps {
  response: HadeResponse;
  locationNode?: LocationNode;
  confidence?: number;
  explanation?: string[];
  agentId?: string;
  onCta?: () => void;
  onMaybe?: () => void;
  onPivot?: (reason: string) => void;
  className?: string;
}

const glowByState: Record<UiState, boolean | "blue" | "lime"> = {
  high: "blue",
  medium: false,
  low: false,
};

function formatVibeTag(tag: string): { label: string; icon: string } {
  switch (tag) {
    case "perfect_vibe":
    case "good_energy":
      return { label: "Good energy", icon: "🔥" };
    case "too_crowded":
      return { label: "Crowded", icon: "⚠️" };
    case "quiet":
      return { label: "Chill", icon: "😌" };
    case "dead":
      return { label: "Low energy", icon: "😐" };
    default:
      return { label: tag, icon: "•" };
  }
}

function deriveVibeChips(locationNode?: LocationNode): Array<{ key: string; label: string; icon: string }> {
  if (!locationNode) return [];
  if (locationNode.signal_count <= 1) return [];

  const updatedAt = new Date(locationNode.last_updated).getTime();
  if (!Number.isFinite(updatedAt)) return [];
  if (Date.now() - updatedAt >= 2 * 60 * 60 * 1000) return [];

  const entries = Object.entries(locationNode.weight_map) as Array<[VibeTag, number]>;
  if (entries.length === 0) return [];

  const positive = [...entries]
    .filter(([, weight]) => weight > 0.6)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  const negative = [...entries]
    .filter(([, weight]) => weight < 0.4)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 1);

  const selected = [...positive, ...negative].slice(0, 3);
  return selected.map(([tag]) => {
    const formatted = formatVibeTag(tag);
    return {
      key: tag,
      label: formatted.label,
      icon: formatted.icon,
    };
  });
}

function getConfidenceLabel(confidence: number) {
  if (confidence > 0.75) return "🔥 Strong pick";
  if (confidence > 0.55) return "👍 Solid option";
  return "🤔 Worth a try";
}

function getTimeLabel(start: number | undefined): string {
  const now = Date.now();
  if (typeof start !== "number" || start <= now) return "Happening now";

  const minutes = Math.max(1, Math.ceil((start - now) / 60_000));
  return `Starting in ${minutes} min`;
}

function getGoingLabel(count: number | undefined): string {
  const safeCount = count ?? 0;
  return safeCount === 1 ? "1 person going" : `${safeCount} people going`;
}

function isLive(start: number | undefined, end: number | undefined): boolean {
  const now = Date.now();
  const safeStart = start ?? now;
  const safeEnd = end ?? now;
  return safeStart <= now && now < safeEnd;
}

export function DecisionCard({
  response,
  locationNode,
  confidence,
  explanation,
  agentId,
  onCta,
  onMaybe,
  onPivot,
  className = "",
}: DecisionCardProps) {
  if (!response?.decision) return null;

  const { decision, context_snapshot } = response;
  const fallbackState: UiState =
    decision.confidence >= 0.7 ? "high" : decision.confidence >= 0.4 ? "medium" : "low";
  const state: UiState = response.ux?.ui_state ?? fallbackState;
  const badges = Array.isArray(response.ux?.badges) ? response.ux.badges : [];
  const isFallback = context_snapshot.decision_basis === "fallback";
  const vibeChips = deriveVibeChips(locationNode);
  const effectiveConfidence =
    typeof confidence === "number"
      ? confidence
      : typeof decision.confidence === "number"
      ? decision.confidence
      : undefined;
  const decisionExplanation = (decision as { explanation?: unknown }).explanation;
  const title = decision.title ?? decision.venue_name;
  const timeLabel = getTimeLabel(decision.time_window?.start);
  const goingLabel = getGoingLabel(decision.going_count);
  const live = isLive(decision.time_window?.start, decision.time_window?.end ?? decision.expires_at);
  const explanationChips = (
    Array.isArray(explanation) ? explanation : Array.isArray(decisionExplanation) ? decisionExplanation : []
  )
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 4);

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
            <div className="flex items-center gap-2">
              <HadeHeading level={3}>{title}</HadeHeading>
              {typeof effectiveConfidence === "number" && (
                <span className="rounded-full bg-accentSoft px-2 py-0.5 font-mono text-[10px] font-semibold text-accent">
                  {getConfidenceLabel(effectiveConfidence)}
                </span>
              )}
            </div>
            <HadeText variant="caption" color="muted">
              {timeLabel} · {goingLabel}
            </HadeText>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="rounded-lg bg-accentSoft px-3 py-1.5 font-mono text-xs font-bold text-accent">
              {Math.round((effectiveConfidence ?? decision.confidence) * 100)}% confidence
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
            {live && (
              <span className="rounded bg-green-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider font-semibold text-green-400">
                ● live
              </span>
            )}
          </div>
        </div>

        {/* ── Rationale ──────────────────────────────────────────────────────── */}
        <HadeText variant="body" color="ink" className="italic">
          &quot;{decision.rationale}&quot;
        </HadeText>

        {explanationChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {explanationChips.map((item, index) => (
              <span
                key={`${item}-${index}`}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink/70"
              >
                {item}
              </span>
            ))}
          </div>
        )}

        {/* ── UGC vibe chips ─────────────────────────────────────────────────── */}
        {vibeChips.length > 0 && (
          <>
            <div className="mt-3 flex flex-nowrap items-center gap-2 overflow-hidden">
              {vibeChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink/70"
                >
                  <span aria-hidden="true">{chip.icon}</span>
                  <span>{chip.label}</span>
                </span>
              ))}
            </div>
            {locationNode && locationNode.signal_count > 0 && (
              <p className="mt-1.5 font-mono text-[10px] text-ink/30">
                {locationNode.signal_count} recent signals
              </p>
            )}
          </>
        )}

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
          <div className="flex shrink-0 items-center gap-2">
            <HadeButton variant="primary" size="sm" onClick={onCta}>
              Going
            </HadeButton>
            <HadeButton variant="secondary" size="sm" onClick={onMaybe}>
              Maybe
            </HadeButton>
            <button
              type="button"
              onClick={() => onPivot?.("not_this")}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink/60 transition-colors hover:text-ink"
            >
              Not This
            </button>
          </div>
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
