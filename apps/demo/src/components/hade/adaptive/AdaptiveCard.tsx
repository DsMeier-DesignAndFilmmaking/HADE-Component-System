"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import type { AdaptiveCardProps, UserSignalMode } from "@/types/hade";
import { AdaptiveButton } from "./AdaptiveButton";
import { ContextSignalBadge } from "./ContextSignalBadge";

const hoverScaleByMode: Record<UserSignalMode, number> = {
  explore: 1.01,
  compare: 1.01,
  book: 1.02,
};

const modeCardClasses: Record<UserSignalMode, string> = {
  explore:
    "border border-accent/25 bg-gradient-to-b from-white to-accentSoft/25 shadow-soft",
  compare: "border border-line bg-white shadow-soft",
  book:
    "border border-cyberLime/40 bg-gradient-to-b from-white to-cyberLime/15 shadow-glow",
};

const modeEyebrow: Record<UserSignalMode, string> = {
  explore: "Discovery Mode",
  compare: "Comparison Mode",
  book: "Booking Mode",
};

const modeDefaultCta: Record<UserSignalMode, string> = {
  explore: "Keep Exploring",
  compare: "Compare In Detail",
  book: "Book Now",
};

const contentVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

function fallbackMetrics(
  title: string,
  signal: AdaptiveCardProps["signal"]
): Array<{ label: string; value: string }> {
  return [
    { label: "Title", value: title },
    { label: "Intent", value: signal.intent },
    { label: "Urgency", value: signal.urgency },
    { label: "Mode", value: signal.mode },
  ];
}

export function AdaptiveCard({
  signal,
  title,
  image,
  metrics,
  ctaLabel,
  ctaHref,
  onCtaClick,
  className = "",
  children,
}: AdaptiveCardProps) {
  const resolvedCtaLabel = ctaLabel ?? modeDefaultCta[signal.mode];
  const compareMetrics = metrics?.length ? metrics : fallbackMetrics(title, signal);

  return (
    <motion.div
      layout
      whileHover={{ scale: hoverScaleByMode[signal.mode] }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={[
        "overflow-hidden rounded-3xl p-5 md:p-6",
        modeCardClasses[signal.mode],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[14rem] flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/55">
            {modeEyebrow[signal.mode]}
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-ink">{title}</h3>
        </div>

        <ContextSignalBadge
          signal={signal}
          animated={signal.urgency !== "low"}
          showContext={Boolean(signal.context)}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {signal.mode === "explore" && (
          <motion.div
            key="explore"
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="mb-4 overflow-hidden rounded-2xl border border-accent/25 bg-accentSoft/35"
          >
            {image ? (
              <img
                src={image}
                alt={`${title} preview`}
                className="h-44 w-full object-cover md:h-52"
              />
            ) : (
              <div className="h-44 w-full bg-gradient-to-br from-accent/25 via-accentSoft to-white md:h-52" />
            )}
            <div className="border-t border-accent/20 px-4 py-3 text-sm text-ink/70">
              Swipe the surface, skim the vibe, and move forward when it clicks.
            </div>
          </motion.div>
        )}

        {signal.mode === "compare" && (
          <motion.div
            key="compare"
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="mb-4 grid grid-cols-2 gap-2"
          >
            {compareMetrics.slice(0, 6).map((metric, index) => (
              <div
                key={`${metric.label}-${index}`}
                className="rounded-xl border border-line bg-surface/70 px-3 py-2"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/55">
                  {metric.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">{metric.value}</p>
              </div>
            ))}
          </motion.div>
        )}

        {signal.mode === "book" && (
          <motion.div
            key="book"
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="mb-4 rounded-2xl border border-cyberLime/40 bg-cyberLime/20 px-4 py-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/55">
              Action Ready
            </p>
            <p className="mt-1 text-lg font-bold text-ink">
              Time-sensitive choice. Secure this now.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {children && <div className="mb-4">{children}</div>}

      <div className="flex">
        <AdaptiveButton
          signal={signal}
          label={resolvedCtaLabel}
          href={ctaHref}
          onClick={onCtaClick}
          size={signal.mode === "book" ? "lg" : "default"}
          className={signal.mode === "book" ? "w-full" : ""}
        />
      </div>
    </motion.div>
  );
}
