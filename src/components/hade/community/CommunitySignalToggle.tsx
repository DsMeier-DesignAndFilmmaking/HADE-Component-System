"use client";

import { motion } from "framer-motion";

interface CommunitySignalToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
}

/**
 * CommunitySignalToggle
 *
 * System-level opt-in for user-generated signals. Controls whether the user
 * participates in the community signal layer — both broadcasting their own
 * signals and receiving signals from nearby explorers.
 *
 * Default: OFF (privacy-first). Must be explicitly enabled.
 *
 * This is a UX hook for future backend integration. Today it sets a boolean
 * flag on AdaptiveState that downstream components can read to:
 *  - Tag emitted signals with `source: "user"` and `shareable: true`
 *  - Display community signals in the signal feed (when available)
 */
export function CommunitySignalToggle({
  enabled,
  onChange,
  className = "",
}: CommunitySignalToggleProps) {
  return (
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
        className,
      ]
        .filter(Boolean)
        .join(" ")}
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

      {/* Status indicator */}
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
  );
}
