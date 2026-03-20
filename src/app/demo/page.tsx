"use client";

import { useState } from "react";
import type { SignalType } from "@/types/hade";
import { AdaptiveContainer } from "@/components/hade/adaptive/AdaptiveContainer";
import { SignalBadge } from "@/components/hade/adaptive/SignalBadge";
import { SignalFlow } from "@/components/hade/diagrams/SignalFlow";
import { HadeCard } from "@/components/hade/layout/HadeCard";
import { HadePanel } from "@/components/hade/layout/HadePanel";
import { HadeButton } from "@/components/hade/buttons/HadeButton";
import { HadeHeading } from "@/components/hade/typography/HadeHeading";
import { HadeText } from "@/components/hade/typography/HadeText";
import { useHadeAdaptiveContext } from "@/lib/hade/hooks";
import { Layout } from "@/components/layout";


const SIGNAL_TYPES: SignalType[] = [
  "PRESENCE",
  "SOCIAL_RELAY",
  "ENVIRONMENTAL",
  "BEHAVIORAL",
  "AMBIENT",
  "EVENT",
];

const SAMPLE_CONTENT: Record<SignalType, string[]> = {
  PRESENCE: ["Checked in at venue", "Near the waterfront", "Spotted downtown"],
  SOCIAL_RELAY: ["Alex: 'the miso ramen is insane'", "Sam just arrived", "Jordan recommends this spot"],
  ENVIRONMENTAL: ["Cool evening, 62°F", "Low crowd density", "Weekend vibe"],
  BEHAVIORAL: ["Browsing dinner options", "Group of 3", "Looking for something chill"],
  AMBIENT: ["Live music nearby", "Happy hour ends at 7", "Rooftop open tonight"],
  EVENT: ["Pop-up market on 5th", "Jazz night at The Standard", "Chef's table opening"],
};

function DemoInner() {
  const { signals, emit, primary, isLoading, decide } = useHadeAdaptiveContext();
  const [selectedType, setSelectedType] = useState<SignalType>("PRESENCE");
  const [strength, setStrength] = useState(0.7);

  const handleEmit = () => {
    const contents = SAMPLE_CONTENT[selectedType];
    const content = contents[Math.floor(Math.random() * contents.length)];
    emit(selectedType, {
      content,
      strength,
      geo: { lat: 37.7749 + (Math.random() - 0.5) * 0.01, lng: -122.4194 + (Math.random() - 0.5) * 0.01 },
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10">
        <p className="font-mono text-xs uppercase tracking-widest text-accent mb-3">
          Interactive Demo
        </p>
        <HadeHeading level={1} className="mb-3">
          Signal Emitter
        </HadeHeading>
        <HadeText variant="body" color="muted">
          Emit signals to simulate real-world context, then trigger a decision.
        </HadeText>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Emitter Panel */}
        <HadePanel
          header={
            <p className="text-sm font-semibold text-ink">Emit Signal</p>
          }
        >
          {/* Signal type selector */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-ink/60 uppercase tracking-widest mb-2">
              Signal Type
            </label>
            <div className="flex flex-wrap gap-2">
              {SIGNAL_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className="focus:outline-none"
                >
                  <SignalBadge
                    type={type}
                    animated={type === selectedType}
                    className={
                      type === selectedType
                        ? "ring-2 ring-offset-1 ring-accent/40"
                        : "opacity-50 hover:opacity-75"
                    }
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Strength slider */}
          <div className="mb-6">
            <label className="block text-xs font-medium text-ink/60 uppercase tracking-widest mb-2">
              Strength — {Math.round(strength * 100)}%
            </label>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={strength}
              onChange={(e) => setStrength(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
          </div>

          <HadeButton variant="primary" onClick={handleEmit} className="w-full">
            Emit Signal
          </HadeButton>

          <div className="mt-4 flex gap-2">
            <HadeButton
              variant="secondary"
              size="sm"
              onClick={() => decide({ geo: { lat: 37.7749, lng: -122.4194 } })}
              loading={isLoading}
              className="flex-1"
            >
              Generate Decision
            </HadeButton>
          </div>
        </HadePanel>

        {/* Signal list */}
        <HadePanel
          header={
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Active Signals</p>
              <span className="font-mono text-xs text-ink/40">{signals.length} signals</span>
            </div>
          }
        >
          <SignalFlow signals={signals} maxVisible={8} />
        </HadePanel>
      </div>

      {/* Decision output */}
      {primary && (
        <div className="mt-6">
          <HadeCard glow="blue">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-accent mb-1">
                  Primary Recommendation
                </p>
                <HadeHeading level={3}>{primary.venue_name}</HadeHeading>
                <HadeText variant="caption" color="muted">
                  {primary.category} · {primary.eta_minutes}m away
                </HadeText>
              </div>
              {primary.score !== undefined && (
                <span className="shrink-0 rounded-lg bg-accentSoft px-3 py-1.5 font-mono text-xs font-bold text-accent">
                  {Math.round(primary.score * 100)}% match
                </span>
              )}
            </div>
            <HadeText variant="body" color="ink" className="italic">
              &quot;{primary.rationale}&quot;
            </HadeText>
            {primary.trust_attributions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {primary.trust_attributions.map((attr) => (
                  <span
                    key={attr.user_id}
                    className="text-xs text-ink/60 bg-surface rounded-full px-2.5 py-1 border border-line"
                  >
                    {attr.display_name} · {attr.time_ago}
                  </span>
                ))}
              </div>
            )}
          </HadeCard>
        </div>
      )}

      {!primary && !isLoading && (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink/40">
            Emit signals then click <strong>Generate Decision</strong> to see a recommendation.
          </p>
          <p className="text-xs text-ink/30 mt-1 font-mono">
            Requires HADE backend at NEXT_PUBLIC_HADE_API_URL
          </p>
        </div>
      )}
    </div>
  );
}

export default function DemoPage() {
  return (
    <Layout>
      <AdaptiveContainer config={{ default_intent: "anything" }}>
        <DemoInner />
      </AdaptiveContainer>
    </Layout>
  );
}
