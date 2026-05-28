"use client";

import { useMemo, useRef, useState } from "react";
import { Clock, MapPin, ShieldCheck, Sparkles, Users } from "lucide-react";
import type { SpontaneousObject, UiState } from "@/types/hade";
import type { DomainMode } from "@/lib/hade/useHade";
import { TEMPORAL_COPY, getActiveForCopy, type TemporalState } from "@/lib/hade/ugcCopy";
import { WhyThisSheet } from "./WhyThisSheet";

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
  confidence?: number;
  uiState?: UiState;
  distanceLabel?: string;
  etaLabel?: string;
  rationale?: string;
  whyNow?: string;
  whyThis?: string;
  supportLabel?: string;
  supportDetail?: string;
  contextLabel?: string;
  lensIcon?: string;
  lensLabel?: string;
  lensFrame?: string;
  isFallback?: boolean;
  fallbackNotice?: {
    label: string;
    detail: string;
  };
  /** Shows the reframing microcopy instead of normal card content. */
  isReframing?: boolean;
  /** Specific adjustment label — e.g. "Adjusting for: Too far" */
  pivotLabel?: string;
  /** Pre-computed UGC temporal state from DecisionViewModel. */
  temporalState?: TemporalState;
  /** Lightweight confirmation treatment for the immediate post-save UGC card. */
  confirmationState?: "created";
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

type CreatedLocationDisplay = {
  primary: string;
  secondary?: string;
};

function getCreatedLocationDisplay(object: SpontaneousObject): CreatedLocationDisplay | null {
  const placeName = object.place_name?.trim();
  if (placeName) {
    const address = object.address?.trim();
    return {
      primary: placeName,
      ...(address ? { secondary: address } : {}),
    };
  }

  const locationLabel = object.location_label?.trim();
  if (locationLabel) return { primary: locationLabel };

  if (object.location_source === "browser_geolocation") {
    return { primary: "Current location saved" };
  }

  if (object.location_source === "fallback_geo") return null;

  return null;
}

function cleanSupportCopy(copy?: string | null): string | null {
  const trimmed = copy?.trim();
  return trimmed ? trimmed : null;
}

