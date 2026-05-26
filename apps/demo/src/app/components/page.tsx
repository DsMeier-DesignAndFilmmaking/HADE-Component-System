import { HadeButton } from "@/components/hade/buttons/HadeButton";
import { HadeCard } from "@/components/hade/layout/HadeCard";
import { HadePanel } from "@/components/hade/layout/HadePanel";
import { HadeHeading } from "@/components/hade/typography/HadeHeading";
import { HadeText } from "@/components/hade/typography/HadeText";
import { SignalBadge } from "@/components/hade/adaptive/SignalBadge";
import { DecisionDiagram } from "@/components/hade/diagrams/DecisionDiagram";
import { Layout } from "@/components/layout";
import type { SignalType } from "@/types/hade";

const SIGNAL_TYPES: SignalType[] = [
  "PRESENCE",
  "SOCIAL_RELAY",
  "ENVIRONMENTAL",
  "BEHAVIORAL",
  "AMBIENT",
  "EVENT",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <h2 className="font-mono text-xs uppercase tracking-widest text-ink/40 mb-5 border-b border-line pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CodeSnippet({ code }: { code: string }) {
  return (
    <pre className="mt-3 rounded-lg bg-obsidian px-4 py-3 text-xs text-surface/80 font-mono overflow-x-auto">
      {code}
    </pre>
  );
}

export default function ComponentsPage() {
  return (
    <Layout>
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-6 py-12">
        <p className="font-mono text-xs uppercase tracking-widest text-accent mb-3">
          Component Library
        </p>
        <HadeHeading level={1} className="mb-3">
          HADE Components
        </HadeHeading>
        <HadeText variant="body" color="muted" className="mb-12">
          All components are typed, token-aligned, and motion-enhanced.
        </HadeText>

        {/* Buttons */}
        <Section title="hade/buttons — HadeButton">
          <div className="flex flex-wrap gap-3 mb-2">
            <HadeButton variant="primary">Primary</HadeButton>
            <HadeButton variant="secondary">Secondary</HadeButton>
            <HadeButton variant="ghost">Ghost</HadeButton>
            <HadeButton variant="primary" size="sm">Small</HadeButton>
            <HadeButton variant="primary" loading>Loading</HadeButton>
            <HadeButton variant="primary" disabled>Disabled</HadeButton>
          </div>
          <CodeSnippet
            code={`import { HadeButton } from "@/components/hade/buttons";

<HadeButton variant="primary" href="/demo">Try Demo</HadeButton>
<HadeButton variant="secondary" onClick={handleClick}>Action</HadeButton>
<HadeButton variant="ghost" size="sm">Ghost</HadeButton>`}
          />
        </Section>

        {/* Layout */}
        <Section title="hade/layout — HadeCard + HadePanel">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-2">
            <HadeCard>
              <p className="text-sm font-semibold mb-1">Default Card</p>
              <p className="text-xs text-ink/60">Shadow panel, white bg, rounded-2xl border.</p>
            </HadeCard>
            <HadeCard glow="blue">
              <p className="text-sm font-semibold mb-1">Glow Blue Card</p>
              <p className="text-xs text-ink/60">Accent glow + border on hover.</p>
            </HadeCard>
            <HadeCard glow="lime">
              <p className="text-sm font-semibold mb-1">Glow Lime Card</p>
              <p className="text-xs text-ink/60">cyberLime glow variant.</p>
            </HadeCard>
            <HadePanel
              header={<p className="text-sm font-semibold">Panel Header</p>}
              footer={<p className="text-xs text-ink/50">Panel footer</p>}
            >
              <p className="text-sm text-ink/70">Panel body with header + footer slots.</p>
            </HadePanel>
          </div>
          <CodeSnippet
            code={`import { HadeCard, HadePanel } from "@/components/hade/layout";

<HadeCard glow="blue">Content</HadeCard>
<HadePanel header={<h3>Title</h3>} footer={<Actions />}>Body</HadePanel>`}
          />
        </Section>

        {/* Typography */}
        <Section title="hade/typography — HadeHeading + HadeText">
          <div className="space-y-3 mb-2">
            <HadeHeading level={1}>H1 — Decision Engine</HadeHeading>
            <HadeHeading level={2}>H2 — Adaptive Logic</HadeHeading>
            <HadeHeading level={3}>H3 — Signal Layer</HadeHeading>
            <HadeHeading level={4}>H4 — Context State</HadeHeading>
            <HadeText variant="body">Body text — base/relaxed, ink color.</HadeText>
            <HadeText variant="caption" color="muted">Caption — sm, muted.</HadeText>
            <HadeText variant="label">Label — xs, uppercase, tracked.</HadeText>
            <HadeText variant="mono">Mono — sm, JetBrains Mono.</HadeText>
          </div>
          <CodeSnippet
            code={`import { HadeHeading, HadeText } from "@/components/hade/typography";

<HadeHeading level={2} color="accent">Title</HadeHeading>
<HadeText variant="caption" color="muted">Supporting copy</HadeText>`}
          />
        </Section>

        {/* Signal Badges */}
        <Section title="hade/adaptive — SignalBadge">
          <div className="flex flex-wrap gap-2 mb-2">
            {SIGNAL_TYPES.map((type) => (
              <SignalBadge key={type} type={type} strength={Math.random() * 0.4 + 0.5} animated />
            ))}
          </div>
          <CodeSnippet
            code={`import { SignalBadge } from "@/components/hade/adaptive";

<SignalBadge type="PRESENCE" strength={0.82} animated />
<SignalBadge type="SOCIAL_RELAY" label="Alex, 2h ago" />`}
          />
        </Section>

        {/* Decision Diagram */}
        <Section title="hade/diagrams — DecisionDiagram">
          <div className="rounded-2xl border border-line bg-white p-6 mb-2">
            <DecisionDiagram interactive />
          </div>
          <div className="rounded-2xl border border-line bg-obsidian p-6 mb-2">
            <DecisionDiagram compact />
          </div>
          <CodeSnippet
            code={`import { DecisionDiagram } from "@/components/hade/diagrams";

<DecisionDiagram interactive />   // hover to reveal layer detail
<DecisionDiagram compact />        // condensed layout`}
          />
        </Section>
        </div>
      </main>
    </Layout>
  );
}
