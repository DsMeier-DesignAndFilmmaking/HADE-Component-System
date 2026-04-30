"use client";

import { useMemo } from "react";
import type { SpontaneousObject } from "@/types/hade";

interface HeroDecisionCardProps {
  object: SpontaneousObject;
  onGoing?: () => void;
  onMaybe?: () => void;
  onNotThis?: () => void;
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
  onGoing,
  onMaybe,
  onNotThis,
}: HeroDecisionCardProps) {
  const timeLabel = useMemo(() => getTimeLabel(object), [object]);
  const live = useMemo(() => isLive(object), [object]);

  return (
    <section className="relative flex flex-col rounded-3xl bg-surface p-6 shadow-soft">

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

      <div className="mt-5 grid grid-cols-[1fr_1fr_auto] gap-2">
        <button
          type="button"
          onClick={onGoing}
          className="min-h-[42px] rounded-xl bg-ink px-4 text-sm font-semibold text-white transition-colors active:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          Going
        </button>
        <button
          type="button"
          onClick={onMaybe}
          className="min-h-[42px] rounded-xl border border-line bg-white/70 px-4 text-sm font-semibold text-ink transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
        >
          Maybe
        </button>
        <button
          type="button"
          onClick={onNotThis}
          className="min-h-[42px] rounded-xl border border-line bg-transparent px-3 text-sm font-semibold text-ink/55 transition-colors active:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
        >
          Not This
        </button>
      </div>
    </section>
  );
}
