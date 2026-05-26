import { HadeHeading } from "@/components/hade/typography/HadeHeading";
import { HadeText } from "@/components/hade/typography/HadeText";
import { Layout } from "@/components/layout";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-14 scroll-mt-8">
      <h2 className="font-mono text-xs uppercase tracking-widest text-accent mb-4 border-b border-line pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TypeRow({ name, type, description }: { name: string; type: string; description: string }) {
  return (
    <tr className="border-b border-line">
      <td className="py-3 pr-4 font-mono text-xs text-accent">{name}</td>
      <td className="py-3 pr-4 font-mono text-xs text-ink/60">{type}</td>
      <td className="py-3 text-xs text-ink/70">{description}</td>
    </tr>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="rounded-lg bg-obsidian px-4 py-4 text-xs text-surface/80 font-mono overflow-x-auto mb-4">
      {code}
    </pre>
  );
}

export default function DocsPage() {
  return (
    <Layout>
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-6 py-12">
        <p className="font-mono text-xs uppercase tracking-widest text-accent mb-3">
          API Reference
        </p>
        <HadeHeading level={1} className="mb-3">
          HADE Docs
        </HadeHeading>
        <HadeText variant="body" color="muted" className="mb-12">
          Types, hooks, and engine function signatures.
        </HadeText>

        {/* Types */}
        <Section id="types" title="src/types/hade.ts">
          <HadeText variant="body" color="muted" className="mb-5">
            All core interfaces. Import from <code className="font-mono text-xs bg-line/50 px-1.5 py-0.5 rounded">@/types/hade</code>.
          </HadeText>

          <h3 className="text-sm font-semibold text-ink mb-3">SignalType</h3>
          <CodeBlock
            code={`type SignalType =
  | "PRESENCE"       // user physically at venue
  | "SOCIAL_RELAY"   // friend-emitted signal
  | "ENVIRONMENTAL"  // weather, crowd, time
  | "BEHAVIORAL"     // browsing / intent actions
  | "AMBIENT"        // background signals (music, events)
  | "EVENT";         // scheduled events`}
          />

          <h3 className="text-sm font-semibold text-ink mb-3">Signal</h3>
          <div className="overflow-x-auto rounded-xl border border-line bg-white mb-6">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line bg-surface/60">
                  <th className="px-4 py-3 text-xs font-medium text-ink/50 uppercase tracking-wider">Field</th>
                  <th className="px-4 py-3 text-xs font-medium text-ink/50 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-xs font-medium text-ink/50 uppercase tracking-wider">Description</th>
                </tr>
              </thead>
              <tbody className="px-4">
                <TypeRow name="id" type="string" description="Unique signal identifier" />
                <TypeRow name="type" type="SignalType" description="Category of signal" />
                <TypeRow name="strength" type="number (0–1)" description="Signal magnitude" />
                <TypeRow name="emitted_at" type="string (ISO)" description="Emission timestamp" />
                <TypeRow name="expires_at" type="string (ISO)" description="Expiry timestamp" />
                <TypeRow name="geo" type="GeoLocation" description="Emission lat/lng" />
                <TypeRow name="content" type="string | null" description="Optional human-readable content" />
                <TypeRow name="venue_id" type="string | null" description="Associated venue" />
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-semibold text-ink mb-3">HadeContext</h3>
          <CodeBlock
            code={`interface HadeContext {
  geo: GeoLocation | null;
  intent: Intent;                     // "eat" | "drink" | "chill" | "scene" | "anything"
  energy_level: EnergyLevel;          // "low" | "medium" | "high"
  group_size: number;
  radius_meters: number;
  session_id: string | null;
  time_of_day: "morning" | "afternoon" | "evening" | "night";
  day_type: "weekday" | "weekend";
  signals: Signal[];
  rejection_history: RejectionEntry[];
}`}
          />

          <h3 className="text-sm font-semibold text-ink mb-3">AdaptiveState</h3>
          <CodeBlock
            code={`interface AdaptiveState {
  context: HadeContext;
  signals: Signal[];
  opportunities: Opportunity[];
  primary: Opportunity | null;
  isLoading: boolean;
  error: string | null;
  emit: (type: SignalType, payload?: Partial<Signal>) => void;
  decide: (req?: Partial<DecideRequest>) => Promise<void>;
  pivot: (reason: string) => void;
}`}
          />
        </Section>

        {/* Hooks */}
        <Section id="hooks" title="src/lib/hade/hooks.ts">
          <h3 className="text-sm font-semibold text-ink mb-2">useAdaptive</h3>
          <HadeText variant="caption" color="muted" className="mb-3">
            Full adaptive state — context, signals, decide, and pivot. Primary hook for most use cases.
          </HadeText>
          <CodeBlock
            code={`import { useAdaptive } from "@/lib/hade/hooks";

const { context, signals, primary, isLoading, emit, decide, pivot } = useAdaptive({
  default_intent: "eat",
  default_radius: 1000,
});

// Emit a signal
emit("PRESENCE", { geo: userLocation, strength: 0.9 });

// Trigger decision (requires NEXT_PUBLIC_HADE_API_URL)
await decide({ geo: userLocation, intent: "drink" });

// Pivot away from primary
pivot("Too far away");`}
          />

          <h3 className="text-sm font-semibold text-ink mb-2 mt-6">useHadeEngine</h3>
          <HadeText variant="caption" color="muted" className="mb-3">
            Context management only — no signals or API calls.
          </HadeText>
          <CodeBlock
            code={`import { useHadeEngine } from "@/lib/hade/hooks";

const { context, setIntent, setEnergyLevel, setRadius } = useHadeEngine();

setIntent("chill");
setEnergyLevel("low");
setRadius(500);`}
          />

          <h3 className="text-sm font-semibold text-ink mb-2 mt-6">useSignals</h3>
          <HadeText variant="caption" color="muted" className="mb-3">
            Manage a local signal collection with auto-expiry cleanup.
          </HadeText>
          <CodeBlock
            code={`import { useSignals } from "@/lib/hade/hooks";

// All signal types
const { signals, emit, clear } = useSignals();

// Filter to specific types
const { signals } = useSignals(["PRESENCE", "SOCIAL_RELAY"]);

emit("AMBIENT", { content: "Live jazz nearby", strength: 0.6 });`}
          />

          <h3 className="text-sm font-semibold text-ink mb-2 mt-6">useHadeAdaptiveContext</h3>
          <HadeText variant="caption" color="muted" className="mb-3">
            Access AdaptiveState inside an AdaptiveContainer tree.
          </HadeText>
          <CodeBlock
            code={`import { useHadeAdaptiveContext } from "@/lib/hade/hooks";

// Inside a component wrapped by AdaptiveContainer
function MyComponent() {
  const { signals, emit, decide } = useHadeAdaptiveContext();
  // ...
}`}
          />
        </Section>

        {/* Engine */}
        <Section id="engine" title="src/lib/hade/engine.ts">
          <h3 className="text-sm font-semibold text-ink mb-2">buildContext</h3>
          <CodeBlock
            code={`import { buildContext } from "@/lib/hade/engine";

// Fills in time_of_day, day_type, and defaults from config
const ctx = buildContext({ geo: userGeo, intent: "eat" }, { default_radius: 800 });`}
          />

          <h3 className="text-sm font-semibold text-ink mb-2 mt-6">scoreOpportunity</h3>
          <CodeBlock
            code={`import { scoreOpportunity } from "@/lib/hade/engine";

// Returns 0–1 composite score
// Weights: proximity 40%, signal strength 35%, intent alignment 25%
const score = scoreOpportunity(opportunity, context);`}
          />

          <h3 className="text-sm font-semibold text-ink mb-2 mt-6">generateRationale</h3>
          <CodeBlock
            code={`import { generateRationale } from "@/lib/hade/engine";

// Falls back to local generation if opportunity.rationale is empty
const text = generateRationale(opportunity, context);
// → "Alex, 2h ago: 'the miso ramen is insane'"
// → "New discovery in SOMA — worth checking out."`}
          />
        </Section>

        {/* Signals lib */}
        <Section id="signals" title="src/lib/hade/signals.ts">
          <CodeBlock
            code={`import {
  emitSignal,         // Construct a Signal with defaults + TTL
  aggregateSignals,   // Deduplicate + merge by (type, venue_id)
  filterExpiredSignals,
  filterByType,
  filterByStrength,
  weightByTrust,      // Boost strength by social edge weight
  sortSignals,        // Sort by strength desc, then recency
  signalTypeLabel,    // "SOCIAL_RELAY" → "Social Relay"
  signalTypeHex,      // "PRESENCE" → "#10B981"
  formatTimeAgo,      // ISO timestamp → "2h ago"
} from "@/lib/hade/signals";`}
          />
        </Section>

        {/* AdaptiveContainer */}
        <Section id="adaptive-container" title="AdaptiveContainer">
          <HadeText variant="caption" color="muted" className="mb-4">
            React Context provider. Wrap any subtree to provide adaptive state via context.
          </HadeText>
          <CodeBlock
            code={`import { AdaptiveContainer } from "@/components/hade/adaptive";

<AdaptiveContainer config={{ default_intent: "chill", default_radius: 1000 }}>
  {/* All children can call useHadeAdaptiveContext() */}
  <SignalBadge type="PRESENCE" animated />
  <DecisionDiagram interactive />
</AdaptiveContainer>`}
          />
        </Section>
        </div>
      </main>
    </Layout>
  );
}
