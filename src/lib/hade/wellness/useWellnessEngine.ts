"use client";

/**
 * useWellnessEngine — intent-first orchestration hook.
 *
 * The visible control is the user's selected intent. Ambient context is
 * derived internally from `Date` and never surfaces as an input.
 *
 * - On first render (server + first client paint) `ambientSignals` is the
 *   stable `SSR_DEFAULT_SIGNALS` constant so hydration is byte-stable.
 *   On client mount the hook swaps to a live `deriveAmbientSignals(new Date())`
 *   (or to the `now` override when supplied for tests).
 * - The primary recommendation comes from `resolveWellnessIntent(intent, signals)`.
 *   A parallel `contextHint` runs the legacy ambient resolver so the card
 *   can show a passive "Context suggests …" line without overriding intent.
 * - Simulated async fetch (250ms) + cancellation cleanup preserved exactly.
 */

import { useEffect, useMemo, useState } from "react";
import { getBadgesForContext } from "./badges";
import {
  SSR_DEFAULT_SIGNALS,
  deriveAmbientSignals,
} from "./deriveAmbientSignals";
import { MOCK_WELLNESS_PLACES } from "./mockPlaces";
import {
  resolveAmbientContext,
  resolveWellnessIntent,
} from "./resolveWellnessIntent";
import type {
  AmbientSignals,
  PillBadge,
  ResolvedQuery,
  WellnessIntent,
  WellnessPillar,
  WellnessPlace,
} from "./types";
import { filterPlaces } from "./validatePlace";

const MOCK_FETCH_LATENCY_MS = 250;

export interface UseWellnessEngineArgs {
  selectedIntent?: WellnessIntent;
  /** Optional fixed clock — primarily for tests; production callers omit it. */
  now?: Date;
}

export interface UseWellnessEngineResult {
  selectedIntent: WellnessIntent | undefined;
  /** Intent-driven recommendation (primary). */
  resolved: ResolvedQuery;
  /** Ambient-driven recommendation (passive — for the "context suggests" line). */
  contextHint: ResolvedQuery;
  /** The signals currently driving the engine — visible to the demo container. */
  ambientSignals: AmbientSignals;
  activePillar: WellnessPillar;
  places: WellnessPlace[];
  rejectedCount: number;
  rejectedNames: string[];
  loading: boolean;
  badges: PillBadge[];
}

function signalsKey(s: AmbientSignals): string {
  return `${s.weather}|${s.timeOfDay}|${s.dayOfWeek}|${s.userStressSignal}`;
}

export function useWellnessEngine({
  selectedIntent,
  now,
}: UseWellnessEngineArgs): UseWellnessEngineResult {
  // SSR-safe initial state.
  // If a fixed `now` is supplied (tests), derive immediately — that path is
  // deterministic and identical on server and client. Otherwise seed with
  // the stable default and hydrate after mount.
  const [ambientSignals, setAmbientSignals] = useState<AmbientSignals>(() =>
    now ? deriveAmbientSignals(now) : SSR_DEFAULT_SIGNALS,
  );

  useEffect(() => {
    // Live-derive on mount when no fixed clock was supplied. Re-runs only
    // when the caller explicitly changes `now` (e.g. in tests).
    if (!now) {
      setAmbientSignals(deriveAmbientSignals(new Date()));
      return;
    }
    setAmbientSignals(deriveAmbientSignals(now));
  }, [now]);

  const key = signalsKey(ambientSignals);

  const resolved = useMemo<ResolvedQuery>(
    () => resolveWellnessIntent(selectedIntent, ambientSignals),
    // `key` captures the full signals shape; resolver is pure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIntent, key],
  );

  const contextHint = useMemo<ResolvedQuery>(
    () => resolveAmbientContext(ambientSignals),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const badges = useMemo<PillBadge[]>(
    () => getBadgesForContext(ambientSignals, selectedIntent),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIntent, key],
  );

  const activePillar = resolved.pillar;

  // Simulated async fetch + filter with cancellation. Matches prior shape.
  const [loading, setLoading] = useState<boolean>(true);
  const [filtered, setFiltered] = useState<{
    kept: WellnessPlace[];
    rejected: WellnessPlace[];
  }>({ kept: [], rejected: [] });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      if (cancelled) return;
      const result = filterPlaces(MOCK_WELLNESS_PLACES, activePillar);
      setFiltered(result);
      setLoading(false);
    }, MOCK_FETCH_LATENCY_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [activePillar]);

  return {
    selectedIntent,
    resolved,
    contextHint,
    ambientSignals,
    activePillar,
    places: filtered.kept,
    rejectedCount: filtered.rejected.length,
    rejectedNames: filtered.rejected.map((p) => p.name),
    loading,
    badges,
  };
}
