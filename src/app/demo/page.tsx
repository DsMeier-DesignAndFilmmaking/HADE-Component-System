"use client";

import { useState, useEffect } from "react";
import type { SignalType, Intent } from "@/types/hade";
import { AdaptiveContainer } from "@/components/hade/adaptive/AdaptiveContainer";
import { DecisionCard } from "@/components/hade/adaptive/DecisionCard";
import { SignalBadge } from "@/components/hade/adaptive/SignalBadge";
import { SignalFlow } from "@/components/hade/diagrams/SignalFlow";
import { HadePanel } from "@/components/hade/layout/HadePanel";
import { HadeButton } from "@/components/hade/buttons/HadeButton";
import { HadeHeading } from "@/components/hade/typography/HadeHeading";
import { HadeText } from "@/components/hade/typography/HadeText";
import { useHadeAdaptiveContext } from "@/lib/hade/hooks";
import { Layout } from "@/components/layout";
import { LocationHUD } from "@/components/hade/LocationHUD";

// Protocol Imports - Hardened Data from Notion Sync
import agentData from "@/config/agent_definitions.json";
import type { AgentDefinitions, AgentPersona } from "@/types/hade";

const SIGNAL_TYPES: SignalType[] = [
  "PRESENCE",
  "SOCIAL_RELAY",
  "ENVIRONMENTAL",
  "BEHAVIORAL",
  "AMBIENT",
  "EVENT",
];

// Cast synced JSON to our strict TypeScript interfaces
const definitions = agentData as AgentDefinitions;
const agents = definitions.agents;

const SAMPLE_CONTENT: Record<SignalType, string[]> = {
  PRESENCE: ["Checked in at venue", "Near the waterfront", "Spotted downtown"],
  SOCIAL_RELAY: ["Alex: 'the miso ramen is insane'", "Sam just arrived", "Jordan recommends this spot"],
  ENVIRONMENTAL: ["Cool evening, 62°F", "Low crowd density", "Weekend vibe"],
  BEHAVIORAL: ["Browsing dinner options", "Group of 3", "Looking for something chill"],
  AMBIENT: ["Live music nearby", "Happy hour ends at 7", "Rooftop open tonight"],
  EVENT: ["Pop-up market on 5th", "Jazz night at The Standard", "Chef's table opening"],
};

const DEFAULT_GEO = { lat: 39.7392, lng: -104.9903 };

