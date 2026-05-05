"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { DomainMode } from "@/lib/hade/useHade";

// ─── Mode definitions ─────────────────────────────────────────────────────────

const MODES: {
  mode: DomainMode;
  icon: string;
  label: string;
  sub: string;
  stripClass: string;
  bgClass: string;
  borderClass: string;
  labelClass: string;
  subClass: string;
  ringClass: string;
}[] = [
  {
    mode: "dining",
    icon: "🍽",
    label: "Eat Easy",
    sub: "Something good, close by",
    stripClass: "bg-amber-400",
    bgClass: "bg-amber-50 active:bg-amber-100",
    borderClass: "border-amber-200",
    labelClass: "text-amber-900",
    subClass: "text-amber-800/60",
    ringClass: "focus-visible:ring-amber-400",
  },
  {
    mode: "social",
    icon: "⚡",
    label: "Something Happening",
    sub: "Go where the energy is",
    stripClass: "bg-violet-500",
    bgClass: "bg-violet-50 active:bg-violet-100",
    borderClass: "border-violet-200",
    labelClass: "text-violet-900",
    subClass: "text-violet-800/60",
    ringClass: "focus-visible:ring-violet-400",
  },
  {
    mode: "travel",
    icon: "🌍",
    label: "Explore",
    sub: "Discover something worth the trip",
    stripClass: "bg-teal-500",
    bgClass: "bg-teal-50 active:bg-teal-100",
    borderClass: "border-teal-200",
    labelClass: "text-teal-900",
    subClass: "text-teal-800/60",
    ringClass: "focus-visible:ring-teal-400",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface GuidedDemoEntryProps {
  onSelect: (mode: DomainMode) => void;
}

export function GuidedDemoEntry({ onSelect }: GuidedDemoEntryProps) {
  const [selected, setSelected] = useState<DomainMode | null>(null);

  const handleSelect = (mode: DomainMode) => {
    if (selected) return;
    setSelected(mode);
    // Brief tactile pause before transitioning — makes the tap feel registered
    setTimeout(() => onSelect(mode), 220);
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col justify-center px-6 pb-16">

      {/* ── Headline ───────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        className="mb-10"
      >
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-ink/30">
          HADE
        </p>
        <h1 className="text-[26px] font-semibold leading-tight text-ink">
          You have 2 hours and nothing planned.
        </h1>
        <p className="mt-3 text-base text-ink/45">
          What sounds right?
        </p>
      </motion.div>

      {/* ── Mode buttons ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {MODES.map((item, i) => {
          const isSelected = selected === item.mode;
          const isDimmed = selected !== null && !isSelected;

          return (
            <motion.button
              key={item.mode}
              type="button"
              onClick={() => handleSelect(item.mode)}
              disabled={selected !== null}
              initial={{ opacity: 0, y: 14 }}
              animate={{
                opacity: isDimmed ? 0.28 : 1,
                y: 0,
                scale: isSelected ? 0.965 : 1,
              }}
              transition={{
                opacity: { duration: 0.18 },
                scale: { duration: 0.12 },
                y: { duration: 0.26, ease: "easeOut", delay: 0.1 + i * 0.07 },
              }}
              className={`
                relative overflow-hidden rounded-2xl border px-5 py-4 text-left
                transition-colors
                ${item.bgClass} ${item.borderClass}
                focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${item.ringClass}
                disabled:cursor-default
              `}
            >
              {/* Left accent stripe */}
              <div className={`absolute left-0 top-0 h-full w-[3px] ${item.stripClass}`} />

              <div className="pl-3">
                <div className={`flex items-center gap-2 text-[15px] font-semibold leading-tight ${item.labelClass}`}>
                  <span aria-hidden="true" className="text-base">{item.icon}</span>
                  {item.label}
                </div>
                <p className={`mt-1 text-sm leading-snug ${item.subClass}`}>
                  {item.sub}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* ── Footer hint ────────────────────────────────────────────────────── */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="mt-10 text-center text-[11px] text-ink/25"
      >
        One tap. No setup.
      </motion.p>

    </div>
  );
}