function getConfidenceCopy(
  confidence: number | undefined,
  uiState: UiState | undefined,
  isFallback: boolean,
  isUGC: boolean,
): { label: string; detail: string } {
  if (isFallback) {
    return {
      label: "Best available pick",
      detail: "Live context is limited, so this favors something dependable.",
    };
  }

  if (isUGC) {
    return {
      label: "Fresh local note",
      detail: "Someone nearby added this recently, so it may be more alive than a listing.",
    };
  }

  if (uiState === "high" || (confidence ?? 0) >= 0.72) {
    return {
      label: "Strong fit",
      detail: "Timing, distance, and your lens are pointing the same way.",
    };
  }

  if (uiState === "medium" || (confidence ?? 0) >= 0.52) {
    return {
      label: "Good fit",
      detail: "There is enough context here to make a clear call.",
    };
  }

  return {
    label: "Easy maybe",
    detail: "The read is lighter, but the option is low-commitment.",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HeroDecisionCard({
  object,
  mode,
  confidence,
  uiState,
  distanceLabel,
  etaLabel,
  rationale,
  whyNow,
  whyThis,
  supportLabel,
  supportDetail,
  contextLabel,
  lensIcon,
  lensLabel,
  lensFrame,
  isFallback = false,
  fallbackNotice,
  isReframing = false,
  pivotLabel,
  temporalState,
  confirmationState,
  onAddVibe,
}: HeroDecisionCardProps) {
  const [vibeOpen, setVibeOpen]   = useState(false);
  const [vibeText, setVibeText]   = useState("");
  const [vibeSent, setVibeSent]   = useState(false);
  const [whyThisOpen, setWhyThisOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeLabel    = useMemo(() => getTimeLabel(object), [object]);
  const live         = useMemo(() => isLive(object), [object]);
  const isUGC        = object.type === "ugc_event";
  const isNewlyCreatedUGC = isUGC && confirmationState === "created";
  const createdLocationDisplay = useMemo(
    () => (isNewlyCreatedUGC ? getCreatedLocationDisplay(object) : null),
    [isNewlyCreatedUGC, object],
  );
  const temporalCopy = useMemo(() => {
    const activeFor = getActiveForCopy(object.expires_at);
    if (activeFor) return activeFor;
    return temporalState && temporalState !== "suppressed" ? TEMPORAL_COPY[temporalState] : null;
  }, [object.expires_at, temporalState]);
  const confidenceCopy = useMemo(
    () => getConfidenceCopy(confidence, uiState, isFallback, isUGC),
    [confidence, uiState, isFallback, isUGC],
  );
  const activeFallbackNotice = isFallback
    ? fallbackNotice ?? {
        label: "Limited live context",
        detail: "This is a dependable backup while HADE waits for stronger live signals.",
      }
    : null;
  const primarySupport = supportLabel ?? contextLabel ?? (mode ? MODE_CONTEXT[mode] : undefined);
  const secondarySupport = supportDetail ?? (!supportLabel ? lensFrame : undefined);
  const hasResolvedSupport = Boolean(supportLabel || supportDetail);
  const whyPrimary = cleanSupportCopy(whyThis) ?? cleanSupportCopy(rationale) ?? cleanSupportCopy(secondarySupport);
  const whySecondary = cleanSupportCopy(whyNow) ?? cleanSupportCopy(primarySupport);
  const placeMeta = [
    distanceLabel ? { key: "distance", icon: MapPin, label: distanceLabel } : null,
    etaLabel ? { key: "eta", icon: Clock, label: etaLabel } : null,
    { key: "time", icon: Clock, label: isUGC && temporalCopy ? temporalCopy : timeLabel },
    object.going_count > 0 ? { key: "going", icon: Users, label: getGoingLabel(object.going_count) } : null,
  ].filter((item): item is { key: string; icon: typeof Clock; label: string } => Boolean(item));

  return (
    <section
      className="relative flex flex-col overflow-hidden rounded-[24px] border border-line/45 bg-surface p-4 shadow-panel min-[390px]:p-5"
      aria-busy={isReframing || undefined}
    >

      {/* ── Reframing overlay ───────────────────────────────────────────────── */}
      {isReframing ? (
        <div className="flex min-h-[128px] flex-col justify-center gap-2.5 py-0.5" aria-live="polite">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/60">
            Reframing
          </span>
          <h1 className="text-[21px] font-semibold leading-[1.12] text-ink/70">
            {pivotLabel ?? "Finding a better fit"}
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
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                    <Users className="h-3 w-3" aria-hidden="true" />
                    Community
                  </span>
                  {isNewlyCreatedUGC && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] leading-none text-white" aria-hidden="true">
                        ✓
                      </span>
                      Added
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/65">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    Your move
                  </span>
                  {live && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Live
                    </span>
                  )}
                </>
              )}
              {lensLabel && (
                <span
                  className={`inline-flex min-w-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold leading-tight ${
                    isFallback
                      ? "border-amber-400/25 bg-amber-400/10 text-amber-700"
                      : "border-line/60 bg-background/60 text-ink/65"
                  }`}
                >
                  {lensIcon && <span aria-hidden="true">{lensIcon}</span>}
                  <span className="truncate">{lensLabel}</span>
                </span>
              )}
            </div>
          </div>

          {/* ── Title ───────────────────────────────────────────────────────── */}
          <h1 className="mt-3 text-[26px] font-semibold leading-[1.05] text-ink text-balance min-[390px]:text-[28px]">
            {object.title}
          </h1>

          {primarySupport && (
            <p className="mt-2 text-[13px] font-semibold leading-snug text-ink/54">
              {primarySupport}
            </p>
          )}

          {secondarySupport && (
            <p
              className={`mt-1.5 text-[13px] leading-snug ${
                isFallback ? "font-medium text-ink/66" : "text-ink/56"
              }`}
            >
              {secondarySupport}
            </p>
          )}

          {activeFallbackNotice && (
            <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.08] px-3 py-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/12 text-amber-700">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold leading-tight text-amber-900/85">
                  {activeFallbackNotice.label}
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-ink/65">
                  {activeFallbackNotice.detail}
                </p>
              </div>
            </div>
          )}

          {/* ── UGC rationale ───────────────────────────────────────────────── */}
          {isNewlyCreatedUGC ? (
            <div className="mt-1.5 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.06] px-3 py-2">
              <p className="text-[12.5px] font-medium leading-snug text-emerald-800">
                Saved. People nearby can now discover it.
              </p>
              {createdLocationDisplay && (
                <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-500/15 bg-surface/70 px-2.5 py-1 text-[11px] font-medium leading-tight text-ink/56">
                  <span aria-hidden="true">⌖</span>
                  <span className="min-w-0 truncate">
                    {createdLocationDisplay.primary}
                    {createdLocationDisplay.secondary && (
                      <span className="text-ink/60"> · {createdLocationDisplay.secondary}</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          ) : isUGC && !hasResolvedSupport ? (
            <p className="mt-1.5 text-[13px] leading-snug text-ink/65">
              Someone nearby recently started {object.title} here.
            </p>
          ) : null}

          {/* ── Meta chips ──────────────────────────────────────────────────── */}
          <div className="mt-4 grid grid-cols-2 gap-1.5">
            {placeMeta.map(({ key, icon: Icon, label }) => (
              <div
                key={key}
                className="flex min-h-9 min-w-0 items-center gap-2 rounded-xl border border-line/55 bg-background/70 px-2.5 py-1.5"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-ink/60" aria-hidden="true" />
                <span className="min-w-0 truncate text-[11.5px] font-semibold leading-tight text-ink/68">
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* ── Why this? ───────────────────────────────────────────────────── */}
          {(whyPrimary || whySecondary) && (
            <>
              <button
                type="button"
                onClick={() => setWhyThisOpen(true)}
                className="mt-4 flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-line/55 bg-background/70 px-3.5 py-2.5 text-left transition-colors hover:bg-surface active:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
                aria-haspopup="dialog"
                aria-expanded={whyThisOpen}
              >
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold leading-tight text-ink/78">
                    Why this?
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink/65">
                    View recommendation reasoning
                  </span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>

              <WhyThisSheet open={whyThisOpen} onClose={() => setWhyThisOpen(false)}>
                <div className="rounded-2xl border border-line/55 bg-background/70 p-3.5">
                  {whyPrimary && (
                    <p className="text-[14px] font-medium leading-snug text-ink/78">
                      {whyPrimary}
                    </p>
                  )}
                  {whySecondary && whySecondary !== whyPrimary && (
                    <p className="mt-1.5 text-[12.5px] leading-snug text-ink/52">
                      {whySecondary}
                    </p>
                  )}
                </div>
              </WhyThisSheet>
            </>
          )}

          {/* ── Confidence ──────────────────────────────────────────────────── */}
          <div className="mt-3 flex items-start gap-3 rounded-2xl border border-line/45 bg-background/70 px-3.5 py-3">
            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.10)]" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold leading-tight text-ink/72">
                {confidenceCopy.label}
              </p>
              <p className="mt-1 text-[11.5px] leading-snug text-ink/65">
                {confidenceCopy.detail}
              </p>
            </div>
          </div>
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
                className="min-h-10 flex-1 rounded-xl border border-line bg-background/70 px-3 py-2 text-sm text-ink placeholder:text-ink/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
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
              className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-1 text-left text-[13px] font-medium text-ink/65 transition-colors hover:text-ink/85 focus:outline-none focus-visible:text-ink/85"
            >
              <span>{vibeSent ? "Vibe added" : "Already here? Share the Vibe"}</span>
              <span className="text-sm" aria-hidden="true">{vibeSent ? "✓" : "+"}</span>
            </button>
          )}
        </div>
      )}

    </section>
  );
}
