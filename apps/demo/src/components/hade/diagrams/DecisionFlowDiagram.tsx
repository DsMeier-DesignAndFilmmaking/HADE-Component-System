"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { DecisionFlowDiagramProps } from "@/types/hade";
import { useEffect, useState } from "react";

// ─── Constants & Types ───────────────────────────────────────────────────────

const SIGNAL_DOTS = [
  { color: "#10B981", size: 10, x: 0, y: -14, delay: 0 },
  { color: "#8B5CF6", size: 8, x: 18, y: 6, delay: 0.4 },
  { color: "#F59E0B", size: 12, x: -16, y: 10, delay: 0.8 },
  { color: "#3B82F6", size: 7, x: 22, y: -8, delay: 1.2 },
  { color: "#EC4899", size: 9, x: -10, y: -4, delay: 1.6 },
  { color: "#EF4444", size: 6, x: 8, y: 16, delay: 2.0 },
] as const;

type HadePhase = "HUMAN" | "ADAPTIVE" | "DECISION" | "EVOLUTION";

// ─── Node 1: Signal Field (H) ───────────────────────────────────────────────

function SignalField({ active }: { active: boolean }) {
  return (
    <motion.div className="flex flex-col items-center gap-3">
      <div className="relative h-16 w-24 flex items-center justify-center">
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
            }}
            animate={active ? { 
              scale: [1, 1.3, 1], 
              opacity: [0.4, 1, 0.4],
              y: [-4, 4, -4] 
            } : { opacity: 0.3, scale: 0.9 }}
            transition={{ duration: 2, repeat: Infinity, delay: dot.delay }}
          />
        ))}
      </div>
      <div className="flex flex-col items-center">
        <p className={`text-sm font-medium transition-colors ${active ? 'text-textPrimary' : 'text-textMuted'}`}>Live Signals</p>
        <p className="text-[9px] font-mono uppercase tracking-widest text-textMuted/40">Phase: Human</p>
      </div>
    </motion.div>
  );
}

// ─── Node 2: HADE Engine (A) ────────────────────────────────────────────────

