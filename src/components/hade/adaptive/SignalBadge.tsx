"use client";

import { motion } from "framer-motion";
import type { SignalBadgeProps } from "@/types/hade";
import { signalTypeLabel, signalTypeHex } from "@/lib/hade/signals";

export function SignalBadge({
  type,
  strength,
  label,
  animated = false,
  className = "",
}: SignalBadgeProps) {
  const hex = signalTypeHex(type);
  const displayLabel = label ?? signalTypeLabel(type);

  return (
    <div
      className={["inline-flex items-center gap-2 rounded-full border px-3 py-1.5", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        borderColor: `${hex}30`,
        background: `${hex}0e`,
      }}
    >
      {/* Indicator dot */}
      <div className="relative shrink-0 flex items-center justify-center">
        <span
          className="block h-1.5 w-1.5 rounded-full"
          style={{ background: hex }}
        />
        {animated && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ background: hex }}
            animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </div>

      {/* Label */}
      <span
        className="text-xs font-semibold tracking-wide"
        style={{ color: hex }}
      >
        {displayLabel}
      </span>

      {/* Strength */}
      {strength !== undefined && (
        <span
          className="text-[10px] font-mono opacity-70"
          style={{ color: hex }}
        >
          {Math.round(strength * 100)}%
        </span>
      )}
    </div>
  );
}
