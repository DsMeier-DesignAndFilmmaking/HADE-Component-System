"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AgentPersona, GeoLocation, HadeContext } from "@/types/hade";
import type { DomainMode } from "@/lib/hade/useHade";
import {
  COMPARE_MODES,
  compareModes,
  type CompareResult,
} from "@/lib/hade/compareModes";

const MODE_META: Record<DomainMode, { icon: string; label: string }> = {
  dining: { icon: "🍽", label: "Dining" },
  social: { icon: "⚡", label: "Social" },
  travel: { icon: "🌍", label: "Travel" },
};

interface CompareModesSheetProps {
  open:     boolean;
  geo:      GeoLocation | null;
  persona?: AgentPersona;
  context?: Partial<HadeContext>;
  onClose:  () => void;
}

export function CompareModesSheet({
  open,
  geo,
  persona,
  context,
  onClose,
}: CompareModesSheetProps) {
  const [results, setResults] = useState<CompareResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !geo) return;

    const controller = new AbortController();
    setLoading(true);
    setResults(null);

    compareModes({ geo, persona, context }, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setResults(res);
      })
      .catch(() => { /* per-mode errors are captured inside compareModes */ })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, geo, persona, context]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="mx-auto w-full max-w-[430px] rounded-t-3xl bg-background px-4 pb-safe-floor pt-5 shadow-2xl"
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">
                Compare modes
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-3 py-1 text-xs font-semibold text-ink/50 active:text-ink"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {COMPARE_MODES.map((mode) => {
                const result = results?.find((r) => r.mode === mode);
                return (
                  <CompareCard
                    key={mode}
                    mode={mode}
                    loading={loading || !result}
                    result={result}
                  />
                );
              })}
            </div>

            <p className="mt-3 text-center text-[10px] uppercase tracking-[0.14em] text-ink/30">
              Same input · 3 different lenses
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

interface CompareCardProps {
  mode:    DomainMode;
  loading: boolean;
  result?: CompareResult;
}

function CompareCard({ mode, loading, result }: CompareCardProps) {
  const meta = MODE_META[mode];

  return (
    <div className="flex min-h-[140px] flex-col rounded-2xl border border-line/40 bg-surface p-3">
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/45">
        <span aria-hidden="true">{meta.icon}</span>
        {meta.label}
      </div>

      {loading && <CardSkeleton />}

      {!loading && result?.data && (
        <>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-tight text-ink">
            {result.data.title}
          </h3>
          <span className="mt-1 inline-block w-fit rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink/55">
            {result.data.category}
          </span>
          {result.data.label && (
            <p className="mt-2 line-clamp-3 text-[11px] leading-snug text-ink/55">
              {result.data.label}
            </p>
          )}
        </>
      )}

      {!loading && (!result?.data) && (
        <p className="mt-2 text-[11px] text-ink/40">No result.</p>
      )}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="h-3 w-3/4 animate-pulse rounded bg-ink/10" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-ink/10" />
      <div className="mt-1 h-2 w-full animate-pulse rounded bg-ink/5" />
      <div className="h-2 w-5/6 animate-pulse rounded bg-ink/5" />
    </div>
  );
}
