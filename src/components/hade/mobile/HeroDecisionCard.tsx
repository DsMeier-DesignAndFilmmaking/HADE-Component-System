"use client";

import { useMemo } from "react";
import type { SpontaneousObject } from "@/types/hade";
import type { DomainMode } from "@/lib/hade/useHade";

const MODE_LABEL: Record<DomainMode, { icon: string; text: string }> = {
  dining: { icon: "🍽", text: "Eat Easy" },
  social: { icon: "⚡", text: "Something Happening" },
  travel: { icon: "🌍", text: "Explore" },
};

interface HeroDecisionCardProps {
  object: SpontaneousObject;
  mode?: DomainMode;
  /** Shows the reframing microcopy instead of normal card content. */
  isReframing?: boolean;
  /** Specific adjustment label — e.g. "Adjusting for: Too far" */
  pivotLabel?: string;
}

function getTimeLabel(object: SpontaneousObject): string {
  const now = Date.now();
  const start = object.time_window?.start ?? now;
  if (start <= now) return "Happening now";

  const minutes = Math.max(1, Math.ceil((start - now) / 60_000));
  return `Starting in ${minutes} min`;
}

function getGoingLabel(count: number): string {
  return count === 1 ? "1 person going" : `${count} people going`;
}

function isLive(object: SpontaneousObject): boolean {
  const now = Date.now();
  const start = object.time_window?.start ?? now;
  const end = object.time_window?.end ?? object.expires_at;
  return start <= now && now < end;
}

export function HeroDecisionCard({
  object,
  mode,
  isReframing = false,
  pivotLabel,
}: HeroDecisionCardProps) {
  const timeLabel = useMemo(() => getTimeLabel(object), [object]);
  const live = useMemo(() => isLive(object), [object]);

  return (
    <section
      className="relative flex flex-col rounded-3xl bg-surface p-6 shadow-soft"
      aria-busy={isReframing || undefined}
    >

      {/* ── Reframing overlay ───────────────────────────────────────────────── */}
      {isReframing ? (
        <div className="flex flex-col gap-3 py-1" aria-live="polite">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/30">
            Reframing...
          </span>
          <h1 className="text-2xl font-semibold leading-tight text-ink/30">
            Reframing based on your feedback...
          </h1>
          {pivotLabel && (
            <span className="inline-flex w-fit items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
              {pivotLabel}
            </span>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/40">
                Your move
              </span>
              {live && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Live
                </span>
              )}
            </div>
            {mode && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-medium text-ink/50">
                <span aria-hidden="true">{MODE_LABEL[mode].icon}</span>
                {MODE_LABEL[mode].text}
              </span>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-semibold leading-tight text-ink">
            {object.title}
          </h1>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-line bg-white/70 px-3 py-1 text-xs font-medium text-ink/70">
              {timeLabel}
            </span>
            <span className="rounded-full border border-line bg-white/70 px-3 py-1 text-xs font-medium text-ink/70">
              {getGoingLabel(object.going_count ?? 0)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
