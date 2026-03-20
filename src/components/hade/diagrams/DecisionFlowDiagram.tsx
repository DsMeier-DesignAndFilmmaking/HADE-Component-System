"use client";

import { motion } from "framer-motion";
import type { DecisionFlowDiagramProps } from "@/types/hade";

// ─── Signal dot data ─────────────────────────────────────────────────────────

const SIGNAL_DOTS = [
  { color: "#10B981", size: 10, x: 0, y: -14, delay: 0 },
  { color: "#8B5CF6", size: 8, x: 18, y: 6, delay: 0.4 },
  { color: "#F59E0B", size: 12, x: -16, y: 10, delay: 0.8 },
  { color: "#3B82F6", size: 7, x: 22, y: -8, delay: 1.2 },
  { color: "#EC4899", size: 9, x: -10, y: -4, delay: 1.6 },
  { color: "#EF4444", size: 6, x: 8, y: 16, delay: 2.0 },
] as const;

// ─── Shared spring ───────────────────────────────────────────────────────────

const SPRING = { type: "spring" as const, stiffness: 260, damping: 24 };

// ─── Connection line ─────────────────────────────────────────────────────────

function FlowLine({ animated }: { animated: boolean }) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Desktop */}
      <div className="hidden min-[1180px]:block w-full h-px bg-border/60 relative overflow-hidden">
        {animated && (
          <motion.div
            className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-accentPrimary/25 to-transparent"
            animate={{ x: ["-2.5rem", "calc(100% + 2.5rem)"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
          />
        )}
      </div>

      {/* Mobile */}
      <div className="min-[1180px]:hidden h-8 w-px bg-border/60 relative overflow-hidden">
        {animated && (
          <motion.div
            className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-transparent via-accentPrimary/25 to-transparent"
            animate={{ y: ["-1rem", "calc(100% + 1rem)"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Node 1: Signal Field ────────────────────────────────────────────────────

function SignalField({ animated }: { animated: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: 0.1 }}
      className="flex flex-col items-center gap-5"
    >
      <div className="relative h-20 w-28 flex items-center justify-center">
        {SIGNAL_DOTS.map((dot, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{
              width: dot.size,
              height: dot.size,
              backgroundColor: dot.color,
              left: `calc(50% + ${dot.x}px)`,
              top: `calc(50% + ${dot.y}px)`,
              opacity: 0.75,
            }}
            animate={
              animated
                ? { y: [-3, 3, -3], opacity: [0.6, 0.9, 0.6] }
                : { opacity: 0.75 }
            }
            transition={{
              duration: 3.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: dot.delay,
            }}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-medium tracking-tight text-textPrimary">
          Live Signals
        </p>
        <p className="text-[11px] text-textMuted">
          Behavior · Context · Environment
        </p>
      </div>
    </motion.div>
  );
}

// ─── Node 2: HADE Engine ─────────────────────────────────────────────────────

function EngineNode({ animated }: { animated: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...SPRING, delay: 0.3 }}
      className="flex flex-col items-center"
    >
      <div className="relative">
        {animated && (
          <motion.div
            className="absolute -inset-1.5 rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(49,107,255,0.12), rgba(49,107,255,0.03))",
            }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <div className="relative mx-auto w-full max-w-[320px] rounded-2xl border border-accentPrimary/20 bg-surface px-6 py-8 shadow-glowBlue">
          <div className="flex flex-col items-center text-center gap-2">
            <span className="text-lg font-semibold tracking-tight text-textPrimary">
              HADE Engine
            </span>
            <span className="text-sm text-textMuted">
              Real-time adaptive decisioning
            </span>
            <span className="text-xs text-textMuted/60">
              Weights signals by trust + intent
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Node 3: Adaptive Experience ─────────────────────────────────────────────

function AdaptiveUINode({ animated = true }: { animated?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: 0.5 }}
      className="flex flex-col items-center gap-5 shrink-0"
    >
      <div className="relative flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-5 shadow-soft overflow-hidden">
        <motion.div
          className="flex flex-col gap-2.5"
          animate={
            animated
              ? { opacity: [1, 0, 0, 1], y: [0, -4, -4, 0] }
              : { opacity: 1 }
          }
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-accentPrimary/10 flex items-center justify-center">
              <div className="h-4 w-4 rounded bg-accentPrimary/40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="h-2 w-20 rounded-full bg-textPrimary/12" />
              <div className="h-1.5 w-14 rounded-full bg-textMuted/8" />
            </div>
          </div>

          <div className="h-7 w-full rounded-lg bg-accentPrimary/80 flex items-center justify-center">
            <div className="h-1.5 w-12 rounded-full bg-white/50" />
          </div>
        </motion.div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-medium tracking-tight text-textPrimary">
          Adaptive Experience
        </p>
        <p className="text-[11px] text-textMuted">
          UI adapts to user intent
        </p>
      </div>
    </motion.div>
  );
}

// ─── Main Diagram ────────────────────────────────────────────────────────────

function DecisionFlowDiagram({
  animated = true,
  className = "",
}: DecisionFlowDiagramProps) {
  return (
    <section
      className={[
        "w-full max-w-5xl mx-auto px-6 py-12 md:py-16",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Desktop */}
      <div className="hidden min-[1180px]:grid min-[1180px]:grid-cols-[1fr_auto_1.2fr_auto_1fr] min-[1180px]:items-center min-[1180px]:gap-10">
        <SignalField animated={animated} />
        <FlowLine animated={animated} />
        <EngineNode animated={animated} />
        <FlowLine animated={animated} />
        <AdaptiveUINode />
      </div>

      {/* Mobile / Tablet */}
      <div className="flex flex-col items-center gap-4 min-[1180px]:hidden">
        <SignalField animated={animated} />
        <FlowLine animated={animated} />
        <EngineNode animated={animated} />
        <FlowLine animated={animated} />
        <AdaptiveUINode />
      </div>
    </section>
  );
}

export default DecisionFlowDiagram;
export { DecisionFlowDiagram };