"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentDefinitions,
  AgentPersona,
  GeoLocation,
  HadeAPIMeta,
  Intent,
} from "@/types/hade";
import { useHadeAdaptiveContext } from "./hooks";
import { useHadeSettings } from "./settings";
import { deriveReasons } from "./deriveReasons";
import { getScenario } from "./scenarios";
import { buildDecisionViewModel, type DecisionViewModel } from "./viewModel";
import agentData from "@/config/agent_definitions.json";

const definitions = agentData as AgentDefinitions;
const agents = definitions.agents;

type Urgency = "low" | "medium" | "high";
type Status = "idle" | "loading" | "ready" | "error";

export interface UseHadeConfig {
  scenarioId?: string | null;
}

export interface UseHadeReturn {
  decision: DecisionViewModel | null;
  reasoning: string[];
  /** Convenience alias for decision.confidence ?? 0. */
  confidence: number;
  status: Status;
  error: string | null;
  meta: HadeAPIMeta | null;
  /** Convenience alias for decision.is_fallback. True when served from Tier 3 static stub. */
  isFallback: boolean;
  regenerate: () => void;
  refine: (input: {
    intent?: Intent | null;
    urgency?: Urgency;
  }) => Promise<void>;
  getAlternative: () => void;
}

export function useHade(config?: UseHadeConfig): UseHadeReturn {
  const {
    context,
    signals,
    response,
    isLoading,
    error,
    decide,
    pivot,
    emit,
    setGeo,
  } = useHadeAdaptiveContext();
  const { settings } = useHadeSettings();

  const [userGeo, setUserGeo] = useState<GeoLocation | null>(null);
  const [geoReady, setGeoReady] = useState(false);
  const firedRef = useRef(false);

  const scenario = config?.scenarioId ? getScenario(config.scenarioId) : null;

  const activeAgent = useMemo<AgentPersona>(() => {
    if (settings.persona_id) {
      return agents.find((a) => a.id === settings.persona_id) ?? agents[0];
    }
    return agents[0];
  }, [settings.persona_id]);

  // ── Geolocation ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    if (!navigator.geolocation) {
      // Geolocation API unavailable (e.g., insecure context) — mark ready with null geo.
      // The decide() effect guard checks context.geo and will not fire without it.
      setGeoReady(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserGeo(geo);
        setGeo(geo);
        setGeoReady(true);
      },
      () => {
        if (cancelled) return;
        // Geo denied — use scenario demo geo when explicitly configured.
        // Scenarios are author-set (developer URL param), so a hardcoded coordinate
        // is intentional. Do NOT fall back for real users with no scenario active.
        if (scenario?.geo) {
          setUserGeo(scenario.geo);
          setGeo(scenario.geo);
        }
        setGeoReady(true);
      },
      { timeout: 8000, maximumAge: 60_000 },
    );
    return () => { cancelled = true; };
  }, [setGeo]);

  // ── Auto-fire on mount ───────────────────────────────────────────────────

  useEffect(() => {
    if (firedRef.current || !geoReady || !context.geo) return;
    firedRef.current = true;
    void decide({
      ...scenario?.request,
      persona: activeAgent,
      settings: { ...settings, ...scenario?.settings },
    });
  }, [geoReady, context.geo, decide, activeAgent, settings, scenario]);

  // ── Derived state ────────────────────────────────────────────────────────

  const decision: DecisionViewModel | null = useMemo(
    () => (response ? buildDecisionViewModel(response) : null),
    [response],
  );

  const meta: HadeAPIMeta | null = useMemo(() => {
    if (!response) return null;
    return {
      contextType: response.context_snapshot?.interpreted_intent ?? "implicit",
      timestamp: new Date().toISOString(),
    };
  }, [response]);

  const reasoning = useMemo(() => {
    if (!response) return [];
    return deriveReasons(response, context);
  }, [response, context]);

  const confidence = decision?.confidence ?? 0;

  const isFallback = decision?.is_fallback ?? false;

  const status: Status = useMemo(() => {
    if (isLoading) return "loading";
    if (error && !response) return "error";
    if (response?.decision) return "ready";
    return "idle";
  }, [isLoading, error, response]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const regenerate = useCallback(() => {
    if (response?.decision) {
      pivot("user_requested_alternative");
    } else {
      firedRef.current = false;
      void decide({
        ...scenario?.request,
        persona: activeAgent,
        settings: { ...settings, ...scenario?.settings },
      });
      firedRef.current = true;
    }
  }, [response, pivot, decide, scenario, activeAgent, settings]);

  const refine = useCallback(
    async (input: { intent?: Intent | null; urgency?: Urgency }) => {
      const urgency = input.urgency ?? "medium";

      const behavioralSig = emit("BEHAVIORAL", {
        content: `Refined: ${input.intent ?? "anything"} · urgency ${urgency}`,
        strength: 0.9,
        ...(userGeo && {
          geo: {
            lat: userGeo.lat + (Math.random() - 0.5) * 0.001,
            lng: userGeo.lng + (Math.random() - 0.5) * 0.001,
          },
        }),
      });
      const intentSig = emit("INTENT", {
        content: input.intent ?? "refine request",
        strength: 0.7,
        ...(userGeo && { geo: { lat: userGeo.lat, lng: userGeo.lng } }),
      });

      await decide({
        situation: { intent: input.intent ?? null, urgency },
        state: { energy: urgency },
        signals: [...signals, behavioralSig, intentSig],
        persona: activeAgent,
        settings,
      });
    },
    [emit, signals, activeAgent, settings, decide, userGeo],
  );

  const getAlternative = useCallback(() => {
    pivot("user_requested_alternative");
  }, [pivot]);

  return {
    decision,
    reasoning,
    confidence,
    status,
    error,
    meta,
    isFallback,
    regenerate,
    refine,
    getAlternative,
  };
}