function EngineNode({ active }: { active: boolean }) {
  return (
    <motion.div className="flex flex-col items-center">
      <div className="relative mx-auto w-full max-w-[300px] rounded-2xl border transition-colors bg-surface px-6 py-6 h-[80px] flex items-center justify-center"
        style={{ borderColor: active ? 'var(--accent-primary)' : 'var(--border)' }}
      >
        <AnimatePresence>
          {active && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute -inset-1 rounded-2xl bg-accentPrimary/5 animate-pulse" 
            />
          )}
        </AnimatePresence>
        <div className="relative flex flex-col items-center text-center gap-1">
          <span className={`text-base font-semibold tracking-tight ${active ? 'text-textPrimary' : 'text-textMuted'}`}>HADE Engine</span>
          <span className="text-[10px] text-textMuted/60 font-mono">ADAPTIVE LOGIC</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Node 3: Adaptive UI (D/E) ──────────────────────────────────────────────

function AdaptiveUINode({ phase }: { phase: HadePhase }) {
  const isResolved = phase === "DECISION" || phase === "EVOLUTION";

  return (
    <motion.div className="flex flex-col items-center gap-3">
      <motion.div 
        layout
        className="relative flex flex-col gap-2.5 rounded-2xl border bg-surface p-4 shadow-soft min-w-[230px] min-h-[145px] overflow-hidden"
        animate={{
          borderColor: isResolved ? "var(--accent-primary)" : "var(--border)",
          y: isResolved ? 0 : 3,
          opacity: isResolved || phase === "ADAPTIVE" ? 1 : 0.5
        }}
      >
        <AnimatePresence mode="wait">
          {!isResolved ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-2.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded bg-textPrimary/5 animate-pulse" />
                <div className="h-2 w-20 rounded-full bg-textPrimary/10 animate-pulse" />
              </div>
              <div className="h-8 w-full rounded-lg bg-textPrimary/5 animate-pulse" />
              <div className="h-1.5 w-1/2 rounded-full bg-textPrimary/5 animate-pulse" />
            </motion.div>
          ) : (
            <motion.div 
              key="resolved"
              initial={{ opacity: 0, scale: 0.98 }} 
              animate={{ opacity: 1, scale: 1 }} 
              className="space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-accentPrimary animate-ping" />
                  <span className="text-[9px] font-mono font-bold text-accentPrimary uppercase">Optimal Match</span>
                </div>
                <span className="text-[9px] font-mono text-textMuted">98% Match</span>
              </div>
              
              <div>
                <div className="h-3.5 w-28 bg-textPrimary rounded-sm mb-1" />
                <div className="h-1.5 w-full bg-textMuted/20 rounded-full" />
              </div>

              <motion.button 
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full py-1.5 bg-accentPrimary text-white text-[9px] font-bold uppercase tracking-tighter rounded-md"
              >
                Confirm Choice
              </motion.button>

              {phase === "EVOLUTION" && (
                <motion.div 
                  initial={{ opacity: 0, y: 3 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="pt-1.5 border-t border-border/50"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[7px] font-mono text-accentSecondary uppercase leading-none">Feedback Loop</span>
                  </div>
                  <div className="h-1 w-full bg-accentSecondary/20 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-accentSecondary" 
                      initial={{ width: 0 }} 
                      animate={{ width: "100%" }}
                      transition={{ duration: 2 }}
                    />
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <p className={`text-sm font-medium transition-colors ${isResolved ? 'text-textPrimary' : 'text-textMuted'}`}>
        Adaptive UX & UI
      </p>
    </motion.div>
  );
}

// ─── Main Controller ─────────────────────────────────────────────────────────

export function DecisionFlowDiagram({ className = "" }: DecisionFlowDiagramProps) {
  const [phase, setPhase] = useState<HadePhase>("HUMAN");

  useEffect(() => {
    const timer = setInterval(() => {
      setPhase(p => {
        if (p === "HUMAN") return "ADAPTIVE";
        if (p === "ADAPTIVE") return "DECISION";
        if (p === "DECISION") return "EVOLUTION";
        return "HUMAN";
      });
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className={`w-full max-w-7xl mx-auto px-6 py-8 ${className}`}>
      {/* HUD Status Bar - Tightened margin */}
      <div className="flex justify-center gap-3 mb-8">
        {["HUMAN", "ADAPTIVE", "DECISION", "EVOLUTION"].map((p) => (
          <div key={p} className="flex flex-col items-center gap-1.5">
            <div className={`h-1 w-10 rounded-full transition-colors duration-500 ${phase === p ? 'bg-accentPrimary' : 'bg-border'}`} />
            <span className={`text-[9px] font-bold font-mono ${phase === p ? 'text-textPrimary' : 'text-textMuted/40'}`}>{p}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 min-[1180px]:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-8 min-h-[240px]">
        <SignalField active={phase === "HUMAN"} />
        <div className="hidden min-[1180px]:block h-px w-full bg-border" />
        <EngineNode active={phase === "ADAPTIVE"} />
        <div className="hidden min-[1180px]:block h-px w-full bg-border" />
        <AdaptiveUINode phase={phase} />
      </div>

      {/* Footer Text - Tightened margin */}
      <div className="mt-8 text-center h-6 flex items-center justify-center">
        {/* Footer Text Updates */}
<AnimatePresence mode="wait">
  <motion.p 
    key={phase}
    initial={{ opacity: 0, y: 3 }} 
    animate={{ opacity: 1, y: 0 }} 
    exit={{ opacity: 0, y: -3 }}
    className="text-[11px] text-textMuted font-mono uppercase tracking-widest"
  >
    {phase === "HUMAN" && "Step 1: Normalizing Ingested Telemetry"}
    {phase === "ADAPTIVE" && "Step 2: Resolving Signal Collisions"}
    {phase === "DECISION" && "Step 3: Generating Terminal Inference"}
    {phase === "EVOLUTION" && "Step 4: Synchronizing Feedback Loop"}
  </motion.p>
</AnimatePresence>
      </div>
    </section>
  );
}

export default DecisionFlowDiagram;