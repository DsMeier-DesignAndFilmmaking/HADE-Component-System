"use client";

import Link from "next/link";
import { motion } from "framer-motion"; // Added missing import
import { Layout } from "@/components/layout";
import DecisionFlowDiagram from "@/components/hade/diagrams/DecisionFlowDiagram";
import AgenticOrchestrationDiagram from "@/components/hade/diagrams/AgenticOrchestrationDiagram";
import { HadeButton } from "@/components/hade/buttons/HadeButton";

const HADE_LAYERS = [
  {
    letter: "H",
    color: "#316BFF",
    title: "Human Signal Mapping",
    description: "Ingests asynchronous telemetry—spatial, environmental, and behavioral—to define the initial system state.",
  },
  {
    letter: "A",
    color: "#2563EB",
    title: "Adaptive Logic Architecture",
    description: "Applies dynamic weighting and confidence scoring to normalize high-variance signal inputs.",
  },
  {
    letter: "D",
    color: "#0F766E",
    title: "Decision Layer Orchestration",
    description: "Executes collision resolution to resolve complex multi-modal inputs into a singular, high-trust terminal output.",
  },
  {
    letter: "E",
    color: "#F59E0B",
    title: "Experiment + Evolution",
    description: "A closed-loop telemetry sink that feeds edge-case data back into the logic engine for recursive optimization.",
  },
];

const NAV_LINKS = [
  { href: "/demo", label: "Interactive Demo", description: "Emit signals and generate decisions" },
  { href: "/components", label: "Components", description: "Browse the full component library" },
  { href: "/docs", label: "Docs", description: "Types, hooks, and engine API reference" },
];

export default function HomePage() {
  return (
    <Layout>
      <main className="min-h-screen bg-background text-textPrimary">
        {/* HERO SECTION */}
        <section className="mx-auto max-w-7xl px-6 py-16 md:py-32">
        <div className="flex flex-col items-center text-center">
  <motion.p 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="mb-8 font-mono text-[10px] uppercase tracking-[0.4em] text-cyan-700 font-bold"
  >
    Human-Aware Decision Engine
  </motion.p>

  {/* Hero Header: Blue-Green Gradient remains for visual "spark" */}
  <motion.h1 
    initial={{ opacity: 0, filter: "blur(10px)", y: 20 }}
    whileInView={{ opacity: 1, filter: "blur(0px)", y: 0 }}
    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] as any }}
    className="mx-auto max-w-5xl text-5xl font-extralight tracking-tighter md:text-8xl leading-[1.05] text-slate-950"
  >
    Infrastructure for <br />
    <span className="bg-gradient-to-r from-blue-700 via-cyan-500 to-emerald-500 bg-[length:200%_auto] bg-clip-text text-transparent animate-text-gradient italic font-serif">
      spontaneous
    </span> exploration.
  </motion.h1>

  {/* Human-Centric Description: Warm, clear, and action-oriented */}
  <motion.p
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true }}
    variants={{
      hidden: { opacity: 1 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.012 } // Slightly faster for a "breezier" feel
      }
    }}
    className="mt-10 mx-auto max-w-2xl text-lg md:text-xl font-light leading-relaxed text-slate-600 text-balance"
  >
    {"HADE listens to the world around you—turning a thousand invisible signals into the ".split("").map((char, i) => (
      <motion.span key={i} variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}>
        {char}
      </motion.span>
    ))}
    
    <span className="whitespace-nowrap text-slate-900 font-medium italic">
      {"one perfect choice for right now.".split("").map((char, i) => (
        <motion.span key={i} variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}>
          {char}
        </motion.span>
      ))}
    </span>
  </motion.p>

  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ delay: 1.5 }} 
    className="mt-12 flex flex-wrap justify-center gap-4"
  >
    <HadeButton href="/demo" variant="primary" size="default">
      Experience HADE
    </HadeButton>
    <HadeButton href="/components" variant="secondary" size="default">
      See how it thinks
    </HadeButton>
  </motion.div>
