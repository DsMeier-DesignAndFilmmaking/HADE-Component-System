"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentDefinitions,
  AgentPersona,
  GeoLocation,
  HadeAPIDecision,
  HadeAPIMeta,
  Intent,
} from "@/types/hade";
import { useHadeAdaptiveContext } from "./hooks";
import { useHadeSettings } from "./settings";
import { deriveReasons } from "./deriveReasons";
import { getScenario } from "./scenarios";
import { formatDistance, formatEta } from "./format";
import agentData from "@/config/agent_definitions.json";

const DEFAULT_GEO = { lat: 39.7392, lng: -104.9903 };
const definitions = agentData as AgentDefinitions;
const agents = definitions.agents;

type Urgency = "low" | "medium" | "high";
type Status = "idle" | "loading" | "ready" | "error";

export interface UseHadeConfig {
  scenarioId?: string | null;
}

export interface UseHadeReturn {
  decision: HadeAPIDecision | null;
  reasoning: string[];
  confidence: number;
  status: Status;
  error: string | null;
  meta: HadeAPIMeta | null;
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
      setGeo(DEFAULT_GEO);
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
        setGeo(DEFAULT_GEO);
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

  const decision: HadeAPIDecision | null = useMemo(() => {
    if (!response?.decision) return null;
    const d = response.decision;
    return {
      id: d.id,
      title: d.venue_name,
      category: d.category,
      neighborhood: d.neighborhood,
      distance: formatDistance(d.distance_meters),
      eta: formatEta(d.eta_minutes),
      geo: d.geo,
    };
  }, [response]);

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

  const confidence = response?.decision?.confidence ?? 0;

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
      const resolvedGeo = userGeo ?? DEFAULT_GEO;
      const urgency = input.urgency ?? "medium";

      const behavioralSig = emit("BEHAVIORAL", {
        content: `Refined: ${input.intent ?? "anything"} · urgency ${urgency}`,
        strength: 0.9,
        geo: {
          lat: resolvedGeo.lat + (Math.random() - 0.5) * 0.001,
          lng: resolvedGeo.lng + (Math.random() - 0.5) * 0.001,
        },
      });
      const intentSig = emit("INTENT", {
        content: input.intent ?? "refine request",
        strength: 0.7,
        geo: { lat: resolvedGeo.lat, lng: resolvedGeo.lng },
      });

      await decide({
        situation: { intent: input.intent ?? null, urgency },
        state: { energy: urgency },
        signals: [...signals, behavioralSig, intentSig],
        session_id: null,
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
    regenerate,
    refine,
    getAlternative,
  };
}
