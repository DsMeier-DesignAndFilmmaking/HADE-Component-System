"use client";

import { motion } from "framer-motion";
import type {
  ContextSignalBadgeProps,
  Intent,
  Urgency,
  UserSignalMode,
} from "@/types/hade";

const intentMeta: Record<Intent, { label: string; color: string }> = {
  eat: { label: "Eat", color: "#F59E0B" },
  drink: { label: "Drink", color: "#8B5CF6" },
  chill: { label: "Chill", color: "#10B981" },
  scene: { label: "Scene", color: "#EC4899" },
  anything: { label: "Anything", color: "#316BFF" },
};

const urgencyMeta: Record<Urgency, { color: string; label: string }> = {
  low: { color: "#10B981", label: "Low" },
  medium: { color: "#F59E0B", label: "Medium" },
  high: { color: "#EF4444", label: "High" },
};

const modeLabels: Record<UserSignalMode, string> = {
  explore: "Explore",
  compare: "Compare",
  book: "Book",
};

export function ContextSignalBadge({
  signal,
  showContext = false,
  animated = false,
  className = "",
}: ContextSignalBadgeProps) {
  const intent = intentMeta[signal.intent];
  const urgency = urgencyMeta[signal.urgency];

  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 shadow-soft",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="inline-flex items-center gap-1.5 pr-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: intent.color }}
        />
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: intent.color }}
        >
          {intent.label}
        </span>
      </div>

      <span className="h-4 w-px bg-line" />

      <div className="relative inline-flex items-center justify-center px-1.5">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: urgency.color }}
          aria-label={`${urgency.label} urgency`}
        />
        {animated && (
          <motion.span
            className="pointer-events-none absolute h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: urgency.color }}
            animate={{ scale: [1, 2.6], opacity: [0.5, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </div>

      <span className="h-4 w-px bg-line" />

      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/75">
        {modeLabels[signal.mode]}
      </span>

      {showContext && signal.context && (
        <>
          <span className="h-4 w-px bg-line" />
          <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-ink/70">
            {signal.context}
          </span>
        </>
      )}
    </div>
  );
}
