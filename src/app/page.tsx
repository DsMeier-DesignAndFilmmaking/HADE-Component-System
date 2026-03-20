import Link from "next/link";
import { Layout } from "@/components/layout";
import DecisionFlowDiagram from "@/components/hade/diagrams/DecisionFlowDiagram";
import { HadeButton } from "@/components/hade/buttons/HadeButton";

const HADE_LAYERS = [
  {
    letter: "H",
    color: "#316BFF",
    title: "Human Signal Mapping",
    description: "Capture presence, social relay, environmental, and behavioral signals from real context.",
  },
  {
    letter: "A",
    color: "#2563EB",
    title: "Adaptive Logic Architecture",
    description: "Weight signals by trust, score candidates by intent alignment and proximity.",
  },
  {
    letter: "D",
    color: "#0F766E",
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
    <Layout>
      <main className="min-h-screen bg-background text-textPrimary">
        <section className="mx-auto max-w-7xl px-6 py-16 md:py-20">
          <div className="grid grid-cols-1 gap-10 xl:grid-cols-2 xl:items-center xl:gap-16">
            <div className="min-w-0">
              <p className="mb-4 font-mono text-xs uppercase tracking-widest text-accentPrimary">
                Hyperlocal Agentic Decision Engine
              </p>
              <h1 className="mb-6 text-balance text-4xl font-bold tracking-tight text-textPrimary sm:text-5xl">
                Adaptive UX, <span className="text-accentPrimary">context-first.</span>
              </h1>
              <p className="mb-8 max-w-xl text-base leading-relaxed text-textMuted">
                HADE reads live environmental and behavioral signals, weights them by trust,
                and orchestrates adaptive component experiences that match user intent in real time.
              </p>
              <div className="flex flex-wrap gap-3">
                <HadeButton href="/demo" variant="primary" size="default">
                  Try the Demo
                </HadeButton>
                <HadeButton href="/components" variant="secondary" size="default">
                  Browse Components
                </HadeButton>
              </div>
            </div>

            <div className="w-full rounded-2xl border border-border bg-surface p-4 md:p-6">
  <p className="mb-4 font-mono text-xs uppercase tracking-widest text-textMuted">
    Decision Pipeline
  </p>
  <div className="w-full max-w-full overflow-visible">
    <DecisionFlowDiagram className="w-full h-auto" />
  </div>
</div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-14 md:pb-20">
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

        <section className="mx-auto max-w-6xl border-t border-border px-6 py-14 md:py-16">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-xl border border-border bg-surface p-5 transition-all duration-200 hover:border-accentPrimary/50 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentPrimary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          <div className="mx-auto flex max-w-6xl items-center justify-between text-xs font-mono text-textMuted">
            <span>hade-system-v1</span>
            <span>Next.js · TypeScript · Tailwind · Framer Motion</span>
          </div>
        </footer>
      </main>
    </Layout>
  );
}
