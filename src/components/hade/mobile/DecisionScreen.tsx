"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Intent, VibeTag } from "@/types/hade";
import type { DecisionViewModel } from "@/lib/hade/viewModel";
import { useHadeAdaptiveContext } from "@/lib/hade/hooks";
import { useHade } from "@/lib/hade/useHade";
import { computeTemporalState, getUGCPivotReasons } from "@/lib/hade/ugcCopy";
import { HeroDecisionCard } from "./HeroDecisionCard";

import { SecondaryActions } from "./SecondaryActions";
import { RefineSheet } from "./RefineSheet";
import { VibeSheet } from "./VibeSheet";
import { UgcVerificationSheet } from "./UgcVerificationSheet";
import { LoadingState } from "./LoadingState";
import { ErrorBoundary } from "./ErrorBoundary";
import { ActivityCreationView } from "./ActivityCreationView";

type Urgency = "low" | "medium" | "high";
type PivotReason = "Too crowded" | "Wrong vibe" | "Too far" | "Overpriced";

const PIVOT_REASONS: PivotReason[] = [
  "Too crowded",
  "Wrong vibe",
  "Too far",
  "Overpriced",
];

function mapReasonToTags(reason: string): string[] {
  switch (reason) {
    case "Too crowded":
      return ["too_crowded"];
    case "Wrong vibe":
      return ["dead", "skip_it"];
    case "Overpriced":
      return ["overpriced"];
    case "Too far":
      return ["too_far"];
    default:
      return [];
  }
}

function toVibeTags(tags: string[]): VibeTag[] {
  const validTags: VibeTag[] = [
    "too_crowded",
    "perfect_vibe",
    "overpriced",
    "hidden_gem",
    "loud",
    "quiet",
    "good_energy",
    "dead",
    "worth_it",
    "skip_it",
    "too_far",
  ];
  const allowed = new Set(validTags);
  return tags.filter((tag): tag is VibeTag => allowed.has(tag as VibeTag));
}

function DebugOverlay({ decision }: { decision: DecisionViewModel }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(decision.confidence * 100);
  const pillClass = decision.is_ugc
    ? "bg-orange-500/90 text-white"
    : "bg-blue-500/90 text-white";

  return (
    <div className="fixed right-3 top-14 z-50 flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`rounded-full px-2.5 py-1 text-[10px] font-mono font-semibold leading-none shadow-lg ${pillClass}`}
      >
        {decision.is_ugc ? "◎ UGC" : "⊕ G"} · {pct}%
      </button>

      {expanded && (
        <div className="w-44 rounded-xl border border-white/10 bg-ink/90 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-white/90 shadow-xl backdrop-blur-sm">
          <div className="flex justify-between">
            <span className="text-white/50">is_ugc</span>
            <span className={decision.is_ugc ? "text-orange-400" : "text-blue-400"}>
              {decision.is_ugc ? "true" : "false"}
            </span>
          </div>

          <div className="mt-1 flex justify-between">
            <span className="text-white/50">confidence</span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-white/70 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mt-1.5 flex justify-between">
            <span className="text-white/50">ui_state</span>
            <span>{decision.ui_state}</span>
          </div>

          {decision.temporal_state ? (
            <div className="mt-1 flex justify-between">
              <span className="text-white/50">temporal</span>
              <span className="text-orange-300">{decision.temporal_state}</span>
            </div>
          ) : decision.is_ugc ? (
            <div className="mt-1 flex justify-between">
              <span className="text-white/50">temporal</span>
              <span className="text-white/30">—</span>
            </div>
          ) : null}

          {decision.is_fallback && (
            <div className="mt-1.5 text-yellow-400">⚠ fallback</div>
          )}
        </div>
      )}
    </div>
  );
}

interface DecisionScreenProps {
  scenarioId?: string | null;
}

