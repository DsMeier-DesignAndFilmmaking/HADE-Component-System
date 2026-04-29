"use client";

import { motion } from "framer-motion";
import type { LocationNode, SpontaneousObject, VibeTag } from "@/types/hade";
import { HadeCard } from "@/components/hade/layout/HadeCard";
import { HadeButton } from "@/components/hade/buttons/HadeButton";
import { HadeHeading } from "@/components/hade/typography/HadeHeading";
import { HadeText } from "@/components/hade/typography/HadeText";

interface DecisionCardProps {
  object: SpontaneousObject;
  locationNode?: LocationNode;
  distanceText?: string;
  onGoing?: () => void;
  onMaybe?: () => void;
  onNotThis?: () => void;
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

// ─── Component ────────────────────────────────────────────────────────────────

export function DecisionCard({
  object,
  locationNode,
  distanceText,
  onGoing,
  onMaybe,
  onNotThis,
  className = "",
}: DecisionCardProps) {
  const timeLabel = getTimeLabel(object.time_window.start);
  const goingLabel = getGoingLabel(object.going_count);
  const live = isLiveNow(object.time_window.start, object.time_window.end);
  const vibeChips = deriveVibeChips(locationNode);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={className}
    >
      <HadeCard glow={false}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">

            {/* Label row */}
            <div className="flex items-center gap-2 mb-1">
              <p className="font-mono text-xs uppercase tracking-widest text-accent">
                Your move
              </p>
              {live && (
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

            {/* Time + participation */}
            <HadeText variant="caption" color="muted" className="mt-1">
              {timeLabel}
              {" · "}
              {goingLabel}
              {distanceText ? ` · ${distanceText}` : ""}
            </HadeText>

          </div>
        </div>

        {/* ── UGC vibe chips ─────────────────────────────────────────────────── */}
        {vibeChips.length > 0 && (
          <div className="mb-4 flex flex-nowrap items-center gap-2 overflow-hidden">
            {vibeChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink/70"
              >
                <span aria-hidden="true">{chip.icon}</span>
                <span>{chip.label}</span>
              </span>
            ))}
            {locationNode && locationNode.signal_count > 0 && (
              <p className="font-mono text-[10px] text-ink/30 shrink-0">
                {locationNode.signal_count} signals
              </p>
            )}
          </div>
        )}

        {/* ── CTAs ───────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-3 border-t border-line">
          <HadeButton variant="primary" size="sm" onClick={onGoing}>
            Going
          </HadeButton>
          <HadeButton variant="secondary" size="sm" onClick={onMaybe}>
            Maybe
          </HadeButton>
          <button
            type="button"
            onClick={onNotThis}
            className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink/60 transition-colors hover:text-ink"
          >
            Not This
          </button>
        </div>

      </HadeCard>
    </motion.div>
  );
}
