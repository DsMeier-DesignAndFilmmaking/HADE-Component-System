import Link from "next/link";
import { DecisionDiagram } from "@/components/hade/diagrams/DecisionDiagram";
import { HadeButton } from "@/components/hade/buttons/HadeButton";
import { HadeHeading } from "@/components/hade/typography/HadeHeading";
import { HadeText } from "@/components/hade/typography/HadeText";

const HADE_LAYERS = [
  {
    letter: "H",
    color: "#316BFF",
    title: "Human Signal Mapping",
    description: "Capture presence, social relay, environmental, and behavioral signals from real context.",
  },
  {
    letter: "A",
    color: "#8B5CF6",
    title: "Adaptive Logic Architecture",
    description: "Weight signals by trust, score candidates by intent alignment and proximity.",
  },
  {
    letter: "D",
    color: "#10B981",
    title: "Decision Layer Orchestration",
    description: "Generate confident primary recommendations with human-voiced rationale.",
  },
  {
    letter: "E",
    color: "#F59E0B",
    title: "Experiment + Evolution",
    description: "Measure moment impact, track friction, and iterate the model continuously.",
  },
];

const NAV_LINKS = [
  { href: "/demo", label: "Interactive Demo", description: "Emit signals and generate decisions" },
  { href: "/components", label: "Components", description: "Browse the full component library" },
  { href: "/docs", label: "Docs", description: "Types, hooks, and engine API reference" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-obsidian text-surface">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="font-mono text-sm font-bold tracking-widest text-accent uppercase">
            HADE System <span className="text-white/30">v1</span>
          </span>
          <div className="flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-white/60 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
          {/* Left: copy */}
          <div>
            <p className="mb-4 font-mono text-xs uppercase tracking-widest text-accent">
              Hyperlocal Agentic Decision Engine
            </p>
            <HadeHeading level={1} color="surface" className="mb-6 text-balance">
              Adaptive UX,{" "}
              <span className="text-accent">context-first.</span>
            </HadeHeading>
            <HadeText variant="body" color="surface" className="mb-8 opacity-70 text-balance">
              HADE is a decision infrastructure that reads environmental signals, weights them by
              social trust, and generates confident, personalized recommendations with human-voiced
              rationale — ready to integrate into any product surface.
            </HadeText>
            <div className="flex flex-wrap gap-3">
              <HadeButton href="/demo" variant="primary" size="default">
                Try the Demo
              </HadeButton>
              <HadeButton href="/components" variant="ghost" size="default">
                Browse Components
              </HadeButton>
            </div>
          </div>

          {/* Right: diagram */}
          <div className="rounded-2xl border border-white/10 bg-slateGlass p-6">
            <p className="mb-4 font-mono text-xs uppercase tracking-widest text-white/40">
              Decision Pipeline
            </p>
            <DecisionDiagram interactive />
          </div>
        </div>
      </section>

      {/* HADE Letter Blocks */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HADE_LAYERS.map((layer) => (
            <div
              key={layer.letter}
              className="rounded-2xl border border-white/10 bg-slateGlass p-6"
            >
              <span
                className="block font-mono text-4xl font-black mb-3"
                style={{ color: layer.color }}
              >
                {layer.letter}
              </span>
              <p className="text-sm font-semibold text-white mb-2">{layer.title}</p>
              <p className="text-xs text-white/50 leading-relaxed">{layer.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quick links */}
      <section className="border-t border-white/10 mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-xl border border-white/10 bg-slateGlass p-5 hover:border-accent/40 hover:bg-slateGlass/80 transition-all duration-200"
            >
              <p className="font-semibold text-white group-hover:text-accent transition-colors mb-1">
                {link.label} →
              </p>
              <p className="text-xs text-white/50">{link.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-6">
        <div className="mx-auto max-w-6xl flex items-center justify-between text-xs text-white/30 font-mono">
          <span>hade-system-v1</span>
          <span>Next.js · TypeScript · Tailwind · Framer Motion</span>
        </div>
      </footer>
    </main>
  );
}
