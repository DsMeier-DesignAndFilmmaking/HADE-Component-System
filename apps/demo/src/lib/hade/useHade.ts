"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentDefinitions,
  AgentPersona,
  GeoLocation,
  HadeAPIMeta,
  HadeConstraints,
  HadeState,
  Intent,
} from "@/types/hade";
import { ipLookupGeo } from "@hade/core";
import { useHadeAdaptiveContext } from "./hooks";
import { useHadeSettings } from "./settings";
import { deriveReasons } from "./deriveReasons";
import { getScenario } from "./scenarios";
import { buildDecisionViewModel, type DecisionViewModel } from "./viewModel";
import {
  browserGeo,
  saveLastKnownGeo,
  scenarioGeo,
  storedGeo,
  resolveGeoChain,
  type CascadeLink,
} from "./geoAdapters";
import agentData from "@/config/agent_definitions.json";

const definitions = agentData as AgentDefinitions;
const agents = definitions.agents;

// ─── Geo fallback constants ───────────────────────────────────────────────────

/** Configurable geo fallback — set NEXT_PUBLIC_FALLBACK_GEO_LAT/LNG in env to override. */
const DEFAULT_GEO = {
  lat: Number(process.env.NEXT_PUBLIC_FALLBACK_GEO_LAT ?? "37.7749"),
  lng: Number(process.env.NEXT_PUBLIC_FALLBACK_GEO_LNG ?? "-122.4194"),
};

type Urgency = "low" | "medium" | "high";
type Status = "idle" | "loading" | "ready" | "error";

export type DomainMode = "dining" | "social" | "travel";

export interface UseHadeConfig {
  scenarioId?: string | null;
  /** Pre-select a domain mode on mount (e.g. from the guided entry screen). */
  initialMode?: DomainMode;
  /** Optional lens-specific Places categories layered on top of the existing mode. */
  initialCandidateCategories?: readonly string[];
}

export interface UseHadeModeOptions {
  /** Optional lens-specific Places categories layered on top of the existing mode. */
  candidate_categories?: readonly string[];
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
  /** Currently active domain mode. */
  mode: DomainMode;
  /** Switch domain mode and immediately re-fetch with the new mode. */
  setMode: (mode: DomainMode, options?: UseHadeModeOptions) => void;
  regenerate: () => void;
  refine: (input: {
    intent?: Intent | null;
    urgency?: Urgency;
    state?: Partial<HadeState>;
    constraints?: HadeConstraints;
    candidate_categories?: string[];
  }) => Promise<void>;
  getAlternative: () => void;
}

function mergeCandidateCategories(
  ...groups: Array<readonly string[] | undefined>
): string[] | undefined {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const group of groups) {
    if (!group) continue;
    for (const category of group) {
      const normalized = category.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push(normalized);
    }
  }

  return merged.length > 0 ? merged : undefined;
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
    setGeoSource,
  } = useHadeAdaptiveContext();
  const { settings } = useHadeSettings();

  const [userGeo, setUserGeo] = useState<GeoLocation | null>(null);
  const [geoReady, setGeoReady] = useState(false);
  const [mode, setModeState] = useState<DomainMode>(config?.initialMode ?? "dining");
  const modeRef = useRef<DomainMode>(config?.initialMode ?? "dining");
  const candidateCategoriesRef = useRef<readonly string[] | undefined>(
    config?.initialCandidateCategories,
  );
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
     * Phase E: geo cascade migrated to the adapter pattern. Preserves the legacy
     * resolution order (browser → scenario → IP → stored → unknown), all
     * timeouts (browser 8000 ms, IP 3000 ms), the `(0,0)` guard, the
     * `saveLastKnownGeo` write on browser success, and the `geo_source` tag
     * that the route uses to gate Google Places fetch.
     *
     *   • `browserGeo`   wraps `navigator.geolocation.getCurrentPosition`
     *   • `scenarioGeo`  surfaces the URL-param override
     *   • `ipLookupGeo`  hits ipapi.co (from `@hade/core`)
     *   • `storedGeo`    reads `hade_last_known_geo` from localStorage
     *   • fallback       `{geo: DEFAULT_GEO, source: "unknown"}` — preserves
     *                    the legacy "non-zero sentinel so route validation
     *                    passes; source=unknown so server skips Places"
     */
    const chain: CascadeLink[] = [
      {
        source: "browser",
        adapter: browserGeo({
          timeoutMs: 8000,
          maximumAgeMs: 60_000,
          onSuccess: (geo) => saveLastKnownGeo(geo),
        }),
      },
      {
        source: "scenario",
        adapter: scenarioGeo({ coords: scenario?.geo ?? null }),
      },
      {
        source: "ip",
        adapter: ipLookupGeo({ endpoint: "https://ipapi.co/json/", timeoutMs: 3_000 }),
      },
      {
        source: "stored",
        adapter: storedGeo(),
      },
    ];

    void (async () => {
      const result = await resolveGeoChain(chain, {
        geo: DEFAULT_GEO,
        source: "unknown",
      });
      if (cancelled) return;
      if (result.source === "unknown") {
        console.warn("[HADE GEO SOURCE] unknown — no real location available; Places will be skipped", {
          fallback_coords: DEFAULT_GEO,
        });
      } else {
        console.log("[HADE GEO SOURCE]", {
          lat: result.geo.lat,
          lng: result.geo.lng,
          source: result.source,
        });
      }
      setUserGeo(result.geo);
      setGeo(result.geo);
      setGeoSource(result.source);
      setGeoReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [setGeo, setGeoSource, scenario]);

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
      mode: modeRef.current,
      candidate_categories: mergeCandidateCategories(
        scenario?.request?.candidate_categories,
        candidateCategoriesRef.current,
      ),
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
        mode: modeRef.current,
        candidate_categories: mergeCandidateCategories(
          scenario?.request?.candidate_categories,
          candidateCategoriesRef.current,
        ),
      });
      firedRef.current = true;
    }
  }, [response, pivot, decide, scenario, activeAgent, settings]);

  const setMode = useCallback((newMode: DomainMode, options?: UseHadeModeOptions) => {
    candidateCategoriesRef.current = options?.candidate_categories;
    modeRef.current = newMode;
    setModeState(newMode);
    firedRef.current = false;
    void decide({
      ...scenario?.request,
      persona: activeAgent,
      settings: { ...settings, ...scenario?.settings },
      mode: newMode,
      candidate_categories: mergeCandidateCategories(
        scenario?.request?.candidate_categories,
        candidateCategoriesRef.current,
      ),
    });
    firedRef.current = true;
  }, [decide, scenario, activeAgent, settings]);

  const refine = useCallback(
    async (input: {
      intent?: Intent | null;
      urgency?: Urgency;
      state?: Partial<HadeState>;
      constraints?: HadeConstraints;
      candidate_categories?: string[];
    }) => {
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
        state: { energy: input.state?.energy ?? urgency },
        constraints: input.constraints,
        signals: [...signals, behavioralSig, intentSig],
        persona: activeAgent,
        settings,
        mode: modeRef.current,
        candidate_categories: input.candidate_categories
          ? mergeCandidateCategories(
              scenario?.request?.candidate_categories,
              candidateCategoriesRef.current,
              input.candidate_categories,
            )
          : mergeCandidateCategories(
              scenario?.request?.candidate_categories,
              candidateCategoriesRef.current,
            ),
      });
    },
    [emit, signals, activeAgent, settings, decide, userGeo, scenario],
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
    mode,
    setMode,
    regenerate,
    refine,
    getAlternative,
  };
}
