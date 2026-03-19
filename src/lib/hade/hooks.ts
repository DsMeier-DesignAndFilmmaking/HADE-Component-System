"use client";

import { useState, useCallback, useEffect, useRef, createContext, useContext } from "react";
import type {
  HadeContext,
  HadeConfig,
  AdaptiveState,
  Signal,
  SignalType,
  Opportunity,
  DecideRequest,
  Intent,
  EnergyLevel,
} from "@/types/hade";
import { buildContext, rankOpportunities } from "./engine";
import {
  emitSignal,
  aggregateSignals,
  filterExpiredSignals,
  sortSignals,
} from "./signals";

// ─── useHadeEngine ────────────────────────────────────────────────────────────

/**
 * Core hook for building and managing HadeContext.
 * Provides context construction, updates, and derived state.
 */
export function useHadeEngine(config: HadeConfig = {}) {
  const [context, setContext] = useState<HadeContext>(() =>
    buildContext({}, config)
  );

  const updateContext = useCallback(
    (patch: Partial<HadeContext>) => {
      setContext((prev) => buildContext({ ...prev, ...patch }, config));
    },
    [config]
  );

  const setIntent = useCallback(
    (intent: Intent) => updateContext({ intent }),
    [updateContext]
  );

  const setEnergyLevel = useCallback(
    (energy_level: EnergyLevel) => updateContext({ energy_level }),
    [updateContext]
  );

  const setRadius = useCallback(
    (radius_meters: number) => updateContext({ radius_meters }),
    [updateContext]
  );

  return { context, updateContext, setIntent, setEnergyLevel, setRadius };
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

// ─── useAdaptive ─────────────────────────────────────────────────────────────

/**
 * Full adaptive state hook — combines context, signals, and decide API.
 * This is the primary hook for AdaptiveContainer and demo pages.
 */
export function useAdaptive(config: HadeConfig = {}): AdaptiveState {
  const { context, updateContext } = useHadeEngine(config);
  const { signals, emit, clear: clearSignals } = useSignals();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primary = opportunities.find((o) => o.is_primary) ?? opportunities[0] ?? null;

  const decide = useCallback(
    async (req?: Partial<DecideRequest>) => {
      if (!context.geo && !req?.geo) {
        setError("Location required to generate recommendations.");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const apiUrl =
          config.api_url ?? process.env.NEXT_PUBLIC_HADE_API_URL ?? "http://localhost:8000";

        const body: DecideRequest = {
          geo: req?.geo ?? context.geo!,
          intent: req?.intent ?? context.intent,
          group_size: req?.group_size ?? context.group_size,
          session_id: req?.session_id ?? context.session_id,
          energy_level: req?.energy_level ?? context.energy_level,
          radius_meters: req?.radius_meters ?? context.radius_meters,
          rejection_history: req?.rejection_history ?? context.rejection_history,
        };

        const res = await fetch(`${apiUrl}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error(`API error ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        const ranked = rankOpportunities(
          [data.primary, ...data.fallbacks],
          context
        );
        setOpportunities(
          ranked.map((o, i) => ({ ...o, is_primary: i === 0 }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    [context, config.api_url]
  );

  const pivot = useCallback(
    (reason: string) => {
      if (!primary) return;
      updateContext({
        rejection_history: [
          ...(context.rejection_history ?? []),
          {
            venue_id: primary.id,
            venue_name: primary.venue_name,
            pivot_reason: reason,
          },
        ],
      });
      setOpportunities((prev) => prev.filter((o) => !o.is_primary));
    },
    [context.rejection_history, primary, updateContext]
  );

  return {
    context,
    signals,
    opportunities,
    primary,
    isLoading,
    error,
    emit,
    decide,
    pivot,
  };
}

// ─── HadeContext React Context ────────────────────────────────────────────────

export const HadeAdaptiveContext = createContext<AdaptiveState | null>(null);

export function useHadeAdaptiveContext(): AdaptiveState {
  const ctx = useContext(HadeAdaptiveContext);
  if (!ctx) {
    throw new Error("useHadeAdaptiveContext must be used within AdaptiveContainer");
  }
  return ctx;
}
