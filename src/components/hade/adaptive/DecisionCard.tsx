"use client";

import { type Variants, motion } from "framer-motion";
import type { LocationNode, SpontaneousObject, VibeTag } from "@/types/hade";
import { HadeCard } from "@/components/hade/layout/HadeCard";
import { HadeButton } from "@/components/hade/buttons/HadeButton";
import { HadeHeading } from "@/components/hade/typography/HadeHeading";
import { HadeText } from "@/components/hade/typography/HadeText";
import { computeTemporalState, TEMPORAL_COPY, getActiveForCopy } from "@/lib/hade/ugcCopy";

interface DecisionCardProps {
  object: SpontaneousObject;
  locationNode?: LocationNode;
  distanceText?: string;
  onGoing?: () => void;
  onMaybe?: () => void;
  onNotThis?: () => void;
  /** Called when user taps "Join" on a ugc_event card (strong intent signal). */
  onJoin?: () => void;
  /** Called when user taps "I'm Interested" on a ugc_event card (light intent signal). */
  onInterested?: () => void;
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
  onJoin,
  onInterested,
  isReframing = false,
  pivotLabel,
  className = "",
}: DecisionCardProps) {
  const isUGC = object.type === "ugc_event";

  const timeLabel  = isUGC
    ? (getUGCTemporalCopy(object) ?? getTimeLabel(object.time_window.start))
    : getTimeLabel(object.time_window.start);
  const goingLabel = getGoingLabel(object.going_count);
  const live       = isLiveNow(object.time_window.start, object.time_window.end);
  const vibeChips  = deriveVibeChips(locationNode);
  const showCommunityBadge = (locationNode?.trust_score ?? 0) > 0.5 || vibeChips.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={className}
    >
      <HadeCard glow={false}>

        {/* ── Reframing overlay ─────────────────────────────────────────────── */}
        {isReframing ? (
          <div className="flex flex-col gap-2 py-2" aria-live="polite" aria-busy="true">
            <p className="font-mono text-xs uppercase tracking-widest text-accent/60">
              Reframing...
            </p>
            <HadeHeading level={3} className="text-ink/40">
              Reframing based on your feedback...
            </HadeHeading>
            {pivotLabel && (
              <span className="inline-flex w-fit items-center rounded-full border border-accent/20 bg-accent/5 px-3 py-1 font-mono text-[11px] text-accent">
                {pivotLabel}
              </span>
            )}
          </div>
        ) : (
          <>
            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0">

                {/* Label row */}
                <div className="flex items-center gap-2 mb-1">
                  {isUGC ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-accent">
                      <span aria-hidden="true">👥</span>
                      Community Meetup
                    </span>
                  ) : (
                    <p className="font-mono text-xs uppercase tracking-widest text-accent">
                      Your move
                    </p>
                  )}
                  {!isUGC && live && (
                    <span className="inline-flex items-center gap-1 rounded bg-green-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider font-semibold text-green-400">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"
                        aria-hidden="true"
                      />
                      live
                    </span>
                  )}
                </div>

                {/* Title */}
                <HadeHeading level={3}>{object.title}</HadeHeading>

                {/* UGC rationale */}
                {isUGC && (
                  <p className="mt-1 text-xs text-ink/50">
                    A HADE user recently started a {object.title} here.
                  </p>
                )}

                {/* Time + participation */}
                <HadeText variant="caption" color="muted" className="mt-1">
                  {timeLabel}
                  {" · "}
                  {goingLabel}
                  {distanceText ? ` · ${distanceText}` : ""}
                </HadeText>

              </div>
            </div>

            {/* ── Community Signal & UGC Vibe Chips ──────────────────────── */}
            {showCommunityBadge && (
              <div className="mb-4 flex flex-col gap-2">

                {/* Pulsing community validation badge */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
                    aria-hidden="true"
                  />
                  <p className="font-mono text-[10px] uppercase tracking-widest text-ink/40">
                    Validated by community &#39;Vibe&#39; signals.
                  </p>
                </div>

                {/* Stagger-in chip row — only rendered when chips exist */}
                {vibeChips.length > 0 && (
                  <motion.div
                    variants={chipContainerVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-nowrap items-center gap-2 overflow-hidden"
                  >
                    {vibeChips.map((chip) => (
                      <motion.span
                        key={chip.key}
                        variants={chipItemVariants}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink/70"
                      >
                        <span aria-hidden="true">{chip.icon}</span>
                        <span>{chip.label}</span>
                      </motion.span>
                    ))}
                    {locationNode && locationNode.signal_count > 0 && (
                      <motion.p
                        variants={chipItemVariants}
                        className="font-mono text-[10px] text-ink/30 shrink-0"
                      >
                        {locationNode.signal_count} signals
                      </motion.p>
                    )}
                  </motion.div>
                )}

              </div>
            )}

            {/* ── CTAs ─────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 pt-3 border-t border-line">
              {isUGC ? (
                <>
                  <HadeButton variant="primary" size="sm" onClick={onJoin ?? onGoing}>
                    Join
                  </HadeButton>
                  <HadeButton variant="secondary" size="sm" onClick={onInterested ?? onMaybe}>
                    I'm Interested
                  </HadeButton>
                </>
              ) : (
                <>
                  <HadeButton variant="primary" size="sm" onClick={onGoing}>
                    Let's Go
                  </HadeButton>
                  <HadeButton variant="secondary" size="sm" onClick={onMaybe}>
                    Maybe
                  </HadeButton>
                </>
              )}
              <button
                type="button"
                onClick={onNotThis}
                className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink/60 transition-colors hover:text-ink"
              >
                Not This
              </button>
            </div>
          </>
        )}

      </HadeCard>
    </motion.div>
  );
}