</div>

          {/* Decision Pipeline Visualization */}
          <div className="mt-24 w-full rounded-[2.5rem] border border-border bg-surface p-4 md:p-12 shadow-2xl">
            <p className="mb-8 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-textMuted">
              Process Visualization // Phase 01-04
            </p>
            <div className="w-full max-w-full overflow-visible">
              <DecisionFlowDiagram className="w-full h-auto" />
            </div>
          </div>
        </section>

        {/* INFRASTRUCTURE BLUEPRINT */}
        <section className="border-y border-border bg-surface/50 py-16 md:py-24">
          <div className="mx-auto max-w-7xl px-6">
            <h2 className="mb-12 font-mono text-sm uppercase tracking-widest text-accentPrimary">Infrastructure for Decision-Making</h2>
            
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {/* 01. Input Layer */}
              <div className="flex flex-col rounded-xl border border-border bg-background p-6 shadow-sm h-full">
                <h3 className="mb-4 text-xl font-bold text-textPrimary">Input Layer</h3>
                <ul className="space-y-3 text-sm text-textMuted">
                  <li>• Precise Location & Proximal Context</li>
                  <li>• Temporal Mapping (Time & Seasonality)</li>
                  <li>• Multi-modal Intent Signals</li>
                  <li>• Dynamic User Constraints</li>
                </ul>
              </div>

              {/* 02. Decision Engine */}
              <div className="flex flex-col rounded-xl border border-accentPrimary/40 bg-background p-6 shadow-md h-full ring-1 ring-accentPrimary/10">
                <h3 className="mb-4 text-xl font-bold text-accentPrimary">Decision Engine</h3>
                <ul className="space-y-3 text-sm text-textMuted">
                  <li>• Trust-Weighted Ranking Logic</li>
                  <li>• Multi-Stage Intent Filtering</li>
                  <li>• Spontaneity-Optimized Scoring</li>
                  <li>• <strong>Fail-Safe Fallback Systems</strong></li>
                </ul>
              </div>

              {/* 03. Output Layer */}
              <div className="flex flex-col rounded-xl border border-border bg-background p-6 shadow-sm h-full">
                <div className="flex-grow">
                  <h3 className="mb-4 text-xl font-bold text-textPrimary">Output Layer</h3>
                  <ul className="space-y-3 text-sm text-textMuted">
                    <li>• 1 Primary Decision</li>
                    <li>• Human-Voiced Rationale</li>
                    <li>• Anti-Scroll UX Interface</li>
                    <li>• Real-Time Actionable Results</li>
                  </ul>
                </div>
                <div className="mt-6 rounded-lg bg-accentPrimary/5 p-4 border border-accentPrimary/10">
                  <p className="text-sm font-medium text-textPrimary">Goal: Decision Fulfillment</p>
                  <p className="text-xs text-textMuted mt-1">HADE delivers a single, confident path to kill infinite browsing.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* HADE LAYERS GRID */}
        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HADE_LAYERS.map((layer) => (
              <div key={layer.letter} className="rounded-2xl border border-border bg-surface p-6">
                <span className="mb-3 block font-mono text-4xl font-black" style={{ color: layer.color }}>
                  {layer.letter}
                </span>
                <p className="mb-2 text-sm font-semibold text-textPrimary">{layer.title}</p>
                <p className="text-xs leading-relaxed text-textMuted">{layer.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* VERTICAL VERTICES */}
        <section className="mx-auto max-w-7xl px-6 pb-20">
          <div className="mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-textPrimary">Horizontal Logic. Vertical Impact.</h2>
            <p className="mt-4 text-textMuted">HADE architecture powers high-frequency industries where decision friction is the enemy.</p>
          </div>
          
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "🍽️", title: "Food & Dining", sub: "40–60% Same-Day Decisions¹", desc: "Eliminating daily fatigue with context-aware suggestions based on mood, weather, and proximity.²" },
              { icon: "🛍️", title: "Retail & Shopping", sub: "~70% Cart Abandonment³", desc: "Moving from search-and-filter to inspiration-based commerce where the engine picks for you.⁴" },
              { icon: "📍", title: "Urban Mobility", sub: "High-Intent \"Near Me\" Queries⁵", desc: "Real-time exploration that suggests the next move based on local density and live environmental signals." },
              { icon: "📺", title: "Entertainment", sub: "80%+ Driven by Recommendations⁶", desc: "Cross-platform engines that solve for \"what should I do right now\" through digital-to-physical blending." },
              { icon: "🤝", title: "Social Interaction", sub: "70% Preference for Experiences⁷", desc: "Real-time social matching that eliminates planning friction for spontaneous, meaningful connections." },
              { icon: "🌿", title: "Wellness", sub: "$1.8T Market Opportunity⁸", desc: "Context-aware \"do this now\" interventions and nudges tied to environment to reduce habit friction." }
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col rounded-2xl border border-border bg-surface p-8 transition-colors hover:border-accentPrimary/30 h-full">
                <div className="mb-4 text-2xl">{item.icon}</div>
                <h3 className="mb-2 font-bold text-textPrimary">{item.title}</h3>
                <p className="mb-4 text-xs font-mono uppercase text-accentPrimary tracking-widest">{item.sub}</p>
                <p className="text-sm leading-relaxed text-textMuted">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 border-t border-border pt-6">
            <div className="grid grid-cols-2 gap-4 text-[10px] font-mono text-textMuted uppercase tracking-tighter opacity-50 sm:grid-cols-4">
              <p>1. McKinsey Global Research</p>
              <p>2. Google Search Trends</p>
              <p>3. Baymard Institute</p>
              <p>4. Deloitte Consumer Report</p>
              <p>5. Google Maps Mobility Data</p>
              <p>6. Netflix Internal Data</p>
              <p>7. Eventbrite Gen-Z Study</p>
              <p>8. McKinsey Wellness Report</p>
            </div>
          </div>
        </section>

        {/* THE SPONTANEITY PARADOX */}
<section className="bg-textPrimary py-20 text-background">
  <div className="mx-auto max-w-7xl px-6">
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
      <div>
        <h2 className="mb-6 text-3xl font-bold tracking-tight text-white">The Spontaneity Paradox</h2>
        <p className="mb-8 opacity-80 text-lg">
          Research confirms users don{"'"}t usually want "freedom of choice", they want fast, confident outcomes with zero cognitive load.
        </p>
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="font-mono text-accentPrimary font-bold">01</div>
            <p className="text-sm">
              <strong className="text-white">Context Beats Preference:</strong> Static profiles are weak signals. HADE prioritizes real-time temporal and environmental context—weather, location, and social relay.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="font-mono text-accentPrimary font-bold">02</div>
            <p className="text-sm">
              <strong className="text-white">Overchoice is Friction:</strong> More options lead to lower satisfaction and delayed decisions. HADE reduces choice to a single, high-trust action⁹.
            </p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
        <p className="mb-2 text-6xl font-bold text-accentPrimary">80%+</p>
        <p className="text-sm opacity-60 max-w-xs mx-auto uppercase tracking-wide">
          Of digital consumption is already driven by machine logic¹⁰. HADE brings this trust to physical reality.
        </p>
      </div>
    </div>

    {/* ADDED: FOOTER FOR CITATIONS 9-12 */}
    <div className="mt-16 border-t border-white/10 pt-8">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-[10px] font-mono text-white/70 uppercase tracking-tighter sm:grid-cols-4">
        <p>9. Harvard Business School + Columbia Studies</p>
        <p>10. Netflix Internal Engagement Data</p>
        <p>11. Microsoft Work Trend Index</p>
        <p>12. HADE System Internal Benchmarks</p>
      </div>
    </div>
  </div>
</section>

        {/* AGENTIC STRATUM */}
        <div className="mx-auto max-w-7xl px-6">
          <AgenticOrchestrationDiagram className="shadow-2xl shadow-blue-500/10" />
        </div>

        {/* NAVIGATION LINKS */}
        <section className="mx-auto max-w-7xl border-t border-border px-6 py-14 md:py-16">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-xl border border-border bg-surface p-5 transition-all duration-200 hover:border-accentPrimary/50 hover:bg-background"
              >
                <p className="mb-1 font-semibold text-textPrimary transition-colors group-hover:text-accentPrimary">
                  {link.label} →
                </p>
                <p className="text-xs text-textMuted">{link.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <footer className="border-t border-border px-6 py-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between text-xs font-mono text-textMuted">
            <span>hade-system-v1</span>
            <span>Next.js · TypeScript · Tailwind · Framer Motion</span>
          </div>
        </footer>
      </main>
    </Layout>
  );
}