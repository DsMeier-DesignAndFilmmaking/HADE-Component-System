"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  const reduceMotion = useReducedMotion();

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

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 px-3 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-modes-title"
            drag={reduceMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) onClose();
            }}
            className="mx-auto flex max-h-[min(86dvh,560px)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[24px] border border-b-0 border-line/70 bg-surface shadow-panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", damping: 30, stiffness: 300 }
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pb-0.5 pt-2.5">
              <span className="h-1 w-9 rounded-full bg-ink/15" aria-hidden="true" />
            </div>

            <div className="flex items-start justify-between gap-3 border-b border-line/50 px-4 pb-3 pt-2 min-[390px]:px-5">
              <div className="min-w-0">
                <h2 id="compare-modes-title" className="text-[15px] font-semibold leading-tight text-ink">
                  Compare modes
                </h2>
                <p className="mt-1 text-[11px] leading-snug text-ink/65">
                  The same situation, viewed three different ways.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-h-8 shrink-0 rounded-full border border-line/60 bg-surface/80 px-3 text-[11px] font-semibold text-ink/65 transition-colors hover:bg-background active:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 min-[390px]:px-5">
              {!geo ? (
                <div className="rounded-2xl border border-line/60 bg-surface px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-ink/70">Location needed</p>
                  <p className="mt-1 text-[12px] leading-snug text-ink/65">
                    Turn on location to compare the same situation across modes.
                  </p>
                </div>
              ) : (
                <div className="flex snap-x gap-2 overflow-x-auto pb-1 min-[390px]:grid min-[390px]:grid-cols-3 min-[390px]:overflow-visible">
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
              )}

              <p className="mt-3 text-center text-[9px] uppercase tracking-[0.14em] text-ink/60">
                Same input · 3 lenses
              </p>
            </div>
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
    <div className="flex min-h-[136px] w-[132px] shrink-0 snap-start flex-col rounded-2xl border border-line/50 bg-background/70 p-3 shadow-soft min-[390px]:w-auto">
    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/65">
        <span aria-hidden="true">{meta.icon}</span>
        {meta.label}
      </div>

      {loading && <CardSkeleton />}

      {!loading && result?.data && (
        <>
          <h3 className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-tight text-ink">
            {result.data.title}
          </h3>
          <span className="mt-1 inline-block w-fit rounded-full bg-ink/5 px-1.5 py-0.5 text-[9px] font-medium text-ink/65">
            {result.data.category}
          </span>
          {result.data.label && (
            <p className="mt-1.5 line-clamp-3 text-[10px] leading-snug text-ink/65">
              {result.data.label}
            </p>
          )}
        </>
      )}

      {!loading && (!result?.data) && (
        <p className="mt-2 text-[10px] text-ink/65">No result.</p>
      )}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="h-3 w-3/4 animate-pulse rounded bg-ink/10" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-ink/10" />
      <div className="mt-1 h-2 w-full animate-pulse rounded bg-ink/5" />
      <div className="h-2 w-5/6 animate-pulse rounded bg-ink/5" />
    </div>
  );
}
