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

// ─── Geo fallback helpers ─────────────────────────────────────────────────────

const GEO_STORAGE_KEY = "hade_last_known_geo";

/** Configurable geo fallback — set NEXT_PUBLIC_FALLBACK_GEO_LAT/LNG in env to override. */
const DEFAULT_GEO = {
  lat: Number(process.env.NEXT_PUBLIC_FALLBACK_GEO_LAT ?? "37.7749"),
  lng: Number(process.env.NEXT_PUBLIC_FALLBACK_GEO_LNG ?? "-122.4194"),
};

function saveLastKnownGeo(geo: { lat: number; lng: number }): void {
  try {
    localStorage.setItem(GEO_STORAGE_KEY, JSON.stringify(geo));
  } catch {
    // localStorage unavailable (private mode, quota, SSR guard)
  }
}

function loadLastKnownGeo(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem(GEO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
    const lat = parsed.lat;
    const lng = parsed.lng;
    if (
      typeof lat === "number" && typeof lng === "number" &&
      Number.isFinite(lat) && Number.isFinite(lng) &&
      !(lat === 0 && lng === 0)
    ) {
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveIPGeo(): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { latitude?: unknown; longitude?: unknown };
    const lat = data.latitude;
    const lng = data.longitude;
    if (
      typeof lat === "number" && typeof lng === "number" &&
      Number.isFinite(lat) && Number.isFinite(lng) &&
      !(lat === 0 && lng === 0)
    ) {
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}

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

    /**
     * Fallback chain — runs when navigator.geolocation is unavailable or denied.
     *
     * Priority:
     *   1. Scenario geo  — developer URL param override (intentional hardcode)
     *   2. IP geolocation — ipapi.co, 3 s timeout
     *   3. Last known    — localStorage from previous successful browser fix
     *   4. Default       — San Francisco; always produces a usable coordinate
     */
    const applyFallbackGeo = async () => {
      // 1. Scenario override (dev only)
      if (scenario?.geo) {
        console.log("[HADE GEO SOURCE]", {
          lat: scenario.geo.lat,
          lng: scenario.geo.lng,
          source: "fallback",
        });
        if (!cancelled) {
          setUserGeo(scenario.geo);
          setGeo(scenario.geo);
          setGeoReady(true);
        }
        return;
      }

      console.warn("[HADE GEO FALLBACK] Using fallback location");

      // 2. IP-based geolocation
      const ipGeo = await resolveIPGeo();
      if (cancelled) return;
      if (ipGeo) {
        console.log("[HADE GEO SOURCE]", { lat: ipGeo.lat, lng: ipGeo.lng, source: "ip_fallback" });
        setUserGeo(ipGeo);
        setGeo(ipGeo);
        setGeoReady(true);
        return;
      }

      // 3. Last known location from localStorage
      const lastKnown = loadLastKnownGeo();
      if (lastKnown) {
        console.log("[HADE GEO SOURCE]", { lat: lastKnown.lat, lng: lastKnown.lng, source: "last_known" });
        if (!cancelled) {
          setUserGeo(lastKnown);
          setGeo(lastKnown);
          setGeoReady(true);
        }
        return;
      }

      // 4. Hard default — always produces a non-zero usable coordinate
      console.log("[HADE GEO SOURCE]", { lat: DEFAULT_GEO.lat, lng: DEFAULT_GEO.lng, source: "default" });
      if (!cancelled) {
        setUserGeo(DEFAULT_GEO);
        setGeo(DEFAULT_GEO);
        setGeoReady(true);
      }
    };

    if (!navigator.geolocation) {
      void applyFallbackGeo();
      return () => { cancelled = true; };
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        console.log("[HADE GEO SOURCE]", { lat: geo.lat, lng: geo.lng, source: "browser" });
        saveLastKnownGeo(geo);
        setUserGeo(geo);
        setGeo(geo);
        setGeoReady(true);
      },
      () => {
        if (cancelled) return;
        void applyFallbackGeo();
      },
      { timeout: 8000, maximumAge: 60_000 },
    );

    return () => { cancelled = true; };
  }, [setGeo, scenario]);

  // ── Auto-fire on mount ───────────────────────────────────────────────────
  // Guard order:
  //   1. firedRef — prevent double-fire across re-renders
  //   2. geoReady — geolocation API has resolved (success or denied)
  //   3. context.geo?.lat && context.geo?.lng — real non-zero coordinates present
  //      Mirrors the Places validation gate: rejects null, undefined, and (0, 0).

  useEffect(() => {
    if (firedRef.current) return;
    if (!geoReady) return;
    if (!context.geo?.lat || !context.geo?.lng) {
      console.warn("[HADE GEO] Decision blocked — geo not ready or invalid", context.geo);
      return;
    }
    console.log("[HADE GEO] Triggering decision with verified geo", {
      lat: context.geo.lat,
      lng: context.geo.lng,
    });
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
        ...(userGeo && { geo: { lat: userGeo.lat, lng: userGeo.lng } }),
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