function DemoInner() {
  const { signals, emit, response, context, isLoading, error, decide, setGeo, setRadius, pivot } = useHadeAdaptiveContext();
  
  // ─── Persona State (Notion-Driven) ─────────────────────────────────────────
  const [activeAgent, setActiveAgent] = useState<AgentPersona>(agents[0]);
  const lastSync = new Date(definitions.synced_at).toLocaleString();

  const [selectedType, setSelectedType] = useState<SignalType>("PRESENCE");
  const [strength, setStrength] = useState(0.7);

  // ─── Real Geolocation ───────────────────────────────────────────────────────
  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "denied">("idle");

  // ─── Refine Panel State ─────────────────────────────────────────────────────
  const [showRefinePanel, setShowRefinePanel] = useState(false);
  const [refineIntent, setRefineIntent] = useState<Intent | null>(null);
  const [refineUrgency, setRefineUrgency] = useState<"low" | "medium" | "high">("medium");

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeo(DEFAULT_GEO);
      setGeoStatus("denied");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserGeo(geo);
        setGeo(geo);
        setGeoStatus("idle");
      },
      () => {
        setGeo(DEFAULT_GEO);
        setGeoStatus("denied");
      },
      { timeout: 8000, maximumAge: 60_000 }
    );
  }, [setGeo]);

  const resolvedGeo = userGeo ?? DEFAULT_GEO;

  // ─── CTA Handlers ──────────────────────────────────────────────────────────

  // medium: expand radius 50%, update context, re-decide
  const handleCtaMedium = () => {
    const newRadius = Math.round(context.radius_meters * 1.5);
    setRadius(newRadius);
    decide({ radius_meters: newRadius, session_id: response?.session_id ?? undefined, persona: activeAgent });
  };

  // low: open inline refine panel
  const handleCtaLow = () => setShowRefinePanel(true);

  // refine panel confirm: emit BEHAVIORAL signal + re-decide with updated situation
  const handleRefineConfirm = () => {
    emit("BEHAVIORAL", {
      content: `Refined: ${refineIntent ?? "anything"} · urgency ${refineUrgency}`,
      strength: 0.9,
      geo: {
        lat: resolvedGeo.lat + (Math.random() - 0.5) * 0.001,
        lng: resolvedGeo.lng + (Math.random() - 0.5) * 0.001,
      },
    });
    decide({
      situation: { intent: refineIntent, urgency: refineUrgency },
      session_id: response?.session_id ?? undefined,
      persona: activeAgent,
    });
    setShowRefinePanel(false);
  };

  // dispatcher: routes by ui_state; "high" / "Go now" is informational — no call
  const handleCta = () => {
    if (!response) return;
    if (response.ux.ui_state === "medium") handleCtaMedium();
    else if (response.ux.ui_state === "low") handleCtaLow();
  };

  const handleEmit = () => {
    const contents = SAMPLE_CONTENT[selectedType];
    const content = contents[Math.floor(Math.random() * contents.length)];
    emit(selectedType, {
      content,
      strength,
      geo: {
        lat: resolvedGeo.lat + (Math.random() - 0.5) * 0.005,
        lng: resolvedGeo.lng + (Math.random() - 0.5) * 0.005,
      },
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Header */}
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent mb-3">
            System Intelligence
          </p>
          <HadeHeading level={1} className="mb-3">
            Signal Emitter
          </HadeHeading>
          <HadeText variant="body" color="muted">
            Test context-aware decisions using personas synced from your Strategic Command Center.
          </HadeText>
        </div>
        <LocationHUD geo={userGeo} geoStatus={geoStatus} className="shrink-0 mt-1" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── 1. Persona Registry (Notion-Synced) ───────────────────────────── */}
        <HadePanel
          header={
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Persona Registry</p>
              <span className="text-[10px] text-ink/30 font-mono">L2 Sync</span>
            </div>
          }
        >
          <div className="space-y-3">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setActiveAgent(agent)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  activeAgent.id === agent.id
                    ? "border-accent bg-accent/5 ring-1 ring-accent/20"
                    : "border-line hover:border-ink/20 bg-transparent"
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`font-mono text-xs font-bold ${activeAgent.id === agent.id ? "text-accent" : "text-ink"}`}>
                    {agent.id}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-ink/5 text-ink/40 border border-line uppercase font-medium">
                    {agent.model_target?.split('-')[0] || 'cloud'}
                  </span>
                </div>
                <p className="text-[11px] leading-tight text-ink/50 line-clamp-2 italic mb-2">
                  "{agent.role}"
                </p>
                <div className="flex gap-1 flex-wrap">
                  {agent.tone.map(t => (
                    <span key={t} className="text-[9px] bg-ink/5 px-1.5 py-0.5 rounded text-ink/60 border border-line/50">
                      {t}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
          
          <div className="mt-6 pt-4 border-t border-line">
            <p className="text-[10px] uppercase tracking-widest text-ink/30 mb-1">Last Notion Sync</p>
            <p className="text-[10px] font-mono text-ink/40">{lastSync}</p>
          </div>
        </HadePanel>

        {/* ── 2. Emitter Panel ──────────────────────────────────────────────── */}
        <HadePanel
          header={
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Emit Signal</p>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-mono text-ink/40 uppercase tracking-tighter">Live</span>
              </div>
            </div>
          }
        >
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

          <div className="mt-4 pt-4 border-t border-line">
            <p className="text-[10px] uppercase tracking-widest text-ink/30 mb-3 text-center">Engine Activation</p>
            <HadeButton
              variant="secondary"
              size="sm"
              onClick={() => decide({ persona: activeAgent })} // Pass the Notion-synced object here 
              loading={isLoading}
              className="w-full"
            >
              Generate Decision as {activeAgent.id}
            </HadeButton>
          </div>

          {error && (
            <p className="mt-3 text-xs text-red-400 font-mono">{error}</p>
          )}
        </HadePanel>

        {/* ── 3. Signal List ────────────────────────────────────────────────── */}
        <HadePanel
          header={
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Active Signals</p>
              <span className="font-mono text-xs text-ink/40">{signals.length} total</span>
            </div>
          }
        >
          <SignalFlow signals={signals} maxVisible={8} />
        </HadePanel>
      </div>

      {/* ── Decision Output ───────────────────────────────────────────────────── */}
      {response && (
        <>
          <DecisionCard
            response={response}
            agentId={activeAgent.id}
            onCta={handleCta}
            onPivot={pivot}
            className="mt-6"
          />

          {/* ── Refine Panel — low state only ──────────────────────────────── */}
          {showRefinePanel && (
            <div className="mt-4 rounded-2xl border border-line bg-surface p-6">
              <p className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
                Refine Your Search
              </p>

              <div className="mb-5">
                <label className="block text-xs font-medium text-ink/60 uppercase tracking-widest mb-2">
                  What are you after?
                </label>
                <div className="flex flex-wrap gap-2">
                  {(["eat", "drink", "chill", "scene", "anything"] as Intent[]).map((intent) => (
                    <button
                      key={intent}
                      onClick={() => setRefineIntent(intent === refineIntent ? null : intent)}
                      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                        refineIntent === intent
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-line bg-transparent text-ink/50 hover:border-ink/20"
                      }`}
                    >
                      {intent.charAt(0).toUpperCase() + intent.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-xs font-medium text-ink/60 uppercase tracking-widest mb-2">
                  How urgent?
                </label>
                <div className="flex gap-2">
                  {(["low", "medium", "high"] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setRefineUrgency(u)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                        refineUrgency === u
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-line bg-transparent text-ink/50 hover:border-ink/20"
                      }`}
                    >
                      {u.charAt(0).toUpperCase() + u.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <HadeButton variant="primary" size="sm" onClick={handleRefineConfirm} className="flex-1">
                  Confirm &amp; Refine
                </HadeButton>
                <HadeButton variant="secondary" size="sm" onClick={() => setShowRefinePanel(false)} className="flex-1">
                  Cancel
                </HadeButton>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Empty/Loading States ──────────────────────────────────────────────── */}
      {!response && !isLoading && (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink/40">
            Emit signals, select a persona, then generate a decision.
          </p>
          <p className="text-xs text-ink/30 mt-1 font-mono">
            Hardware Target: <span className="text-accent">{activeAgent.model_target || "Cloud (Default)"}</span>
          </p>
        </div>
      )}

      {isLoading && (
        <div className="mt-6 rounded-2xl border border-line p-8 text-center">
          <p className="text-sm text-ink/40 font-mono animate-pulse uppercase tracking-widest">
            {activeAgent.id} is interpreting situation…
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