export function DecisionScreen({ scenarioId }: DecisionScreenProps) {
  const { emitVibeSignal, pivot } = useHadeAdaptiveContext();
  const {
    decision,
    status,
    error,
    isFallback,
    regenerate,
    refine,
  } = useHade({ scenarioId });

  const [refineOpen, setRefineOpen] = useState(false);
  const [showPivotReasons, setShowPivotReasons] = useState(false);
  const [showVibeSheet, setShowVibeSheet] = useState(false);
  const [showVerificationSheet, setShowVerificationSheet] = useState(false);
  const [showCreationFlow, setShowCreationFlow] = useState(false);
  const [rejectionCount, setRejectionCount] = useState(0);
  const [rejectionHistory, setRejectionHistory] = useState<Array<{ venueId: string; reason: string; timestamp: number }>>([]);
  const [decisionHistory, setDecisionHistory] = useState<DecisionViewModel[]>([]);
  // When "Previous" is pressed we restore a past card without calling pivot().
  // This local override takes precedence over the live decision from useHade.
  const [previousOverride, setPreviousOverride] = useState<DecisionViewModel | null>(null);

  useEffect(() => {
    console.log("[HADE STATE]", {
      rejection_history_length: rejectionHistory.length,
      reasons: rejectionHistory.map((r) => r.reason),
    });
  }, [rejectionHistory]);

  // Push each new decision onto the history stack so "Previous" can navigate back.
  // We track by id so rapid re-renders don't push duplicates.
  // Also clear any previous-override whenever a genuinely new decision arrives.
  const lastPushedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!decision) return;
    if (decision.id === lastPushedIdRef.current) return;
    lastPushedIdRef.current = decision.id;
    setPreviousOverride(null); // new live decision — drop the override
    setDecisionHistory((prev) => [...prev, decision]);
  }, [decision]);

  const handlePrevious = useCallback(() => {
    setDecisionHistory((prev) => {
      if (prev.length < 2) return prev;
      // Pop the current entry and surface the one before it.
      const next = prev.slice(0, -1);
      const target = next[next.length - 1];
      console.log("[HADE] Previous →", target.id, target.title);
      // We don't call pivot() here — no rejection is recorded.
      // Restore the previous decision directly in the view model.
      // useHade doesn't expose a setter, so we surface it via a
      // local override state managed in this component.
      setPreviousOverride(target);
      return next;
    });
  }, []);

  const visitRef = useRef<{
    venueId:   string;
    venueName: string;
    pressedAt: number;
    isUGC:     boolean;
    timerId?:  NodeJS.Timeout;
  } | null>(null);

  // Cancel any pending post-visit timer on unmount / navigation
  useEffect(() => {
    return () => {
      if (visitRef.current?.timerId) {
        clearTimeout(visitRef.current.timerId);
      }
    };
  }, []);

  // Expiry polling — every 60s while a UGC card is displayed.
  // If the card transitions to "suppressed" state, regenerate automatically.
  useEffect(() => {
    if (!decision?.ugc_meta) return;
    const { expires_at, created_at } = decision.ugc_meta;

    const interval = setInterval(() => {
      const state = computeTemporalState(expires_at, created_at);
      if (state === "suppressed") {
        regenerate();
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [decision, regenerate]);

  const handleGo = useCallback(() => {
    const target = previousOverride ?? decision;
    if (!target) return;
    console.log("[HADE] Take me there →", target.title);

    if (visitRef.current?.timerId) {
      clearTimeout(visitRef.current.timerId);
    }

    const isUGC = target.is_ugc;
    visitRef.current = {
      venueId:   target.id,
      venueName: target.title,
      pressedAt: Date.now(),
      isUGC,
    };

    visitRef.current.timerId = setTimeout(() => {
      setShowVerificationSheet(true);
    }, 15 * 60 * 1000);
  }, [decision, previousOverride]);

  const handleRefineConfirm = useCallback(
    async ({ intent, urgency }: { intent: Intent | null; urgency: Urgency }) => {
      setRefineOpen(false);
      await refine({ intent, urgency });
    },
    [refine],
  );

  const handleNotThis = useCallback(() => {
    setShowPivotReasons(true);
  }, []);

  const handleMaybe = useCallback(() => {
    const target = previousOverride ?? decision;
    if (!target) return;
    console.log("[HADE] Maybe →", target.title);
  }, [decision, previousOverride]);

  const handleReject = useCallback(
    (reason: string) => {
      const venueId = decision?.id ?? "unknown";
      setRejectionHistory((prev) => [
        ...prev,
        { venueId, reason, timestamp: Date.now() },
      ]);
      setRejectionCount((count) => count + 1);

      if (!decision) {
        setShowPivotReasons(false);
        return;
      }

      const tags = toVibeTags(mapReasonToTags(reason));
      if (tags.length > 0) {
        emitVibeSignal(decision.id, tags, "negative");
      }

      console.log("[HADE] Reject triggered", { venueId: decision.id, reason });

      pivot(reason);
      setShowPivotReasons(false);
    },
    [decision, emitVibeSignal, pivot],
  );

  const handleDismiss = useCallback(() => {
    setShowVibeSheet(false);
  }, []);

  const handleSubmit = useCallback(
    (_tags: string[], _sentiment: "positive" | "negative" | "neutral") => {
      setShowVibeSheet(false);
    },
    [],
  );

  // UgcVerificationSheet handlers
  const handleVerificationClose = useCallback(() => {
    setShowVerificationSheet(false);
  }, []);

  const handleVerificationConfirmed = useCallback(() => {
    setShowVerificationSheet(false);
    setShowVibeSheet(true);
  }, []);

  // The card to display — previousOverride takes precedence while navigating back.
  // Once a new live decision arrives, the override is cleared automatically.
  const displayDecision = previousOverride ?? decision;

  // Derived pivot reasons list — UGC-specific when applicable
  const pivotReasons: string[] = displayDecision?.is_ugc && displayDecision.ugc_meta
    ? getUGCPivotReasons(displayDecision.ugc_meta.created_at)
    : PIVOT_REASONS;

  if (displayDecision) {
    console.log("[HADE UI DECISION]", displayDecision.id, displayDecision.title);
  }

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col bg-background px-5 pt-6 pb-safe-floor">
      {status === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-base text-ink/70">Something got in the way.</p>
          <p className="max-w-xs text-center text-sm text-ink/50">{error}</p>
          <button
            type="button"
            onClick={regenerate}
            className="mt-2 h-11 rounded-xl border border-line px-5 text-sm font-medium text-ink/70"
          >
            Try again
          </button>
        </div>
      )}

      {(status === "loading" || (status !== "error" && !displayDecision)) && <LoadingState />}

      {status === "ready" && displayDecision && (
        <>
          <AnimatePresence mode="wait">
            <motion.div
              key={displayDecision.id}
              initial={{ x: previousOverride ? -32 : 32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: previousOverride ? 32 : -32, opacity: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <ErrorBoundary name="HeroDecisionCard">
                <HeroDecisionCard
                  object={displayDecision.object}
                  onGoing={handleGo}
                  onMaybe={handleMaybe}
                  onNotThis={handleNotThis}
                />
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>

          {process.env.NODE_ENV !== "production" && (
            <DebugOverlay decision={displayDecision} />
          )}
        </>
      )}

      {/* Pinned Action Container — always rendered */}
      <div className="fixed bottom-0 left-0 right-0 z-10 mx-auto w-full max-w-[430px] border-t border-line/10 bg-background/80 px-5 pb-safe-floor pt-4 backdrop-blur-md">
        <div className="flex flex-col gap-4">
          {showPivotReasons && displayDecision && (
            <div className="grid grid-cols-2 gap-2">
              {pivotReasons.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => handleReject(reason)}
                  className="min-h-[42px] rounded-xl border border-line bg-white/60 px-3 text-xs font-medium text-ink/70 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
                >
                  {reason}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowCreationFlow(true)}
            className="min-h-[42px] rounded-xl bg-ink px-4 text-sm font-semibold text-white transition-colors active:bg-ink/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          >
            Add Spontaneous Note
          </button>

          {status === "ready" && displayDecision && (
            <SecondaryActions
              onPrevious={handlePrevious}
              hasPrevious={decisionHistory.length > 1}
              onRefine={() => setRefineOpen(true)}
              disabled={false}
            />
          )}
        </div>
      </div>

      <ErrorBoundary name="RefineSheet" onReset={() => setRefineOpen(false)}>
        <RefineSheet
          open={refineOpen}
          onClose={() => setRefineOpen(false)}
          onConfirm={handleRefineConfirm}
        />
      </ErrorBoundary>

      <AnimatePresence>
        {showCreationFlow && (
          <motion.div
            className="fixed inset-0 z-30 flex items-end bg-black/30 px-4 pb-safe-floor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="mb-4 w-full max-w-[430px] mx-auto"
              initial={{ y: 32 }}
              animate={{ y: 0 }}
              exit={{ y: 32 }}
            >
              <ErrorBoundary name="ActivityCreationView" onReset={() => setShowCreationFlow(false)}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCreationFlow(false)}
                    className="absolute right-4 top-4 z-10 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-ink/60"
                  >
                    Close
                  </button>
                  <ActivityCreationView onCreate={() => setShowCreationFlow(false)} />
                </div>
              </ErrorBoundary>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVibeSheet && visitRef.current && (
          <ErrorBoundary name="VibeSheet" onReset={() => setShowVibeSheet(false)}>
            <VibeSheet
              venueId={visitRef.current.venueId}
              venueName={visitRef.current.venueName}
              isUGC={visitRef.current.isUGC}
              onDismiss={handleDismiss}
              onSubmit={handleSubmit}
            />
          </ErrorBoundary>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVerificationSheet && visitRef.current && (
          <ErrorBoundary name="UgcVerificationSheet" onReset={() => setShowVerificationSheet(false)}>
            <UgcVerificationSheet
              open={showVerificationSheet}
              venueId={visitRef.current.venueId}
              venueName={visitRef.current.venueName}
              variant={visitRef.current.isUGC ? "ugc" : "standard"}
              onClose={handleVerificationClose}
              onConfirmed={handleVerificationConfirmed}
            />
          </ErrorBoundary>
        )}
      </AnimatePresence>
    </div>
  );
}
