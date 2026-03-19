"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Signal, SignalType } from "@/types/hade";
import { signalTypeLabel, signalTypeHex } from "@/lib/hade/signals";

interface SignalFlowProps {
  signals: Signal[];
  maxVisible?: number;
  className?: string;
}

export function SignalFlow({ signals, maxVisible = 6, className = "" }: SignalFlowProps) {
  const visible = signals.slice(0, maxVisible);

  return (
    <div className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}>
      <AnimatePresence initial={false}>
        {visible.map((signal) => (
          <motion.div
            key={signal.id}
            initial={{ opacity: 0, x: -12, height: 0 }}
            animate={{ opacity: 1, x: 0, height: "auto" }}
            exit={{ opacity: 0, x: 12, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <SignalRow signal={signal} />
          </motion.div>
        ))}
      </AnimatePresence>

      {signals.length === 0 && (
        <p className="text-xs text-ink/40 text-center py-4">
          No signals yet — emit one to begin.
        </p>
      )}

      {signals.length > maxVisible && (
        <p className="text-xs text-ink/40 text-center">
          +{signals.length - maxVisible} more signals
        </p>
      )}
    </div>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const hex = signalTypeHex(signal.type);
  const label = signalTypeLabel(signal.type);
  const strengthPct = Math.round(signal.strength * 100);

  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-3 py-2.5 bg-white"
      style={{ borderColor: `${hex}30` }}
    >
      {/* Pulse dot */}
      <div className="relative shrink-0">
        <span
          className="block h-2 w-2 rounded-full"
          style={{ background: hex }}
        />
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: hex, opacity: 0.4 }}
          animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      </div>

      {/* Type label */}
      <span
        className="text-xs font-semibold shrink-0"
        style={{ color: hex }}
      >
        {label}
      </span>

      {/* Content snippet */}
      {signal.content && (
        <span className="text-xs text-ink/60 truncate flex-1">
          {signal.content}
        </span>
      )}

      {/* Strength bar */}
      <div className="shrink-0 flex items-center gap-1.5">
        <div className="w-16 h-1.5 rounded-full bg-line overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: hex }}
            initial={{ width: 0 }}
            animate={{ width: `${strengthPct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        <span className="text-[10px] font-mono text-ink/40">{strengthPct}%</span>
      </div>
    </div>
  );
}
