"use client";

import { useMemo, useRef, useState } from "react";
import type { SpontaneousObject } from "@/types/hade";
import type { DomainMode } from "@/lib/hade/useHade";
import { TEMPORAL_COPY, getActiveForCopy, type TemporalState } from "@/lib/hade/ugcCopy";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_LABEL: Record<DomainMode, { icon: string; text: string }> = {
  dining: { icon: "🍽", text: "Eat Easy" },
  social: { icon: "⚡", text: "Something Happening" },
  travel: { icon: "🌍", text: "Explore" },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface HeroDecisionCardProps {
  object: SpontaneousObject;
  mode?: DomainMode;
  /** Shows the reframing microcopy instead of normal card content. */
  isReframing?: boolean;
  /** Specific adjustment label — e.g. "Adjusting for: Too far" */
  pivotLabel?: string;
  /** Pre-computed UGC temporal state from DecisionViewModel. */
  temporalState?: TemporalState;
  /** Called when user taps "Join" (strong intent — emits worth_it at 0.9). */
  onJoin?: () => void;
  /** Called when user taps "I'm Interested" (light intent — emits worth_it at 0.5). */
  onInterested?: () => void;
  /** Called when user submits an Add Vibe note. */
  onAddVibe?: (text: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function HeroDecisionCard({
  object,
  mode,
  isReframing = false,
  pivotLabel,
  temporalState,
  onJoin,
  onInterested,
  onAddVibe,
}: HeroDecisionCardProps) {
  const [vibeOpen, setVibeOpen]   = useState(false);
  const [vibeText, setVibeText]   = useState("");
  const [vibeSent, setVibeSent]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeLabel    = useMemo(() => getTimeLabel(object), [object]);
  const live         = useMemo(() => isLive(object), [object]);
  const isUGC        = object.type === "ugc_event";
  const temporalCopy = useMemo(() => {
    const activeFor = getActiveForCopy(object.expires_at);
    if (activeFor) return activeFor;
    return temporalState && temporalState !== "suppressed" ? TEMPORAL_COPY[temporalState] : null;
  }, [object.expires_at, temporalState]);

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
          {/* ── Header row ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isUGC ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                  <span aria-hidden="true">👥</span>
                  Community
                </span>
              ) : (
                <>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/40">
                    Your move
                  </span>
                  {live && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Live
                    </span>
                  )}
                </>
              )}
            </div>

            {mode && !isUGC && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-medium text-ink/50">
                <span aria-hidden="true">{MODE_LABEL[mode].icon}</span>
                {MODE_LABEL[mode].text}
              </span>
            )}
          </div>

          {/* ── Title ───────────────────────────────────────────────────────── */}
          <h1 className="mt-3 text-2xl font-semibold leading-tight text-ink">
            {object.title}
          </h1>

          {/* ── UGC rationale ───────────────────────────────────────────────── */}
          {isUGC && (
            <p className="mt-1.5 text-sm text-ink/55">
              A HADE user recently started a {object.title} here.
            </p>
          )}

          {/* ── Meta chips ──────────────────────────────────────────────────── */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-line bg-white/70 px-3 py-1 text-xs font-medium text-ink/70">
              {isUGC && temporalCopy ? temporalCopy : timeLabel}
            </span>
            <span className="rounded-full border border-line bg-white/70 px-3 py-1 text-xs font-medium text-ink/70">
              {getGoingLabel(object.going_count ?? 0)}
            </span>
          </div>

          {/* ── UGC inline CTAs ─────────────────────────────────────────────── */}
          {isUGC && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onJoin}
                className="flex-1 h-10 rounded-xl bg-accent text-sm font-semibold text-white transition-opacity active:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Join
              </button>
              <button
                type="button"
                onClick={onInterested}
                className="flex-1 h-10 rounded-xl border border-line bg-white/70 text-sm font-medium text-ink/70 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                I'm Interested
              </button>
            </div>
          )}
        </>
      )}
      {/* ── Add Vibe ────────────────────────────────────────────────────────── */}
      {!isReframing && (
        <div className="mt-4 border-t border-line/50 pt-3">
          {vibeOpen ? (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={vibeText}
                onChange={(e) => setVibeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && vibeText.trim()) {
                    onAddVibe?.(vibeText.trim());
                    setVibeText("");
                    setVibeSent(true);
                    setVibeOpen(false);
                    setTimeout(() => setVibeSent(false), 3000);
                  }
                  if (e.key === "Escape") { setVibeOpen(false); setVibeText(""); }
                }}
                placeholder="What feels off or missing?"
                autoFocus
                className="flex-1 rounded-xl border border-line bg-white/70 px-3.5 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 min-h-[44px]"
              />
              <button
                type="button"
                disabled={!vibeText.trim()}
                onClick={() => {
                  if (!vibeText.trim()) return;
                  onAddVibe?.(vibeText.trim());
                  setVibeText("");
                  setVibeSent(true);
                  setVibeOpen(false);
                  setTimeout(() => setVibeSent(false), 3000);
                }}
                className="min-h-[44px] rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-35 focus:outline-none active:opacity-80"
              >
                Send
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setVibeOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="w-full text-left text-sm font-medium text-ink/40 transition-colors hover:text-ink/60 focus:outline-none focus-visible:text-ink/60 min-h-[44px] flex items-center gap-2"
            >
              <span className="text-base" aria-hidden="true">{vibeSent ? "✓" : "+"}</span>
              {vibeSent ? "Vibe added" : "Already here? Share the Vibe"}
            </button>
          )}
        </div>
      )}

    </section>
  );
}
