"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { VibeTag, VibeSignal } from "@/types/hade";
import { VIBE_TAG_SENTIMENT } from "@/types/hade";

// ─── VibeTag display config ───────────────────────────────────────────────────

interface VibeTagMeta {
  label: string;
  emoji: string;
}

const VIBE_TAG_META: Record<VibeTag, VibeTagMeta> = {
  too_crowded:  { label: "Too crowded",  emoji: "😵" },
  perfect_vibe: { label: "Perfect vibe", emoji: "✨" },
  overpriced:   { label: "Overpriced",   emoji: "💸" },
  hidden_gem:   { label: "Hidden gem",   emoji: "💎" },
  loud:         { label: "Loud",         emoji: "🔊" },
  quiet:        { label: "Quiet",        emoji: "🤫" },
  good_energy:  { label: "Good energy",  emoji: "⚡" },
  dead:         { label: "Dead",         emoji: "💀" },
  worth_it:     { label: "Worth it",     emoji: "👍" },
  skip_it:      { label: "Skip it",      emoji: "👎" },
};

const ALL_VIBE_TAGS = Object.keys(VIBE_TAG_META) as VibeTag[];

// ─── Component props ──────────────────────────────────────────────────────────

interface CommunitySignalToggleProps {
  enabled:   boolean;
  onChange:  (enabled: boolean) => void;
  className?: string;

  // ── Vibe Signal props (optional — only shown when a venue is in focus) ──
  /** The venue ID that will receive the VibeSignal. */
  venueId?:       string;
  /** Display name shown above the tag picker. */
  venueName?:     string;
  /**
   * Called when the user submits a vibe signal.
   * Parent is responsible for calling emitVibeSignal() from useAdaptive().
   */
  onVibeSignal?:  (
    tags:      VibeTag[],
    sentiment: VibeSignal["sentiment"],
  ) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * CommunitySignalToggle
 *
 * Privacy-first opt-in toggle for the UGC signal layer.
 * When enabled AND a `venueId` is provided, expands to show a VibeTag picker
 * that lets the user rate the current venue.
 *
 * Tag selection calls `onVibeSignal()` with the selected tags and their
 * aggregate sentiment — the parent wires this to `emitVibeSignal()` from
 * the `useAdaptive()` hook, which queues the signal for non-blocking ingest.
 */
export function CommunitySignalToggle({
  enabled,
  onChange,
  className = "",
  venueId,
  venueName,
  onVibeSignal,
}: CommunitySignalToggleProps) {
  const [selectedTags, setSelectedTags] = useState<Set<VibeTag>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const showPicker = enabled && !!venueId && !!onVibeSignal;

  function toggleTag(tag: VibeTag) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    setSubmitted(false);
  }

  function submitVibeTags() {
    if (selectedTags.size === 0 || !onVibeSignal) return;

    const tags = [...selectedTags];
    const posCount = tags.filter((t) => VIBE_TAG_SENTIMENT[t] === "positive").length;
    const negCount = tags.length - posCount;
    const sentiment: VibeSignal["sentiment"] =
      posCount > negCount ? "positive" : negCount > posCount ? "negative" : "neutral";

    onVibeSignal(tags, sentiment);
    setSubmitted(true);
    // Reset after a short delay so the user can submit again
    setTimeout(() => {
      setSelectedTags(new Set());
      setSubmitted(false);
    }, 2500);
  }

  return (
    <div className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}>
      {/* ── Toggle row ─────────────────────────────────────────────────────── */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={[
          "group flex items-center gap-3 w-full rounded-xl border px-4 py-3 transition-all duration-200",
          enabled
            ? "border-accent/30 bg-accent/5"
            : "border-line bg-surface hover:border-ink/15",
        ].join(" ")}
      >
        {/* Toggle track */}
        <div
          className={[
            "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
            enabled ? "bg-accent" : "bg-ink/15",
          ].join(" ")}
        >
          <motion.div
            className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm"
            animate={{ left: enabled ? 18 : 2 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        </div>

        {/* Label + description */}
        <div className="flex flex-col items-start min-w-0">
          <span
            className={[
              "text-sm font-medium transition-colors",
              enabled ? "text-accent" : "text-ink/70",
            ].join(" ")}
          >
            Community Signals
          </span>
          <span className="text-[11px] text-ink/40 leading-tight">
            {enabled
              ? "Sharing moments · Discovering from others"
              : "Share moments · Discover from others"}
          </span>
        </div>

        {/* Live indicator */}
        {enabled && (
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-50" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            <span className="text-[10px] font-mono text-accent/60 uppercase tracking-wider">
              Live
            </span>
          </div>
        )}
      </button>

      {/* ── VibeTag picker (only when enabled + venue in focus) ────────────── */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            key="vibe-picker"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-line bg-surface/60 p-3 flex flex-col gap-2.5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-ink/40 uppercase tracking-wider">
                  Rate this spot
                </span>
                {venueName && (
                  <span className="text-[11px] text-ink/60 truncate max-w-[140px]">
                    {venueName}
                  </span>
                )}
              </div>

              {/* Tag grid */}
              <div className="flex flex-wrap gap-1.5">
                {ALL_VIBE_TAGS.map((tag) => {
                  const { label, emoji } = VIBE_TAG_META[tag];
                  const isSelected = selectedTags.has(tag);
                  const isPositive  = VIBE_TAG_SENTIMENT[tag] === "positive";

                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={[
                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium",
                        "border transition-all duration-150 select-none",
                        isSelected
                          ? isPositive
                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                            : "border-rose-400/40 bg-rose-400/10 text-rose-400"
                          : "border-line bg-surface text-ink/50 hover:text-ink/80 hover:border-ink/20",
                      ].join(" ")}
                    >
                      <span>{emoji}</span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Submit */}
              <AnimatePresence mode="wait">
                {submitted ? (
                  <motion.div
                    key="thanks"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-1.5 py-1"
                  >
                    <span className="text-emerald-400 text-[12px] font-medium">
                      ✓ Vibe signal sent
                    </span>
                  </motion.div>
                ) : (
                  <motion.button
                    key="submit"
                    type="button"
                    onClick={submitVibeTags}
                    disabled={selectedTags.size === 0}
                    className={[
                      "w-full py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150",
                      selectedTags.size > 0
                        ? "bg-accent text-obsidian hover:bg-accent/90"
                        : "bg-surface border border-line text-ink/30 cursor-not-allowed",
                    ].join(" ")}
                  >
                    {selectedTags.size === 0
                      ? "Select a vibe"
                      : `Send ${selectedTags.size} signal${selectedTags.size > 1 ? "s" : ""}`}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
