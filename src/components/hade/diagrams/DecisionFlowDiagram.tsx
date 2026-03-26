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

const SPRING = { type: "spring" as const, stiffness: 260, damping: 24 };
type HadePhase = "HUMAN" | "ADAPTIVE" | "DECISION" | "EVOLUTION";

// ─── Node 1: Signal Field (H) ───────────────────────────────────────────────

function SignalField({ active }: { active: boolean }) {
  return (
    <motion.div className="flex flex-col items-center gap-5">
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
            }}
            animate={active ? { 
              scale: [1, 1.3, 1], 
              opacity: [0.4, 1, 0.4],
              y: [-5, 5, -5] 
            } : { opacity: 0.3, scale: 0.9 }}
            transition={{ duration: 2, repeat: Infinity, delay: dot.delay }}
          />
        ))}
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className={`text-sm font-medium transition-colors ${active ? 'text-textPrimary' : 'text-textMuted'}`}>Live Signals</p>
        <p className="text-[10px] font-mono uppercase tracking-widest text-textMuted/40">Phase: Human</p>
      </div>
    </motion.div>
  );
}

// ─── Node 2: HADE Engine (A) ────────────────────────────────────────────────

function EngineNode({ active }: { active: boolean }) {
  return (
    <motion.div className="flex flex-col items-center">
      <div className="relative mx-auto w-full max-w-[320px] rounded-2xl border transition-colors bg-surface px-6 py-8"
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
        <div className="relative flex flex-col items-center text-center gap-2">
          <span className={`text-lg font-semibold tracking-tight ${active ? 'text-textPrimary' : 'text-textMuted'}`}>HADE Engine</span>
          <span className="text-xs text-textMuted/60 font-mono">ADAPTIVE LOGIC WEIGHTING</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Node 3: Adaptive UI (D/E) ──────────────────────────────────────────────

function AdaptiveUINode({ phase }: { phase: HadePhase }) {
  return (
    <motion.div className="flex flex-col items-center gap-4">
      <motion.div 
        layout
        className="relative flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-soft min-w-[220px]"
        animate={{
          borderColor: (phase === "DECISION" || phase === "EVOLUTION") ? "var(--accent-primary)" : "var(--border)",
          y: (phase === "DECISION" || phase === "EVOLUTION") ? 0 : 5,
          opacity: (phase === "DECISION" || phase === "EVOLUTION") ? 1 : 0.5
        }}
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-accentPrimary/10 flex items-center justify-center">
             <div className="h-4 w-4 rounded-sm bg-accentPrimary/40" />
          </div>
          <div className="h-2 w-20 rounded-full bg-textPrimary/10" />
        </div>
        <motion.div 
          className="h-8 w-full rounded-lg"
          animate={{ backgroundColor: phase === "DECISION" ? "var(--accent-primary)" : "var(--surface-sunken)" }}
        />
        {phase === "EVOLUTION" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="pt-2 border-t border-border/50">
            <div className="h-1 w-full bg-accentSecondary/20 rounded-full overflow-hidden">
               <motion.div className="h-full bg-accentSecondary" initial={{ width: 0 }} animate={{ width: "80%" }} />
            </div>
          </motion.div>
        )}
      </motion.div>
      <p className={`text-sm font-medium ${phase === "DECISION" ? 'text-textPrimary' : 'text-textMuted'}`}>Adaptive UX & UI</p>
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
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className={`w-full max-w-7xl mx-auto px-6 py-12 ${className}`}>
      {/* Framework Status HUD - Persistent Top Bar */}
      <div className="flex justify-center gap-4 mb-12">
        {["HUMAN", "ADAPTIVE", "DECISION", "EVOLUTION"].map((p) => (
          <div key={p} className="flex flex-col items-center gap-2">
            <div className={`h-1 w-12 rounded-full transition-colors duration-500 ${phase === p ? 'bg-accentPrimary' : 'bg-border'}`} />
            <span className={`text-[10px] font-bold font-mono ${phase === p ? 'text-textPrimary' : 'text-textMuted/40'}`}>{p}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 min-[1180px]:grid-cols-[1fr_auto_1.2fr_auto_1fr] items-center gap-10">
        <SignalField active={phase === "HUMAN"} />
        <div className="hidden min-[1180px]:block h-px w-full bg-border" />
        <EngineNode active={phase === "ADAPTIVE"} />
        <div className="hidden min-[1180px]:block h-px w-full bg-border" />
        <AdaptiveUINode phase={phase} />
      </div>

      <div className="mt-12 text-center h-6">
        <AnimatePresence mode="wait">
          <motion.p 
            key={phase}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-xs text-textMuted font-mono uppercase tracking-widest"
          >
            {phase === "HUMAN" && "Step 1: Ingesting environmental & behavioral signals"}
            {phase === "ADAPTIVE" && "Step 2: Weighting context via situational logic"}
            {phase === "DECISION" && "Step 3: Rendering opinionated rationale-based UI"}
            {phase === "EVOLUTION" && "Step 4: Measuring impact & iterating logic"}
          </motion.p>
        </AnimatePresence>
      </div>
    </section>
  );
}

export default DecisionFlowDiagram;