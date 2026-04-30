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
  RejectionEntry,
  Signal,
  SignalType,
  DecideRequest,
  Intent,
  EnergyLevel,
  Openness,
  GroupType,
  CommunitySignalsConfig,
  AgentPersona,
  GeoLocation,
  VibeSignal,
  VibeTag,
  SpontaneousObject,
} from "@/types/hade";
import { buildContext } from "./engine";
import {
  emitSignal,
  aggregateSignals,
  filterExpiredSignals,
  sortSignals,
} from "./signals";
import { SignalQueue } from "./queue";
import { getDeviceId } from "./deviceId";
import { computeTemporalState, getUGCCta } from "./ugcCopy";
import { HADE_ENDPOINTS } from "./api";

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

  // Ref-ify config so updateContext and all setters have stable identities.
  // Config only carries defaults (api_url, default_radius) that don't change
  // at runtime — but the object reference changes every render when passed
  // as a literal `{}`, which would cascade into unstable callbacks.
  const configRef = useRef(config);
  configRef.current = config;

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
          configRef.current
        )
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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
    (radius_meters: number | ((prev: number) => number)) =>
      setContext((prev) =>
        buildContext(
          {
            ...prev,
            radius_meters:
              typeof radius_meters === "function"
                ? radius_meters(prev.radius_meters)
                : radius_meters,
          },
          configRef.current
        )
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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

function _deriveUX(
  decision: HadeDecision,
  basis: string,
  confidenceThreshold: number = 0,
): HadeUX {
  const c = decision.confidence;
  // Shift tier boundaries upward based on user's confidence threshold setting.
  // At threshold 0, bars are 0.7 / 0.4 (original). At threshold 0.5, they
  // become 0.95 / 0.55 — making the system much pickier before showing "Go now".
  const highBar = 0.7 + confidenceThreshold * 0.5;
  const medBar  = 0.4 + confidenceThreshold * 0.3;
  const ui_state: UiState = c >= highBar ? "high" : c >= medBar ? "medium" : "low";

  // UGC CTA — temporal state overrides confidence axis
  if (decision.ugc_meta?.is_ugc) {
    const temporal = computeTemporalState(
      decision.ugc_meta.expires_at,
      decision.ugc_meta.created_at,
    );
    const cta = getUGCCta(temporal, ui_state);
    return { ui_state, cta, badges: [] };
  }

  const cta =
    ui_state === "high" ? "Go now" :
    ui_state === "medium" ? "Explore nearby" :
    "Help me refine";
  return { ui_state, cta, badges: [] };
}

// ─── Payload Validation ──────────────────────────────────────────────────────

/**
 * Pre-validation shape — geo may be null before geolocation resolves.
 * All other fields from DecideRequest are preserved as-is.
 */
type DecidePayloadCandidate = Omit<DecideRequest, "geo"> & {
  geo: GeoLocation | null;
};

/**
 * A DecideRequest whose required runtime fields have been verified.
 * TypeScript narrows DecidePayloadCandidate → ValidatedDecidePayload after
 * the guard passes, guaranteeing persona and geo before the fetch fires.
 */
type ValidatedDecidePayload = DecideRequest & {
  persona: AgentPersona;
};

/**
 * Runtime type guard — checks persona and geo before any side effects.
 * Logs a descriptive warning on the first violation and returns false
 * so the caller can bail without touching loading or abort state.
 */
function validateDecidePayload(
  body: DecidePayloadCandidate,
): body is ValidatedDecidePayload {
  if (
    !body.geo ||
    typeof body.geo.lat !== "number" ||
    typeof body.geo.lng !== "number" ||
    !Number.isFinite(body.geo.lat) ||
    !Number.isFinite(body.geo.lng)
  ) {
    console.warn(
      "[HADE] decide aborted — geo is missing or contains non-finite coordinates.",
      { geo: body.geo ?? null },
    );
    return false;
  }

  if (!body.persona?.id || !body.persona?.role) {
    console.warn(
      "[HADE] decide aborted — persona is undefined or incomplete. " +
        "This usually means agent definitions have not loaded yet.",
      { persona: body.persona ?? null },
    );
    return false;
  }

  return true;
}

/**
 * Primary hook — combines context, signals, and the /decide API.
 * Returns a single decision (HadeDecision | null), not a list.
 *
 * decide() POSTs to /hade/decide and stores the backend's decision directly.
 *
 * pivot() adds the current decision to rejection_history and re-calls decide()
 * so the backend produces a new decision excluding the rejected venue.
 */

export function useAdaptive(config: HadeConfig = {}): AdaptiveState {
  const { context, updateContext, setGeo, setRadius } = useHadeEngine(config);
  const { signals, emit } = useSignals();
  const [decision, setDecision] = useState<HadeDecision | null>(null);
  const [response, setResponse] = useState<HadeResponse | null>(null);
  const [rejectionHistory, setRejectionHistory] = useState<RejectionEntry[]>([]);

  useEffect(() => {
    console.log("[HADE STATE]", {
      rejection_history_length: rejectionHistory.length,
      reasons: rejectionHistory.map((r) => r.pivot_reason),
    });
  }, [rejectionHistory]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDegraded, setIsDegraded] = useState(false);
  const [cachedRealPlaces, setCachedRealPlaces] = useState<SpontaneousObject[]>([]);

  // ── Community Signals (UGC) ──
  const [communitySignals, setCommunitySignalsState] = useState<CommunitySignalsConfig>({
    enabled: false,
    shareCurrentSignal: false,
  });

  const setCommunitySignals = useCallback((enabled: boolean) => {
    setCommunitySignalsState({ enabled, shareCurrentSignal: enabled });
  }, []);

  // Ref-ify isDegraded so emitVibeSignal can read it without being recreated.
  const isDegradedRef = useRef(isDegraded);
  isDegradedRef.current = isDegraded;

  // Ref-ify mutable state so decide() has a stable identity.
  // Without this, every context/signal/rejectionHistory change recreates
  // decide(), which cascades into consumer effects and causes 4+ API calls.
  const contextRef = useRef(context);
  contextRef.current = context;
  const signalsRef = useRef(signals);
  signalsRef.current = signals;
  const rejectionHistoryRef = useRef(rejectionHistory);
  rejectionHistoryRef.current = rejectionHistory;

  const abortRef = useRef<AbortController | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  // Retains the persona from the last successful decide call so pivot(),
  // which has no access to the active agent, can inherit it automatically.
  const lastPersonaRef = useRef<AgentPersona | null>(null);
  // Fixed for the lifetime of this mount — survives pivot/refine, resets on page reload.
  const sessionIdRef = useRef(crypto.randomUUID());

  const REJECTION_HISTORY_CAP = 20;

  // ── Vibe Signal / UGC queue ──────────────────────────────────────────────
  // A Set of venue IDs that have received VibeSignal updates since the last
  // decide() call. Passed as node_hints so the route fetches fresh weights.
  const pendingNodeHints = useRef<Set<string>>(new Set());

  const signalQueue = useRef<SignalQueue>(
    new SignalQueue({
      onFlush: (res) => {
        signalQueue.current.setSessionId(sessionIdRef.current);
        if (process.env.NODE_ENV === "development") {
          console.debug("[HADE SignalQueue] flush accepted:", res.accepted, res.node_versions);
        }
      },
      onError: (err, dropped) => {
        console.warn("[HADE SignalQueue] dropped", dropped.length, "signals after retries:", err.message);
      },
    }),
  );

  function generateLocalAlternative(state: {
    geo: GeoLocation;
    rejection_history: RejectionEntry[];
    intent?: Intent | null;
  }): HadeDecision {
    const now = Date.now();

    const reasons = state.rejection_history.map((r) => r.pivot_reason.toLowerCase());
    const rejectedTitles = new Set(state.rejection_history.map((r) => r.venue_name.toLowerCase()));
    const rejectedIds = new Set(state.rejection_history.map((r) => r.venue_id));
    const historyLength = state.rejection_history.length;

    const hasCrowded   = reasons.some((r) => r.includes("crowd") || r.includes("busy") || r.includes("packed") || r === "too crowded");
    const hasOverpriced = reasons.some((r) => r.includes("pric") || r.includes("expensiv") || r.includes("cheap") || r === "overpriced");
    const hasWrongVibe  = reasons.some((r) => r.includes("vibe") || r.includes("scene") || r === "wrong vibe");

    type Candidate = { id: string; title: string; category: string; rationale: string; why_now: string };

    // ── Tier 3 escalation (3+ rejections) ────────────────────────────────────
    const escalationPool: Candidate[] = [
      {
        id: "esc-walk-reset",
        title: "Take a short walk and reset",
        category: "outdoor",
        rationale: "Movement breaks the loop — step outside and let the next idea surface.",
        why_now: "Three passes is enough. A walk costs nothing and clears the frame.",
      },
      {
        id: "esc-casual-coffee",
        title: "Grab a casual coffee",
        category: "cafe",
        rationale: "No agenda, no pressure — just a cup and a moment.",
        why_now: "Low commitment, easy exit, zero friction.",
      },
      {
        id: "esc-people-watch",
        title: "Sit somewhere open and people-watch",
        category: "outdoor",
        rationale: "Sometimes the best move is no move at all.",
        why_now: "You've been deciding for a while — let the city do the work.",
      },
    ];

    // ── Tier 1 pool (1 rejection — quiet / low-key) ───────────────────────────
    const quietPool: Candidate[] = [
      {
        id: "q-quiet-spot",
        title: "Find a quiet spot nearby",
        category: "rest",
        rationale: "Somewhere low-key with no queue and no noise.",
        why_now: "First pass — pull back and reset before trying again.",
      },
      {
        id: "q-bench",
        title: "Find a bench and take a breath",
        category: "rest",
        rationale: "A seated pause is sometimes the right call.",
        why_now: "No pressure, no decision required.",
      },
    ];

    // ── Tier 2 pool (2 rejections — switch category) ──────────────────────────
    const switchPool: Candidate[] = [
      {
        id: "sw-walk",
        title: "Take a walk nearby",
        category: "outdoor",
        rationale: "Walking switches the mode from choosing to moving.",
        why_now: "Second rejection — change category entirely.",
      },
      {
        id: "sw-coffee",
        title: "Grab a drip coffee somewhere simple",
        category: "cafe",
        rationale: "A no-frills café resets the vibe without a big commitment.",
        why_now: "Different category, low stakes.",
      },
      {
        id: "sw-park",
        title: "Sit in a nearby park",
        category: "outdoor",
        rationale: "Open air, no cover charge, no queue.",
        why_now: "Free, calm, right here.",
      },
    ];

    // ── Reason-override candidates ────────────────────────────────────────────
    const crowdedOverride: Candidate = {
      id: "ov-crowd-quiet",
      title: "Find somewhere quieter",
      category: "rest",
      rationale: "Somewhere low-key that sidesteps the crowd entirely.",
      why_now: "You flagged it's too busy — this shifts the energy down.",
    };
    const overpricedOverride: Candidate = {
      id: "ov-budget",
      title: "Find something free or close to it",
      category: "outdoor",
      rationale: "No spend required — fresh air and open space cost nothing.",
      why_now: "You mentioned price — this removes it as a variable.",
    };
    const wrongVibeOverride: Candidate = {
      id: "ov-vibe-switch",
      title: "Explore a different part of this area",
      category: "exploration",
      rationale: "A block in any direction can be a completely different scene.",
      why_now: "Vibe mismatch — change the backdrop, not the destination type.",
    };

    // ── Select pool by progression tier ──────────────────────────────────────
    let candidates: Candidate[];
    if (historyLength >= 3) {
      candidates = escalationPool;
    } else if (historyLength === 2) {
      candidates = switchPool;
    } else {
      candidates = quietPool;
    }

    // Reason overrides prepend to current tier pool (don't replace)
    if (hasWrongVibe)   candidates = [wrongVibeOverride, ...candidates];
    if (hasOverpriced)  candidates = [overpricedOverride, ...candidates];
    if (hasCrowded)     candidates = [crowdedOverride, ...candidates];

    const pick =
      candidates.find(
        (c) => !rejectedIds.has(c.id) && !rejectedTitles.has(c.title.toLowerCase()),
      ) ?? escalationPool[historyLength % escalationPool.length];

    const lat = typeof state.geo.lat === "number" && isFinite(state.geo.lat) ? state.geo.lat : 0;
    const lng = typeof state.geo.lng === "number" && isFinite(state.geo.lng) ? state.geo.lng : 0;

    const decision: HadeDecision = {
      id: `local-${pick.id}-${now}`,
      venue_name: pick.title,
      title: pick.title,
      category: pick.category,
      geo: { lat, lng },
      distance_meters: 0,
      eta_minutes: 5,
      rationale: pick.rationale,
      why_now: pick.why_now,
      confidence: 0.4,
      situation_summary: "Local fallback",
      type: "place_opportunity",
      time_window: { start: now, end: now + 2 * 60 * 60 * 1000 },
      location: { lat, lng },
      radius: 500,
      going_count: 0,
      maybe_count: 0,
      user_state: null,
      created_at: now,
      expires_at: now + 2 * 60 * 60 * 1000,
      trust_score: 0.4,
      source: "local_degraded_refine",
    } as HadeDecision;

    console.log("[HADE LOCAL DECISION]", decision);

    return decision;
  }

  const decide = useCallback(
    async (req?: Partial<DecideRequest>) => {
      const ctx = contextRef.current;
      const sigs = signalsRef.current;
      const rejHistory = rejectionHistoryRef.current;

      // 1. Assemble candidate payload — persona falls back to lastPersonaRef
      //    so pivot() inherits it automatically. geo drops the `!` assertion
      //    and stays GeoLocation | null until the guard below validates it.
      // Snapshot and clear pending node hints so this decide() includes them
      const nodeHints = [...pendingNodeHints.current];
      pendingNodeHints.current.clear();

      // Strip synthetic fallback/offline IDs and cap length so a long-running
      // session with repeated degraded responses can't bloat the request.
      const rawRejHistory = req?.rejection_history ?? rejHistory;
      const cleanRejHistory = rawRejHistory
        .filter(
          (r) =>
            !r.venue_id.startsWith("fallback-") &&
            !r.venue_id.startsWith("offline-"),
        )
        .slice(-REJECTION_HISTORY_CAP);

      const body: DecidePayloadCandidate = {
        persona:           req?.persona ?? lastPersonaRef.current ?? undefined,
        geo:               req?.geo ?? ctx.geo,
        situation:         req?.situation ?? ctx.situation,
        state:             req?.state ?? ctx.state,
        social:            req?.social ?? ctx.social,
        constraints:       req?.constraints ?? ctx.constraints,
        time_of_day:       req?.time_of_day ?? ctx.time_of_day,
        day_type:          req?.day_type ?? ctx.day_type,
        radius_meters:     req?.radius_meters ?? ctx.radius_meters,
        session_id:        req?.session_id ?? sessionIdRef.current,
        signals:           req?.signals ?? sigs,
        rejection_history: cleanRejHistory,
        settings:          {
          ...(req?.settings ?? {}),
          debug: process.env.NODE_ENV !== "production",
        },
        node_hints:        nodeHints.length > 0 ? nodeHints : undefined,
      };

      // 2. Validate before any side effects. Logs a specific warning for the
      //    first missing field and returns false so we exit cleanly.
      //    After this point body is narrowed to ValidatedDecidePayload —
      //    body.persona: AgentPersona and body.geo: GeoLocation are guaranteed.
      if (!validateDecidePayload(body)) {
        const missing = !body.geo ? "Location access is required." : "Agent configuration is missing.";
        setError(missing);
        return;
      }

      // Abort any in-flight request before starting a new one
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        if (process.env.NODE_ENV !== "production") {
          console.log("[HADE ENDPOINT]", HADE_ENDPOINTS.decide);
        }
        console.log("[HADE REQUEST PAYLOAD]", body);
        const res = await fetch(HADE_ENDPOINTS.decide, {
          method: "POST",
          headers: {
            "Content-Type":     "application/json",
            "x-hade-device-id": getDeviceId(),
          },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HADE API error ${res.status}: ${res.statusText}`);
        }

        const hadeSource     = res.headers.get("x-hade-source")   ?? "unknown";
        const headerDegraded = res.headers.get("x-hade-degraded") === "1";

        const data = await res.json();

        if (process.env.NODE_ENV !== "production") {
          console.log("[HADE RESPONSE]", data);
          if (data?.debug) {
            console.log("[HADE DEBUG]", data.debug);
          }
        }

        const bodyDegraded   = data.degraded === true;
        const newDegraded    = headerDegraded || bodyDegraded;
        setIsDegraded(newDegraded);

        console.log(
          `[HADE stability] source=${hadeSource} | degraded=${newDegraded} | rejection_history=${(body.rejection_history ?? []).length}`,
        );
        console.log("[HADE] full response:", data);

        if (!data || !data.decision) {
          throw new Error("Invalid HADE response");
        }

        const dec = data.decision as HadeDecision;
        const safeDecision: HadeDecision = {
          ...dec,
          venue_name: dec?.venue_name ?? "",
          category:   dec?.category ?? "",
          geo:        dec?.geo ?? null,
          confidence: dec?.confidence ?? 0,
          ugc_meta:   dec?.ugc_meta ?? undefined,
        } as HadeDecision;

        const ux = _deriveUX(
          safeDecision,
          data.context_snapshot?.decision_basis ?? "llm",
          req?.settings?.confidence_threshold ?? 0,
        );
        const shaped: HadeResponse = {
          decision: safeDecision,
          ux,
          context_snapshot: data.context_snapshot,
          session_id: data.session_id,
          debug: data.debug ?? undefined,
          source: hadeSource,
          ...(data.explanation_signals ? { explanation_signals: data.explanation_signals } : {}),
        };
        const pipelinePlaces = Array.isArray(data.fallback_places) ? data.fallback_places : [];
        console.log("[HADE PIPELINE]", {
          degraded: newDegraded,
          hasPlaces: pipelinePlaces.length > 0,
          placesCount: pipelinePlaces.length,
          usingFallback: safeDecision?.is_fallback === true,
        });
        setDecision({ ...safeDecision });
        setResponse(shaped);
        if (Array.isArray(data.fallback_places) && data.fallback_places.length > 0) {
          const realPlaces = (data.fallback_places as SpontaneousObject[]).filter(
            (p) => !p.id.startsWith("fallback-") && !p.id.startsWith("offline-"),
          );
          if (realPlaces.length > 0) setCachedRealPlaces(realPlaces);
        }
        lastPersonaRef.current = body.persona; // cache for subsequent pivot() calls
        updateContext({
          session_id: data.session_id,
          ...(req?.situation && { situation: req.situation as HadeContext["situation"] }),
          ...(req?.state && { state: req.state as HadeContext["state"] }),
          ...(req?.social && { social: req.social as HadeContext["social"] }),
          ...(req?.constraints && { constraints: req.constraints }),
        });
      } catch (err) {
        // Silently ignore aborted requests — a newer request replaced this one
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateContext]
  );

  const pivot = useCallback(
    (reason: string) => {
      if (!decision) return;

      // ── Fallback rejection recovery ───────────────────────────────────────────
      // If the current decision is a fallback, do NOT re-enter the normal decide()
      // path (which would produce another fallback and loop). Instead, recover
      // using cached real places or generateLocalAlternative().
      if (decision.is_fallback) {
        const geo = contextRef.current.geo ?? { lat: 0, lng: 0 };
        const rejectedIds = new Set(rejectionHistory.map((r) => r.venue_id));

        const recoveryPlace = cachedRealPlaces.find((p) => !rejectedIds.has(p.id));
        if (recoveryPlace) {
          const now = Date.now();
          const recovered: HadeDecision = {
            ...recoveryPlace,
            venue_name: recoveryPlace.title,
            category: recoveryPlace.type ?? "place_opportunity",
            geo,
            distance_meters: 0,
            eta_minutes: 5,
            rationale: "Recovered from local cache after fallback rejection.",
            why_now: "Using a nearby real place instead of a generated suggestion.",
            confidence: 0.5,
            situation_summary: "Cache recovery",
            is_fallback: false,
            source: "cache_recovery",
            created_at: recoveryPlace.created_at ?? now,
            expires_at: recoveryPlace.expires_at ?? now + 2 * 60 * 60 * 1000,
          } as HadeDecision;
          console.log(`[HADE stability] fallback rejection — recovered from cached real place (${recoveryPlace.id})`);
          console.log("[HADE UI DECISION]", recovered.id, recovered.title);
          console.log("[HADE PIPELINE]", {
            degraded: isDegradedRef.current,
            hasPlaces: cachedRealPlaces.length > 0,
            placesCount: cachedRealPlaces.length,
            usingFallback: recovered?.is_fallback === true,
          });
          setDecision({ ...recovered });
          setResponse({
            decision: { ...recovered },
            ux: _deriveUX(recovered, "fallback", 0),
            context_snapshot: { situation_summary: "Cache recovery", interpreted_intent: "", decision_basis: "fallback", candidates_evaluated: 0 },
            session_id: sessionIdRef.current,
            source: "static_fallback",
          });
          return;
        }

        const local = generateLocalAlternative({ geo, rejection_history: rejectionHistory });
        console.log(`[HADE stability] fallback rejection — no cache, using generateLocalAlternative`);
        console.log("[HADE UI DECISION]", local.id, local.title);
        console.log("[HADE PIPELINE]", {
          degraded: isDegradedRef.current,
          hasPlaces: false,
          placesCount: 0,
          usingFallback: local?.is_fallback === true,
        });
        setDecision({ ...local });
        setResponse({
          decision: { ...local },
          ux: _deriveUX(local, "fallback", 0),
          context_snapshot: { situation_summary: "Local fallback", interpreted_intent: "", decision_basis: "fallback", candidates_evaluated: 0 },
          session_id: sessionIdRef.current,
          source: "static_fallback",
        });
        return;
      }

      // ── Normal pivot ──────────────────────────────────────────────────────────
      // Refuse to pivot on synthetic fallback/offline IDs — pushing them into
      // rejection_history would have no semantic meaning to the server and,
      // before the route returns 503, was the trigger for the infinite loop.
      if (
        decision.id.startsWith("fallback-") ||
        decision.id.startsWith("offline-")
      ) {
        return;
      }

      const currentRejection: RejectionEntry = {
        venue_id: decision.id,
        venue_name: decision.venue_name,
        pivot_reason: reason,
      };

      // Use ref for read — always current even under rapid calls.
      const latestHistory = rejectionHistoryRef.current;
      const alreadyRejected = latestHistory.some((entry) => entry.venue_id === decision.id);
      const nextRejectionHistory = alreadyRejected
        ? latestHistory
        : [...latestHistory, currentRejection];

      console.log(
        `[HADE stability] pivot | rejection_history_length=${nextRejectionHistory.length} | venue=${currentRejection.venue_id} | reason="${reason}"`,
      );

      // Functional update — no stale closure, accumulates correctly across rapid calls.
      setRejectionHistory((prev) =>
        prev.some((entry) => entry.venue_id === decision.id) ? prev : [...prev, currentRejection]
      );
      updateContext({ rejection_history: nextRejectionHistory });

      // Clear current decision and request a new one with explicit rejection history.
      // flushAsync() ensures any VibeSignal emitted in the same tick (e.g. from
      // handlePivotReasonSelect) reaches POST /api/hade/signal before decide() fires,
      // so LocationNode weights are updated before enrichWithNodeWeights() runs.
      setDecision(null);
      void signalQueue.current.flushAsync().then(() =>
        decide({ rejection_history: nextRejectionHistory })
      );
    },
    [decision, cachedRealPlaces, updateContext, decide, signalQueue]
  );

  /**
   * Emit a VibeSignal for a specific venue.
   *
   * Non-blocking: enqueues immediately and returns the VibeSignal.
   * The queue flushes to POST /api/hade/signal on the next idle frame.
   * The venue ID is added to pendingNodeHints so the next decide() call
   * fetches fresh weights from the LocationNode registry.
   */
  const emitVibeSignal = useCallback(
    (
      venueId:   string,
      tags:      VibeTag[],
      sentiment: VibeSignal["sentiment"],
      strength:  number = 0.7,
    ): VibeSignal => {
      const now     = new Date();
      // VIBE TTL: 4 hours (matches AMBIENT in the signal_ttl_map)
      const expires = new Date(now.getTime() + 14_400_000);

      const vibeSignal: VibeSignal = {
        id:               `vsig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type:             "AMBIENT",   // closest base type; route handler marks as "vibe" category
        venue_id:         venueId,
        location_node_id: venueId,
        content:          tags.join(", "),
        strength:         Math.max(0, Math.min(1, strength)),
        emitted_at:       now.toISOString(),
        expires_at:       expires.toISOString(),
        geo:              contextRef.current.geo ?? { lat: 0, lng: 0 },
        source:           "user",
        category:         "vibe",
        shareable:        communitySignals.enabled,
        validation_status: "pending",
        vibe_tags:        tags,
        sentiment,
        // Device ID for UGC attribution and server-side abuse detection.
        // getDeviceId() is always non-empty ("server" in SSR, "unknown" if
        // localStorage is blocked) — no null/empty-string guard needed.
        source_user_id:   getDeviceId(),
      };

      if (isDegradedRef.current) {
        console.warn(
          `[HADE] degraded — signal stored for local refinement`,
        );
      }

      // Only track real venue IDs (Google Place IDs) in node_hints.
      // LLM and static fallback decisions return synthetic IDs like "fallback-abc123"
      // or "offline-abc123" that will never match a Place in a future Tier 2 response.
      // Creating LocationNodes for those IDs pollutes the registry.
      const isFallbackId = venueId.startsWith("fallback-") || venueId.startsWith("offline-");
      if (!isFallbackId) {
        pendingNodeHints.current.add(venueId);
      }

      // Enqueue for idle-frame flush — never blocks the render cycle
      signalQueue.current.setSessionId(sessionIdRef.current);
      signalQueue.current.enqueue(vibeSignal);

      return vibeSignal;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [communitySignals.enabled],
  );

  return {
    context,
    signals,
    decision,
    response,
    isLoading,
    error,
    isDegraded,
    setGeo,
    setRadius,
    emit,
    decide,
    pivot,
    communitySignals,
    setCommunitySignals,
    emitVibeSignal,
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
