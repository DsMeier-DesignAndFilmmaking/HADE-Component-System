"use client";

import { useState, useCallback, useEffect, useRef, createContext, useContext } from "react";
import type {
  HadeContext,
  HadeConfig,
  AdaptiveState,
  HadeDecision,
  HadeResponse,
  HadeUX,
  UiState,
  Signal,
  SignalType,
  DecideRequest,
  Intent,
  EnergyLevel,
  Openness,
  GroupType,
} from "@/types/hade";
import { buildContext } from "./engine";
import {
  emitSignal,
  aggregateSignals,
  filterExpiredSignals,
  sortSignals,
} from "./signals";

// ─── useHadeEngine ────────────────────────────────────────────────────────────

/**
 * Core hook for building and managing HadeContext.
 * Provides context construction and typed setters for each nested group.
 *
 * updateContext() performs a deep merge — partial nested objects are merged
 * with existing values, not replaced wholesale.
 */
export function useHadeEngine(config: HadeConfig = {}) {
  const [context, setContext] = useState<HadeContext>(() =>
    buildContext({}, config)
  );

  const updateContext = useCallback(
    (patch: Partial<HadeContext>) => {
      setContext((prev) =>
        buildContext(
          {
            ...prev,
            ...patch,
            // Deep merge nested groups so callers can pass partial objects
            situation: { ...prev.situation, ...patch.situation },
            state: { ...prev.state, ...patch.state },
            social: { ...prev.social, ...patch.social },
            constraints: { ...prev.constraints, ...patch.constraints },
          },
          config
        )
      );
    },
    [config]
  );

  // Typed setters — preferred over raw updateContext for common mutations

  const setIntent = useCallback(
    (intent: Intent | null) =>
      updateContext({ situation: { intent } as HadeContext["situation"] }),
    [updateContext]
  );

  const setEnergy = useCallback(
    (energy: EnergyLevel) =>
      updateContext({ state: { energy } as HadeContext["state"] }),
    [updateContext]
  );

  const setOpenness = useCallback(
    (openness: Openness) =>
      updateContext({ state: { openness } as HadeContext["state"] }),
    [updateContext]
  );

  const setGroupType = useCallback(
    (group_type: GroupType) =>
      updateContext({ social: { group_type } as HadeContext["social"] }),
    [updateContext]
  );

  const setGroupSize = useCallback(
    (group_size: number) =>
      updateContext({ social: { group_size } as HadeContext["social"] }),
    [updateContext]
  );

  const setRadius = useCallback(
    (radius_meters: number) => updateContext({ radius_meters }),
    [updateContext]
  );

  const setGeo = useCallback(
    (geo: { lat: number; lng: number }) => updateContext({ geo }),
    [updateContext]
  );

  return {
    context,
    updateContext,
    setIntent,
    setEnergy,
    setOpenness,
    setGroupType,
    setGroupSize,
    setRadius,
    setGeo,
  };
}

// ─── useSignals ───────────────────────────────────────────────────────────────

/**
 * Manages a local collection of signals.
 * Provides emit, aggregate, and auto-expiry cleanup.
 */
export function useSignals(initialTypes?: SignalType[]) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const cleanupRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup expired signals every 30 seconds
  useEffect(() => {
    cleanupRef.current = setInterval(() => {
      setSignals((prev) => filterExpiredSignals(prev));
    }, 30_000);
    return () => {
      if (cleanupRef.current) clearInterval(cleanupRef.current);
    };
  }, []);

  const emit = useCallback((type: SignalType, payload?: Partial<Signal>) => {
    const newSignal = emitSignal(type, payload);
    setSignals((prev) => {
      const merged = aggregateSignals([...prev, newSignal]);
      return sortSignals(merged);
    });
    return newSignal;
  }, []);

  const clear = useCallback(() => setSignals([]), []);

  const filtered = initialTypes
    ? signals.filter((s) => initialTypes.includes(s.type))
    : signals;

  return { signals: filtered, all: signals, emit, clear };
}

