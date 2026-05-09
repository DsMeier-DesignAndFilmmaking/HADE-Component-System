"use client";

import { useMemo, useRef, useState } from "react";
import type { SpontaneousObject } from "@/types/hade";
import type { DomainMode } from "@/lib/hade/useHade";
import { TEMPORAL_COPY, getActiveForCopy, type TemporalState } from "@/lib/hade/ugcCopy";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_CONTEXT: Record<DomainMode, string> = {
  dining: "Optimized for low friction",
  social: "Looking for live activity",
  travel: "Finding something unexpected",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface HeroDecisionCardProps {
  object: SpontaneousObject;
  mode?: DomainMode;
  contextLabel?: string;
  lensIcon?: string;
  lensLabel?: string;
  lensFrame?: string;
  isFallback?: boolean;
  /** Shows the reframing microcopy instead of normal card content. */
  isReframing?: boolean;
  /** Specific adjustment label — e.g. "Adjusting for: Too far" */
  pivotLabel?: string;
  /** Pre-computed UGC temporal state from DecisionViewModel. */
  temporalState?: TemporalState;
  /** Lightweight confirmation treatment for the immediate post-save UGC card. */
  confirmationState?: "created";
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
  contextLabel,
  lensIcon,
  lensLabel,
  lensFrame,
  isFallback = false,
  isReframing = false,
  pivotLabel,
  temporalState,
  confirmationState,
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
  const isNewlyCreatedUGC = isUGC && confirmationState === "created";
  const temporalCopy = useMemo(() => {
    const activeFor = getActiveForCopy(object.expires_at);
    if (activeFor) return activeFor;
    return temporalState && temporalState !== "suppressed" ? TEMPORAL_COPY[temporalState] : null;
  }, [object.expires_at, temporalState]);

  return (
    <section
      className="relative flex flex-col rounded-[22px] bg-surface p-4 shadow-soft min-[390px]:p-5"
      aria-busy={isReframing || undefined}
    >

      {/* ── Reframing overlay ───────────────────────────────────────────────── */}
      {isReframing ? (
        <div className="flex min-h-[128px] flex-col justify-center gap-2.5 py-0.5" aria-live="polite">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/30">
            Reframing
          </span>
          <h1 className="text-[21px] font-semibold leading-[1.12] text-ink/45">
            {pivotLabel ?? "Reframing based on your feedback"}
          </h1>
          <div className="h-0.5 w-16 overflow-hidden rounded-full bg-ink/5">
            <div className="h-full w-1/2 rounded-full bg-ink/20 motion-safe:animate-pulse" />
          </div>
        </div>
      ) : (
        <>
          {/* ── Header row ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {isUGC ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                    <span aria-hidden="true">👥</span>
                    Community
                  </span>
                  {isNewlyCreatedUGC && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] leading-none text-white" aria-hidden="true">
                        ✓
                      </span>
                      Added to HADE
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/40">
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
              {lensLabel && (
                <span
                  className={`inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight ${
                    isFallback
                      ? "border-amber-400/25 bg-amber-400/10 text-amber-700"
                      : "border-line/60 bg-white/55 text-ink/48"
                  }`}
                >
                  {lensIcon && <span aria-hidden="true">{lensIcon}</span>}
                  <span className="truncate">{lensLabel}</span>
                </span>
              )}
            </div>
          </div>

          {/* ── Title ───────────────────────────────────────────────────────── */}
          <h1 className="mt-2 text-[22px] font-semibold leading-[1.12] text-ink min-[390px]:text-2xl">
            {object.title}
          </h1>

          {(contextLabel || mode) && (
            <p className="mt-1.5 text-[12px] font-medium leading-snug text-ink/42">
              {contextLabel ?? MODE_CONTEXT[mode!]}
            </p>
          )}

          {lensFrame && (
            <p
              className={`mt-1.5 text-[13px] leading-snug ${
                isFallback ? "font-medium text-ink/64" : "text-ink/52"
              }`}
            >
              {lensFrame}
            </p>
          )}

          {/* ── UGC rationale ───────────────────────────────────────────────── */}
          {isNewlyCreatedUGC ? (
            <p className="mt-1.5 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.06] px-3 py-2 text-[12.5px] font-medium leading-snug text-emerald-800">
              Saved. HADE can now use this in future decisions.
            </p>
          ) : isUGC ? (
            <p className="mt-1.5 text-[13px] leading-snug text-ink/55">
              A HADE user recently started a {object.title} here.
            </p>
          ) : null}

          {/* ── Meta chips ──────────────────────────────────────────────────── */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-line bg-white/70 px-2.5 py-0.5 text-[11px] font-medium text-ink/70">
              {isUGC && temporalCopy ? temporalCopy : timeLabel}
            </span>
            <span className="rounded-full border border-line bg-white/70 px-2.5 py-0.5 text-[11px] font-medium text-ink/70">
              {getGoingLabel(object.going_count ?? 0)}
            </span>
          </div>

          {/* ── UGC inline CTAs ─────────────────────────────────────────────── */}
          {isUGC && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onJoin}
                className="h-9 flex-1 rounded-xl bg-accent text-sm font-semibold text-white transition-opacity active:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Join
              </button>
              <button
                type="button"
                onClick={onInterested}
                className="h-9 flex-1 rounded-xl border border-line bg-white/70 text-sm font-medium text-ink/70 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                I'm Interested
              </button>
            </div>
          )}
        </>
      )}
      {/* ── Add Vibe ────────────────────────────────────────────────────────── */}
      {!isReframing && (
        <div className="mt-3 border-t border-line/40 pt-2">
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
                className="min-h-10 flex-1 rounded-xl border border-line bg-white/70 px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
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
                className="min-h-10 rounded-xl bg-accent px-3.5 text-sm font-semibold text-white transition-opacity disabled:opacity-35 focus:outline-none active:opacity-80"
              >
                Send
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setVibeOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="flex min-h-9 w-full items-center gap-1.5 text-left text-[13px] font-medium text-ink/40 transition-colors hover:text-ink/60 focus:outline-none focus-visible:text-ink/60"
            >
              <span className="text-sm" aria-hidden="true">{vibeSent ? "✓" : "+"}</span>
              {vibeSent ? "Vibe added" : "Already here? Share the Vibe"}
            </button>
          )}
        </div>
      )}

    </section>
  );
}
