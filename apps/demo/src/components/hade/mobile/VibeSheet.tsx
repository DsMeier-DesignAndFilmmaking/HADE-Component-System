"use client";

import { useState } from "react";
import { motion } from "framer-motion";

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
  isUGC?:    boolean;
  onDismiss: () => void;
  onSubmit:  (tags: string[], sentiment: "positive" | "negative" | "neutral") => void;
};

export function VibeSheet({ venueId: _venueId, venueName, isUGC = false, onDismiss, onSubmit }: Props) {
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

  const handleSubmit = () => {
    if (selected.size === 0 || submitting || submitted) return;
    setSubmitting(true);
    const tags      = Array.from(selected);
    const sentiment = deriveSentiment(tags);
    setSubmitted(true);
    onSubmit(tags, sentiment);
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 280 }}
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-[22px] border-t border-line bg-background px-4 pb-[max(12px,env(safe-area-inset-bottom,12px))] pt-3.5 min-[390px]:px-5"
    >
      {/* Drag handle */}
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />

      {/* Header */}
      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-accent">
        How was it?
      </p>
      <p className="mb-3 text-sm font-semibold leading-snug text-ink">{venueName}</p>

      {/* Tag chips */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {isUGC && (
          <span
            aria-label="Community — always selected"
            className="inline-flex items-center rounded-full border border-accent/30 bg-accentSoft/60 px-3 py-1 text-[13px] font-medium text-accent/60 select-none"
          >
            Community
          </span>
        )}
        {TAGS.map((tag) => {
          const isSelected = selected.has(tag);
          return (
            <motion.button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.93 }}
              animate={isSelected ? { scale: [1, 1.1, 1] } : { scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isSelected
                  ? "border-accent bg-accentSoft text-accent"
                  : "border-line bg-surface text-ink/60"
              }`}
            >
              {TAG_LABELS[tag]}
            </motion.button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="h-10 flex-1 rounded-xl border border-line text-sm font-medium text-ink/50 transition-colors active:bg-line/20"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selected.size === 0 || submitting || submitted}
          className="h-10 flex-1 rounded-xl bg-accent text-sm font-semibold text-white transition-opacity disabled:opacity-40 active:opacity-80"
        >
          {submitting ? "Sending…" : "Send"}
        </button>
      </div>
    </motion.div>
  );
}
