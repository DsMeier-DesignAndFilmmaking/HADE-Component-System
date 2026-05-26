"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

export default function AgenticOrchestrationDiagram({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Restore the specific cinematic scroll-link ratios
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  // These specific ranges (0 to 0.4) ensure the animation completes 
  // early in the scroll so the user sees the final state clearly.
  const letterSpacing = useTransform(scrollYProgress, [0, 0.4], ["0.8em", "0.2em"]);
  const headerOpacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
  const headerY = useTransform(scrollYProgress, [0, 0.4], [30, 0]);

  const stackVars = {
    initial: { opacity: 0, y: 20 },
    animate: { 
      opacity: 1, 
      y: 0, 
      transition: { staggerChildren: 0.15, delayChildren: 0.4 } 
    }
  };

  return (
    <section 
      ref={containerRef}
      className={`relative overflow-hidden bg-[#050505] py-32 text-white rounded-[2.5rem] my-12 border border-white/5 ${className || ''}`}
    >
      <div className="relative mx-auto max-w-7xl px-6">
        
        {/* Cinematic Header - Animation Restored */}
        <motion.div style={{ opacity: headerOpacity, y: headerY }} className="mb-24 text-center">
          <motion.h2 
            style={{ letterSpacing }}
            className="mb-6 font-mono text-[10px] uppercase text-blue-500 leading-none"
          >
            Agentic Stratum
          </motion.h2>
          <h3 className="mx-auto max-w-4xl text-5xl font-light tracking-tight md:text-6xl text-white">
            Concurrent <span className="italic font-serif text-blue-400">Multi-Agent</span>{" "}
            <span className="whitespace-nowrap">Stack</span>
            </h3>
        </motion.div>

        {/* Multi-Agentic Workforce Layer */}
        <div className="relative flex flex-col items-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            className="relative z-20 mb-20"
          >
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-blue-500/20 bg-black/50 backdrop-blur-3xl shadow-[0_0_50px_rgba(59,130,246,0.1)]">
               <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full border-t border-blue-500/40" 
              />
              <div className="text-center">
                <span className="block text-[10px] font-mono font-bold tracking-widest text-blue-500 uppercase">HADE</span>
                <span className="block text-[7px] font-mono text-white/30 uppercase">Orchestrator</span>
              </div>
            </div>
            <div className="absolute top-full left-1/2 h-20 w-px bg-gradient-to-b from-blue-500/40 to-transparent -translate-x-1/2" />
          </motion.div>

          <motion.div 
            variants={stackVars}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="grid grid-cols-1 gap-6 md:grid-cols-3 w-full max-w-6xl"
          >          
            {[
            { 
                role: "Context Ingestion Module", 
                task: "Signal Normalization", 
                desc: "Normalizes environmental signals into a machine-readable context window for real-time processing." 
            },
            { 
                role: "External State Synchronizer", 
                task: "Live API Handshake", 
                desc: "Synchronizes internal logic with external state via real-time API verification and inventory locking.", 
                active: true 
            },
            { 
                role: "Inference Aggregator", 
                task: "Rationale Resolution", 
                desc: "Aggregates agentic inferences to generate a verified rationale for the final terminal action." 
            }
            ].map((agent, i) => (
            <motion.div 
                key={i}
                variants={stackVars}
                className={`group relative p-8 rounded-xl border transition-all duration-700 ${agent.active ? 'border-blue-500/40 bg-blue-500/[0.04]' : 'border-white/5 bg-white/[0.01]'}`}
            >
                <div className="mb-6 flex items-center justify-between">
                <div className={`h-1 w-1 rounded-full ${agent.active ? 'bg-blue-400 shadow-[0_0_12px_rgba(59,130,246,1)]' : 'bg-white/20'}`} />
                <span className="font-mono text-[8px] uppercase tracking-widest text-white/40 italic">Workforce Module</span>
                </div>
                <h4 className="text-[11px] font-bold tracking-[0.2em] uppercase mb-2 text-white">{agent.role}</h4>
                <p className="font-mono text-[9px] text-blue-400/80 mb-4 uppercase font-semibold">{agent.task}</p>
                
                {/* ACCESSIBILITY FIX: Changed from text-white/40 to text-zinc-400 */}
                <p className="text-sm text-zinc-400 font-light leading-relaxed">
                {agent.desc}
                </p>
            </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Re-restored Tight Left-Aligned Footer */}
        <div className="mt-32 max-w-5xl mx-auto grid grid-cols-2 gap-y-12 gap-x-8 border-t border-white/10 pt-12 md:grid-cols-4">
          {[
            { label: "Execution Throughput", value: "140ms" },
            { label: "Optimization Path", value: "Recursive" },
            { label: "State Synchronization", value: "Synchronous" },
            { label: "Verifiable Certainty", value: "99.2%", highlight: true },
          ].map((stat, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + (i * 0.1) }}
              className="flex flex-col items-start gap-1"
            >
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30 leading-none">
                {stat.label}
              </span>
              <span className={`text-3xl md:text-4xl font-extralight tracking-tighter text-white leading-none ${stat.highlight ? 'text-blue-500' : ''}`}>
                {stat.value}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}