"use client";

import { useState } from "react";
import { type Variants, motion } from "framer-motion";
import type { LocationNode, SpontaneousObject, VibeTag } from "@/types/hade";
import { HadeCard } from "@/components/hade/layout/HadeCard";
import { HadeButton } from "@/components/hade/buttons/HadeButton";
import { HadeHeading } from "@/components/hade/typography/HadeHeading";
import { HadeText } from "@/components/hade/typography/HadeText";
import { computeTemporalState, TEMPORAL_COPY, getActiveForCopy } from "@/lib/hade/ugcCopy";
import { getNavigationUrl } from "@/lib/hade/navigation";
import { recordNavigationTelemetry } from "@/lib/hade/navigationTelemetry";

interface DecisionCardProps {
  object: SpontaneousObject;
  locationNode?: LocationNode;
  distanceText?: string;
  onGoing?: () => void;
  onMaybe?: () => void;
  onNotThis?: () => void;
  /** When true, replaces card content with the reframing microcopy. */
  isReframing?: boolean;
  /** Shown below the reframing headline — e.g. "Adjusting for: Too far" */
  pivotLabel?: string;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeLabel(start: number): string {
  const now = Date.now();
  if (start <= now) return "Happening now";
  const minutes = Math.max(1, Math.ceil((start - now) / 60_000));
  return `Starting in ${minutes} min`;
}

function getGoingLabel(count: number): string {
  return count === 1 ? "1 person going" : `${count} people going`;
}

function isLiveNow(start: number, end: number): boolean {
  const now = Date.now();
  return start <= now && now < end;
}

function formatVibeTag(tag: string): { label: string; icon: string } {
  switch (tag) {
    case "perfect_vibe":
    case "good_energy":
      return { label: "Good energy", icon: "🔥" };
    case "too_crowded":
      return { label: "Crowded", icon: "⚠️" };
    case "quiet":
      return { label: "Chill", icon: "😌" };
    case "dead":
      return { label: "Low energy", icon: "😐" };
    default:
      return { label: tag, icon: "•" };
  }
}

function deriveVibeChips(locationNode?: LocationNode) {
  if (!locationNode || locationNode.signal_count <= 1) return [];
  const updatedAt = new Date(locationNode.last_updated).getTime();
  if (!Number.isFinite(updatedAt) || Date.now() - updatedAt >= 2 * 60 * 60 * 1000) return [];
  const entries = Object.entries(locationNode.weight_map) as Array<[VibeTag, number]>;
  if (entries.length === 0) return [];
  const positive = [...entries].filter(([, w]) => w > 0.6).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const negative = [...entries].filter(([, w]) => w < 0.4).sort((a, b) => a[1] - b[1]).slice(0, 1);
  return [...positive, ...negative].slice(0, 3).map(([tag]) => {
    const { label, icon } = formatVibeTag(tag);
    return { key: tag, label, icon };
  });
}

function getUGCTemporalCopy(object: SpontaneousObject): string | null {
  try {
    const activeFor = getActiveForCopy(object.expires_at);
    if (activeFor) return activeFor;
    const state = computeTemporalState(
      new Date(object.expires_at).toISOString(),
      new Date(object.created_at).toISOString(),
    );
    return state !== "suppressed" ? TEMPORAL_COPY[state] : null;
  } catch {
    return null;
  }
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function getPlatformLabel(): string {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

// ─── Animation variants ───────────────────────────────────────────────────────

const chipContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const chipItemVariants: Variants = {
  hidden:   { opacity: 0, scale: 0.8 },
  visible:  { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 500, damping: 28 } },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function DecisionCard({
  object,
  locationNode,
  distanceText,
  onGoing,
  onMaybe,
  onNotThis,
  isReframing = false,
  pivotLabel,
  className = "",
}: DecisionCardProps) {
  const [openingMaps, setOpeningMaps] = useState(false);
  const [navigationIssue, setNavigationIssue] = useState<string | null>(null);
  const isUGC = object.type === "ugc_event";

  const timeLabel  = isUGC
    ? (getUGCTemporalCopy(object) ?? getTimeLabel(object.time_window.start))
    : getTimeLabel(object.time_window.start);
  const goingLabel = getGoingLabel(object.going_count);
  const live       = isLiveNow(object.time_window.start, object.time_window.end);
  const vibeChips  = deriveVibeChips(locationNode);
  const showCommunityBadge = (locationNode?.trust_score ?? 0) > 0.5 || vibeChips.length > 0;
  const launchNavigation = () => {
    const lat = object.location.lat;
    const lng = object.location.lng;
    const coordinatesValid = isValidCoordinate(lat, lng);
    const url = getNavigationUrl(lat, lng, object.title);
    const platform = getPlatformLabel();

    setNavigationIssue(null);
    setOpeningMaps(true);
    console.log("[HADE NAV]", {
      platform,
      url,
      coordinatesValid,
      lat,
      lng,
      execution: "starting",
    });

    try {
      onGoing?.();
    } catch (error) {
      console.warn("[HADE NAV]", {
        platform,
        url,
        coordinatesValid,
        execution: "telemetry_callback_failed",
        error,
      });
    }

    if (!coordinatesValid) {
      console.warn("[HADE NAV]", {
        platform,
        url,
        coordinatesValid,
        execution: "blocked_invalid_coordinates",
      });
      setOpeningMaps(false);
      setNavigationIssue("I cannot open maps yet because this pick does not have a usable location.");
      return;
    }

    recordNavigationTelemetry({
      objectId: object.id,
      title: object.title,
      lat,
      lng,
      url,
      platform,
      coordinatesValid,
    });

    console.log("[HADE NAV]", {
      platform,
      url,
      coordinatesValid,
      execution: "window.open(_self)",
    });
    window.open(url, "_self");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={className}
    >
      <HadeCard glow={false} className="rounded-[24px] border-line/70 p-4 shadow-panel min-[390px]:p-5">

        {/* ── Reframing overlay ─────────────────────────────────────────────── */}
        {isReframing ? (
          <div className="flex min-h-[132px] flex-col justify-center gap-2.5 py-1" aria-live="polite" aria-busy="true">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/60">
              Reframing
            </p>
            <HadeHeading level={3} className="text-[22px] leading-tight text-ink/65">
              Finding a better fit...
            </HadeHeading>
            {pivotLabel && (
              <span className="inline-flex w-fit items-center rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-[11px] font-semibold text-accentReadable">
                {pivotLabel}
              </span>
            )}
          </div>
        ) : (
          <>
            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">

                {/* Label row */}
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {isUGC ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accentReadable">
                      <span aria-hidden="true">👥</span>
                      Community Meetup
                    </span>
                  ) : (
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/60">
                      Your move
                    </p>
                  )}
                  {!isUGC && live && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-green-600">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"
                        aria-hidden="true"
                      />
                      live
                    </span>
                  )}
                </div>

                {/* Title */}
                <HadeHeading level={3} className="text-[26px] leading-[1.05] text-balance">
                  {object.title}
                </HadeHeading>

                {/* UGC rationale */}
                {isUGC && (
                  <p className="mt-2 text-[13px] leading-snug text-ink/56">
                    Someone nearby recently started {object.title} here.
                  </p>
                )}

                {/* Time + participation */}
                <HadeText variant="caption" color="muted" className="mt-2 text-[12px] font-medium">
                  {timeLabel}
                  {" · "}
                  {goingLabel}
                  {distanceText ? ` · ${distanceText}` : ""}
                </HadeText>

              </div>
            </div>

            {/* ── Community Signal & UGC Vibe Chips ──────────────────────── */}
            {showCommunityBadge && (
              <div className="mb-5 rounded-2xl border border-line/55 bg-background/70 p-3.5">

                {/* Pulsing community validation badge */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
                    aria-hidden="true"
                  />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/60">
                    Local context
                  </p>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-ink/56">
                  Recent local feedback makes this feel more promising than a static listing.
                </p>

                {/* Stagger-in chip row — only rendered when chips exist */}
                {vibeChips.length > 0 && (
                  <motion.div
                    variants={chipContainerVariants}
                    initial="hidden"
                    animate="visible"
                    className="mt-3 flex flex-nowrap items-center gap-2 overflow-hidden"
                  >
                    {vibeChips.map((chip) => (
                      <motion.span
                        key={chip.key}
                        variants={chipItemVariants}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line/70 bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink/70"
                      >
                        <span aria-hidden="true">{chip.icon}</span>
                        <span>{chip.label}</span>
                      </motion.span>
                    ))}
                    {locationNode && locationNode.signal_count > 0 && (
                      <motion.p
                        variants={chipItemVariants}
                        className="font-mono text-[10px] text-ink/60 shrink-0"
                      >
                        {locationNode.signal_count} signals
                      </motion.p>
                    )}
                  </motion.div>
                )}

              </div>
            )}

            {/* ── CTAs ─────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 border-t border-line/55 pt-4">
              <HadeButton
                variant="primary"
                size="sm"
                onClick={launchNavigation}
                loading={openingMaps}
                className="min-h-11 flex-1 rounded-2xl"
              >
                {openingMaps ? "Opening Maps..." : "Open in Maps"}
              </HadeButton>
              <HadeButton variant="secondary" size="sm" onClick={onMaybe} className="min-h-11 rounded-2xl">
                Maybe
              </HadeButton>
              <button
                type="button"
                onClick={onNotThis}
                className="ml-auto min-h-11 rounded-2xl border border-line/70 bg-surface px-3 py-1.5 text-xs font-semibold text-ink/65 transition-colors hover:text-ink"
              >
                Not This
              </button>
            </div>
            {navigationIssue && (
              <p role="status" className="mt-2 text-[12px] leading-snug text-ink/65">
                {navigationIssue}
              </p>
            )}
          </>
        )}

      </HadeCard>
    </motion.div>
  );
}
