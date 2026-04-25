"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { VibeTag } from "@/types/hade";
import { useHadeAdaptiveContext } from "@/lib/hade/hooks";

// ─── Tag definitions ──────────────────────────────────────────────────────────

const TAGS = [
  "perfect_vibe",
  "good_energy",
  "too_crowded",
  "overpriced",
  "skip_it",
  "worth_it",
] as const;

type Tag = (typeof TAGS)[number];

const TAG_LABELS: Record<Tag, string> = {
  perfect_vibe: "Perfect vibe",
  good_energy:  "Good energy",
  too_crowded:  "Too crowded",
  overpriced:   "Overpriced",
  skip_it:      "Skip it",
  worth_it:     "Worth it",
};

// ─── Sentiment derivation ─────────────────────────────────────────────────────

function deriveSentiment(tags: string[]): "positive" | "negative" | "neutral" {
  if (
    tags.includes("too_crowded") ||
    tags.includes("overpriced") ||
    tags.includes("skip_it")
  ) {
    return "negative";
  }
  if (
    tags.includes("perfect_vibe") ||
    tags.includes("worth_it") ||
    tags.includes("good_energy")
  ) {
    return "positive";
  }
  return "neutral";
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  venueId:   string;
  venueName: string;
  onDismiss: () => void;
  onSubmit:  (tags: string[], sentiment: "positive" | "negative" | "neutral") => void;
};

export function VibeSheet({ venueId, venueName, onDismiss, onSubmit }: Props) {
  const { emitVibeSignal } = useHadeAdaptiveContext();
  const [selected, setSelected]   = useState<Set<Tag>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);

  const toggleTag = (tag: Tag) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0 || submitting || submitted) return;
    setSubmitting(true);

    const tags      = Array.from(selected);
    const sentiment = deriveSentiment(tags);

    // ── STEP 1: Direct server record (source tag preserved for analytics) ────
    try {
      await fetch("/api/hade/signal", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          tags,
          sentiment,
          source: "post_visit_sheet",
        }),
      });
    } catch {
      // Best-effort — don't block dismissal on network failure
    }

    // ── STEP 2: Queue-based signal (high-intent strength = 0.9) ─────────────
    // Treated as the strongest UGC category; strength 0.9 vs default 0.7
    // to reflect post-experience truth capture.
    emitVibeSignal(venueId, tags as VibeTag[], sentiment, 0.9);

    // ── STEP 3: Close — no duplicate submissions possible via submitted flag ──
    setSubmitted(true);
    onSubmit(tags, sentiment);
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 280 }}
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-line bg-background px-5 pt-5 pb-safe-floor"
    >
      {/* Drag handle */}
      <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line" />

      {/* Header */}
      <p className="font-mono text-xs uppercase tracking-widest text-accent mb-1">
        How was it?
      </p>
      <p className="text-base font-semibold text-ink mb-5">{venueName}</p>

      {/* Tag chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TAGS.map((tag) => {
          const isSelected = selected.has(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isSelected
                  ? "border-accent bg-accentSoft text-accent"
                  : "border-line bg-surface text-ink/60"
              }`}
            >
              {TAG_LABELS[tag]}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDismiss}
          className="flex-1 h-12 rounded-xl border border-line text-sm font-medium text-ink/50 transition-colors active:bg-line/20"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selected.size === 0 || submitting || submitted}
          className="flex-1 h-12 rounded-xl bg-accent text-sm font-semibold text-white transition-opacity disabled:opacity-40 active:opacity-80"
        >
          {submitting ? "Sending…" : "Send"}
        </button>
      </div>
    </motion.div>
  );
}
