"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type {
  AdaptiveButtonProps,
  ComponentSize,
  Intent,
  Urgency,
} from "@/types/hade";

const urgencyClasses: Record<Urgency, string> = {
  low: "border border-line bg-white text-ink hover:bg-surface",
  medium:
    "border border-accent bg-accent text-white hover:bg-accent/90 shadow-glowBlue/25",
  high:
    "border border-cyberLime/45 bg-cyberLime text-ink hover:bg-cyberLime/90 shadow-glow",
};

const sizeClasses: Record<ComponentSize, string> = {
  sm: "px-4 py-2 text-sm",
  default: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
};

const intentLabels: Record<Intent, string> = {
  eat: "Find Food",
  drink: "Find Drinks",
  chill: "Find Chill Spots",
  scene: "See the Scene",
  anything: "Explore Options",
};

const springTransition = {
  type: "spring" as const,
  stiffness: 400,
  damping: 20,
};

export function AdaptiveButton({
  signal,
  label,
  href,
  onClick,
  disabled = false,
  loading = false,
  size = "default",
  className = "",
  children,
}: AdaptiveButtonProps) {
  const isDisabled = disabled || loading;
  const showPulseRing = signal.urgency === "high" && !isDisabled;

  const baseClasses =
    "relative inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-tight transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent select-none";

  const classes = [
    baseClasses,
    urgencyClasses[signal.urgency],
    sizeClasses[size],
    isDisabled ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const resolvedLabel = label ?? intentLabels[signal.intent];
  const displayContent = children ?? resolvedLabel;

  const content = loading ? (
    <>
      <svg
        className="h-4 w-4 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {displayContent}
    </>
  ) : (
    displayContent
  );

  if (href) {
    return (
      <motion.div
        className="relative inline-flex"
        whileHover={{ scale: isDisabled ? 1 : 1.02 }}
        whileTap={{ scale: isDisabled ? 1 : 0.97 }}
        transition={springTransition}
      >
        {showPulseRing && (
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-xl border border-cyberLime/70"
            animate={{ scale: [1, 1.2], opacity: [0.45, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <Link
          href={href}
          className={classes}
          onClick={onClick}
          aria-disabled={isDisabled}
          tabIndex={isDisabled ? -1 : 0}
        >
          {content}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      className={classes}
      disabled={isDisabled}
      onClick={onClick}
      whileHover={{ scale: isDisabled ? 1 : 1.02 }}
      whileTap={{ scale: isDisabled ? 1 : 0.97 }}
      transition={springTransition}
    >
      {showPulseRing && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-xl border border-cyberLime/70"
          animate={{ scale: [1, 1.2], opacity: [0.45, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className="relative z-[1] inline-flex items-center gap-2">{content}</span>
    </motion.button>
  );
}
