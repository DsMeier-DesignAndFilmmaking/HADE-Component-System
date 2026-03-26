"use client";

import { useState, useEffect } from "react";
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

// Denver downtown — fallback when geolocation is unavailable or denied
const DEFAULT_GEO = { lat: 39.7392, lng: -104.9903 };

function DemoInner() {
  const { signals, emit, decision, isLoading, error, decide } = useHadeAdaptiveContext();
  const [selectedType, setSelectedType] = useState<SignalType>("PRESENCE");
  const [strength, setStrength] = useState(0.7);

  // ─── Real Geolocation ───────────────────────────────────────────────────────
  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "denied">("idle");

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus("denied");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus("idle");
      },
      () => {
        // Permission denied or unavailable — fall back to Denver
        setGeoStatus("denied");
      },
      { timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  const resolvedGeo = userGeo ?? DEFAULT_GEO;

  // ─── Signal Emission ────────────────────────────────────────────────────────
  const handleEmit = () => {
    const contents = SAMPLE_CONTENT[selectedType];
    const content = contents[Math.floor(Math.random() * contents.length)];
    emit(selectedType, {
      content,
      strength,
      // Emit near the user's real location (or Denver default), with small jitter
      geo: {
        lat: resolvedGeo.lat + (Math.random() - 0.5) * 0.005,
        lng: resolvedGeo.lng + (Math.random() - 0.5) * 0.005,
      },
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
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
        {/* ── Emitter Panel ──────────────────────────────────────────────────── */}
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
          <div className="mb-3">
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

          {/* Geo status indicator */}
          <p className="font-mono text-xs text-ink/30 mb-5">
            {geoStatus === "loading" && "⊙ Acquiring location…"}
            {geoStatus === "denied" && "⊘ Location unavailable — using Denver default"}
            {geoStatus === "idle" && userGeo &&
              `⊕ ${userGeo.lat.toFixed(4)}, ${userGeo.lng.toFixed(4)}`}
            {geoStatus === "idle" && !userGeo && "⊙ Using Denver default"}
          </p>

          <HadeButton variant="primary" onClick={handleEmit} className="w-full">
            Emit Signal
          </HadeButton>

          <div className="mt-4 flex gap-2">
            <HadeButton
              variant="secondary"
              size="sm"
              onClick={() => decide({ geo: resolvedGeo })}
              loading={isLoading}
              className="flex-1"
            >
              Generate Decision
            </HadeButton>
          </div>

          {/* API error state */}
          {error && (
            <p className="mt-3 text-xs text-red-400 font-mono">{error}</p>
          )}
        </HadePanel>

        {/* ── Signal List ────────────────────────────────────────────────────── */}
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

      {/* ── Decision Output ───────────────────────────────────────────────────── */}
      {decision && (
        <div className="mt-6">
          <HadeCard glow="blue">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-accent mb-1">
                  Decision
                </p>
                <HadeHeading level={3}>{decision.venue_name}</HadeHeading>
                <HadeText variant="caption" color="muted">
                  {decision.category}
                  {decision.neighborhood ? ` · ${decision.neighborhood}` : ""}
                  {" · "}
                  {decision.eta_minutes}m away
                </HadeText>
              </div>
              <span className="shrink-0 rounded-lg bg-accentSoft px-3 py-1.5 font-mono text-xs font-bold text-accent">
                {Math.round(decision.confidence * 100)}% confidence
              </span>
            </div>

            {/* Primary rationale */}
            <HadeText variant="body" color="ink" className="italic">
              &quot;{decision.rationale}&quot;
            </HadeText>

            {/* Why now */}
            {decision.why_now && (
              <HadeText variant="caption" color="muted" className="mt-2">
                {decision.why_now}
              </HadeText>
            )}

            {/* Situation summary — engine's interpretation of the moment */}
            {decision.situation_summary && (
              <p className="mt-3 font-mono text-xs text-ink/30 border-t border-line pt-3">
                <span className="text-ink/20 mr-1">↳</span>
                {decision.situation_summary}
              </p>
            )}
          </HadeCard>
        </div>
      )}

      {/* ── Empty State ───────────────────────────────────────────────────────── */}
      {!decision && !isLoading && (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink/40">
            Emit signals then click <strong>Generate Decision</strong> to see the decision.
          </p>
          <p className="text-xs text-ink/30 mt-1 font-mono">
            Backend: {process.env.NEXT_PUBLIC_HADE_API_URL ?? "http://localhost:8000"}
          </p>
        </div>
      )}

      {/* ── Loading State ─────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="mt-6 rounded-2xl border border-line p-8 text-center">
          <p className="text-sm text-ink/40 font-mono animate-pulse">
            Interpreting situation…
          </p>
        </div>
      )}
    </div>
  );
}

export default function DemoPage() {
  return (
    <Layout>
      <AdaptiveContainer config={{}}>
        <DemoInner />
      </AdaptiveContainer>
    </Layout>
  );
}
