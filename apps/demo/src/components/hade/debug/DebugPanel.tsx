"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { HadeDebugPayload, HadeDebugCandidate } from "@/types/hade";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DebugPanelProps {
  data: HadeDebugPayload;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(v: number): string {
  if (v >= 0.7) return "text-green-500";
  if (v >= 0.5) return "text-accent";
  return "text-ink/40";
}

function fmt(v: number): string {
  return v.toFixed(2);
}

// ─── Section: Intent Distribution ────────────────────────────────────────────

function IntentSection({ probs }: { probs: Record<string, number> }) {
  const entries = Object.entries(probs).sort(([, a], [, b]) => b - a);
  const max = Math.max(...entries.map(([, v]) => v), 0.01);

  return (
    <div className="px-4 py-3 border-b border-line/30">
      <p className="text-[9px] uppercase tracking-widest text-ink/30 mb-2.5">
        Intent Distribution
      </p>
      <div className="space-y-1.5">
        {entries.map(([intent, prob]) => (
          <div key={intent} className="flex items-center gap-2">
            <span className="w-14 text-[10px] text-ink/50 capitalize shrink-0">
              {intent}
            </span>
            <div className="flex-1 h-1.5 bg-ink/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent/60 rounded-full transition-all duration-500"
                style={{ width: `${((prob / max) * 100).toFixed(1)}%` }}
              />
            </div>
            <span className={`text-[10px] tabular-nums w-8 text-right ${scoreColor(prob)}`}>
              {fmt(prob)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Weights ────────────────────────────────────────────────────────

function WeightsSection({
  weights,
  profile,
}: {
  weights: HadeDebugPayload["weights"];
  profile?: string;
}) {
  return (
    <div className="px-4 py-3 border-b border-line/30">
      <p className="text-[9px] uppercase tracking-widest text-ink/30 mb-2">
        Active Weights
      </p>
      {weights && (
        <div className="flex gap-4 mb-1.5 font-mono text-[10px]">
          <span>
            <span className="text-ink/30">prox </span>
            <span className={scoreColor(weights.proximity)}>{fmt(weights.proximity)}</span>
          </span>
          <span className="text-ink/20">·</span>
          <span>
            <span className="text-ink/30">ctx </span>
            <span className={scoreColor(weights.context)}>{fmt(weights.context)}</span>
          </span>
          <span className="text-ink/20">·</span>
          <span>
            <span className="text-ink/30">intent </span>
            <span className={scoreColor(weights.intent)}>{fmt(weights.intent)}</span>
          </span>
        </div>
      )}
      {profile && (
        <p className="text-[10px] text-ink/30 italic leading-snug">{profile}</p>
      )}
    </div>
  );
}

// ─── Section: Candidates ─────────────────────────────────────────────────────

function CandidatesSection({ candidates }: { candidates: HadeDebugCandidate[] }) {
  return (
    <div className="px-4 py-3 border-b border-line/30">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9px] uppercase tracking-widest text-ink/30">
          Candidates
        </p>
        <span className="text-[9px] text-ink/20 font-mono">P · I · C → final</span>
      </div>
      <div className="space-y-0.5">
        {candidates.map((c, i) => (
          <div
            key={c.venue_id || i}
            className={`flex items-center gap-1 px-2 py-1 rounded ${
              i % 2 === 0 ? "bg-ink/[0.02]" : ""
            }`}
          >
            {/* Rank */}
            <span className="text-[9px] text-ink/20 w-4 shrink-0 tabular-nums">
              {i + 1}.
            </span>
            {/* Name */}
            <span className="flex-1 text-[10px] text-ink/60 truncate min-w-0">
              {c.venue_name}
            </span>
            {/* Scores */}
            <div className="flex gap-2 shrink-0 font-mono text-[10px] tabular-nums">
              <span className={scoreColor(c.proximity_score)}>{fmt(c.proximity_score)}</span>
              <span className="text-ink/20">·</span>
              <span className={scoreColor(c.intent_score)}>{fmt(c.intent_score)}</span>
              <span className="text-ink/20">·</span>
              <span className={scoreColor(c.context_score)}>{fmt(c.context_score)}</span>
              <span className="text-ink/20">→</span>
              <span className={`font-semibold ${scoreColor(c.final_score)}`}>
                {fmt(c.final_score)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Meta ────────────────────────────────────────────────────────────

function MetaSection({ data }: { data: HadeDebugPayload }) {
  const providerShort = data.provider_used
    ? data.provider_used.replace("Provider", "")
    : null;

  const parts: string[] = [];
  if (data.model_used) parts.push(`model: ${data.model_used}`);
  if (providerShort)   parts.push(`provider: ${providerShort}`);
  if (data.exploration_temp != null) parts.push(`T: ${fmt(data.exploration_temp)}`);

  const parts2: string[] = [];
  parts2.push(`strict: ${data.strict_constraints_active ? "on" : "off"}`);
  if (data.persona_id) parts2.push(`persona: ${data.persona_id}`);

  return (
    <div className="px-4 py-2.5">
      {parts.length > 0 && (
        <p className="text-[10px] font-mono text-ink/30 leading-relaxed">
          {parts.join(" · ")}
        </p>
      )}
      {parts2.length > 0 && (
        <p className="text-[10px] font-mono text-ink/25 leading-relaxed">
          {parts2.join(" · ")}
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DebugPanel({ data, className = "" }: DebugPanelProps) {
  const [open, setOpen] = useState(true);

  // Use scoring_breakdown if present (richer), fall back to top_candidates
  const candidates = data.scoring_breakdown ?? data.top_candidates ?? [];

  const hasIntentProbs  = data.intent_probabilities && Object.keys(data.intent_probabilities).length > 0;
  const hasWeights      = !!data.weights || !!data.weight_profile;
  const hasCandidates   = candidates.length > 0;
  const hasMeta         = !!(data.model_used || data.provider_used || data.strict_constraints_active != null);

  return (
    <div
      className={[
        "rounded-2xl border border-line/50 bg-ink/[0.02] overflow-hidden",
        className,
      ].join(" ")}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-ink/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent/50" />
          <span className="text-[10px] uppercase tracking-widest text-ink/40 font-mono">
            Decision Reasoning
          </span>
        </div>
        <span
          className={`text-[10px] text-ink/30 transition-transform duration-200 ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        >
          ▾
        </span>
      </button>

      {/* Collapsible body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="debug-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            {hasIntentProbs && (
              <IntentSection probs={data.intent_probabilities!} />
            )}
            {hasWeights && (
              <WeightsSection weights={data.weights} profile={data.weight_profile} />
            )}
            {hasCandidates && (
              <CandidatesSection candidates={candidates} />
            )}
            {hasMeta && (
              <MetaSection data={data} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