// ─── useAdaptive ──────────────────────────────────────────────────────────────

/**
 * Primary hook — combines context, signals, and the /decide API.
 * Returns a single decision (HadeDecision | null), not a list.
 *
 * decide() POSTs to /hade/decide and stores the backend's decision directly.
 * The backend decision is trusted — no client-side re-ranking.
 *
 * pivot() adds the current decision to rejection_history and re-calls decide()
 * so the backend produces a new decision excluding the rejected venue.
 */
function _deriveUX(decision: HadeDecision, basis: string): HadeUX {
  const c = decision.confidence;
  const ui_state: UiState = c >= 0.7 ? "high" : c >= 0.4 ? "medium" : "low";
  const cta = basis === "fallback" ? "Explore nearby" : "Go now";
  return { ui_state, cta, badges: [], alternatives: [] };
}

export function useAdaptive(config: HadeConfig = {}): AdaptiveState {
  const { context, updateContext, setGeo } = useHadeEngine(config);
  const { signals, emit } = useSignals();
  const [decision, setDecision] = useState<HadeDecision | null>(null);
  const [response, setResponse] = useState<HadeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = useCallback(
    async (req?: Partial<DecideRequest>) => {
      // 1. Check for location
      if (!context.geo && !req?.geo) {
        setError("Location is required to generate a decision.");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const apiUrl = config.api_url ?? process.env.NEXT_PUBLIC_HADE_API_URL ?? "/api";

        // 2. Build the body with the Persona
        const body: DecideRequest = {
          // Pass the persona explicitly if provided in the call, 
          // or fallback to whatever logic you prefer
          persona: req?.persona, 
          
          geo: req?.geo ?? context.geo!,
          situation: req?.situation ?? context.situation,
          state: req?.state ?? context.state,
          social: req?.social ?? context.social,
          constraints: req?.constraints ?? context.constraints,
          time_of_day: req?.time_of_day ?? context.time_of_day,
          day_type: req?.day_type ?? context.day_type,
          radius_meters: req?.radius_meters ?? context.radius_meters,
          session_id: req?.session_id ?? context.session_id,
          signals: req?.signals ?? signals,
          rejection_history: req?.rejection_history ?? context.rejection_history,
        };

        const res = await fetch(`${apiUrl}/hade/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error(`HADE API error ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        console.log("[HADE] full response:", data);
        const dec = data.decision as HadeDecision;
        const ux = _deriveUX(dec, data.context_snapshot?.decision_basis ?? "llm");
        setDecision(dec);
        setResponse({ decision: dec, ux, context_snapshot: data.context_snapshot, session_id: data.session_id });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    [context, config.api_url, signals] // Added signals to dependency array for accuracy
  );

  const pivot = useCallback(
    (reason: string) => {
      if (!decision) return;

      // Add the dismissed venue to rejection_history
      updateContext({
        rejection_history: [
          ...(context.rejection_history ?? []),
          {
            venue_id: decision.id,
            venue_name: decision.venue_name,
            pivot_reason: reason,
          },
        ],
      });

      // Clear current decision and request a new one
      setDecision(null);
      decide();
    },
    [context.rejection_history, decision, updateContext, decide]
  );

  return {
    context,
    signals,
    decision,
    response,
    isLoading,
    error,
    setGeo,
    emit,
    decide,
    pivot,
  };
}

// ─── HadeAdaptiveContext ──────────────────────────────────────────────────────

export const HadeAdaptiveContext = createContext<AdaptiveState | null>(null);

export function useHadeAdaptiveContext(): AdaptiveState {
  const ctx = useContext(HadeAdaptiveContext);
  if (!ctx) {
    throw new Error("useHadeAdaptiveContext must be used within AdaptiveContainer");
  }
  return ctx;
}
