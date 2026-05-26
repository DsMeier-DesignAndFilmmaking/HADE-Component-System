"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GeoLocation, HadeContext } from "@/types/hade";
import { compareModes, type CompareResult } from "@/lib/hade/compareModes";
import type { DomainMode } from "@/lib/hade/useHade";

// ─── Mode visual identity ─────────────────────────────────────────────────────

// Internal type tokens that should never surface in the UI
const INTERNAL_CATEGORIES = new Set([
  "place_opportunity",
  "spontaneous_object",
  "static_synthetic",
]);

interface ModeConfig {
  icon: string;
  label: string;
  // Tailwind classes — kept as string literals so the JIT compiler includes them
  stripClass: string;
  bgClass: string;
  borderClass: string;
  labelClass: string;
  pillClass: string;
  /** Shown when the API returns no rationale copy (e.g. static fallback). */
  fallbackLabel: string;
}

const MODE_CONFIG: Record<DomainMode, ModeConfig> = {
  dining: {
    icon: "🍽",
    label: "Dining",
    stripClass: "bg-amber-400",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-200/60",
    labelClass: "text-amber-700",
    pillClass: "bg-amber-100 text-amber-700",
    fallbackLabel: "Close by and open right now — easy call.",
  },
  social: {
    icon: "⚡",
    label: "Social",
    stripClass: "bg-violet-500",
    bgClass: "bg-violet-50",
    borderClass: "border-violet-200/60",
    labelClass: "text-violet-700",
    pillClass: "bg-violet-100 text-violet-700",
    fallbackLabel: "Energy is peaking nearby — go where the night is.",
  },
  travel: {
    icon: "🌍",
    label: "Travel",
    stripClass: "bg-teal-500",
    bgClass: "bg-teal-50",
    borderClass: "border-teal-200/60",
    labelClass: "text-teal-700",
    pillClass: "bg-teal-100 text-teal-700",
    fallbackLabel: "Best-rated spot in range — worth the trip.",
  },
};

const MODES: DomainMode[] = ["dining", "social", "travel"];

// ─── Panel ────────────────────────────────────────────────────────────────────

interface OtherModesPanelProps {
  geo: GeoLocation | null;
  context?: Partial<HadeContext>;
  open: boolean;
}

export function OtherModesPanel({ geo, context, open }: OtherModesPanelProps) {
  const [results, setResults] = useState<CompareResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Fetch once per component lifetime — toggle close→open reuses cached data.
  const fetchedOnce = useRef(false);

  useEffect(() => {
    if (!open || !geo || fetchedOnce.current) return;

    const controller = new AbortController();
    fetchedOnce.current = true;
    setLoading(true);

    compareModes({ geo, context }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResults(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, geo, context]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="mt-3 flex flex-col gap-2.5"
        >
          <p className="text-center text-[10px] font-medium uppercase tracking-[0.18em] text-ink/30">
            Same context · 3 different lenses
          </p>

          {MODES.map((mode, i) => {
            const result = results?.find((r) => r.mode === mode) ?? null;
            return (
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut", delay: i * 0.07 }}
              >
                <ModeCard
                  config={MODE_CONFIG[mode]}
                  result={result}
                  loading={loading}
                  fallbackLabel={MODE_CONFIG[mode].fallbackLabel}
                />
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface ModeCardProps {
  config: ModeConfig;
  result: CompareResult | null;
  loading: boolean;
  fallbackLabel: string;
}

function ModeCard({ config, result, loading, fallbackLabel }: ModeCardProps) {
  const data = result?.data;

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${config.borderClass} ${config.bgClass}`}
    >
      {/* Accent stripe — the first visual signal of which mode this is */}
      <div className={`h-[3px] w-full ${config.stripClass}`} />

      <div className="px-4 py-3.5">
        {/* Mode eyebrow */}
        <div
          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${config.labelClass}`}
        >
          <span aria-hidden="true">{config.icon}</span>
          {config.label}
        </div>

        {loading || !data ? (
          <CardSkeleton />
        ) : (
          <CardContent data={data} pillClass={config.pillClass} fallbackLabel={fallbackLabel} />
        )}
      </div>
    </div>
  );
}

function CardContent({
  data,
  pillClass,
  fallbackLabel,
}: {
  data: NonNullable<CompareResult["data"]>;
  pillClass: string;
  fallbackLabel: string;
}) {
  const displayLabel = data.label || fallbackLabel;
  const displayCategory = INTERNAL_CATEGORIES.has(data.category) ? null : data.category;

  return (
    <>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink">
        {data.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink/55">
        {displayLabel}
      </p>
      {displayCategory && (
        <span
          className={`mt-2.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium ${pillClass}`}
        >
          {displayCategory}
        </span>
      )}
    </>
  );
}

function CardSkeleton() {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="h-3.5 w-4/5 animate-pulse rounded bg-ink/10" />
      <div className="h-2.5 w-3/5 animate-pulse rounded bg-ink/8" />
      <div className="h-2.5 w-full animate-pulse rounded bg-ink/5" />
    </div>
  );
}
