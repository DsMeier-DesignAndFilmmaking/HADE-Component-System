"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DomainMode } from "@/lib/hade/useHade";
import { AnimatePresence, motion } from "framer-motion";
import type { Intent, VibeTag } from "@/types/hade";
import type { DecisionViewModel } from "@/lib/hade/viewModel";
import { useHadeAdaptiveContext } from "@/lib/hade/hooks";
import { useHade } from "@/lib/hade/useHade";
import { computeTemporalState, getUGCPivotReasons } from "@/lib/hade/ugcCopy";
import { HeroDecisionCard } from "./HeroDecisionCard";
import { ModeToggle } from "./ModeToggle";
import { OtherModesPanel } from "./OtherModesPanel";
import { RefineSheet } from "./RefineSheet";
import { VibeSheet } from "./VibeSheet";
import { UgcVerificationSheet } from "./UgcVerificationSheet";
import { LoadingState } from "./LoadingState";
import { ErrorBoundary } from "./ErrorBoundary";
import { ActivityCreationView } from "./ActivityCreationView";
import { CompareModesSheet } from "./CompareModesSheet";

const MODE_MESSAGES: Record<DomainMode, string> = {
  dining:  "Finding something good to eat...",
  social:  "Looking for something happening...",
  travel:  "Exploring what's nearby...",
};

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

function formatVibeLabel(tag: string): string {
  return tag.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function DebugOverlay({ decision }: { decision: DecisionViewModel }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(decision.confidence * 100);
  const pillClass = decision.is_ugc
    ? "bg-orange-500/90 text-white"
    : "bg-blue-500/90 text-white";

  const sourceShort = decision.engine_source
    ? decision.engine_source.replace("cold_start_", "cs/").replace("_fallback", "/fb")
    : "—";

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
            <span className="text-white/50">engine</span>
            <span className="text-emerald-400 text-right max-w-[100px] truncate">{sourceShort}</span>
          </div>

          <div className="mt-1 flex justify-between">
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
  initialMode?: DomainMode;
}

export function DecisionScreen({ scenarioId, initialMode }: DecisionScreenProps) {
  const { emitVibeSignal, pivot, context: adaptiveContext } = useHadeAdaptiveContext();
  const {
    decision,
    status,
    error,
    mode,
    setMode,
    regenerate,
    refine,
  } = useHade({ scenarioId, initialMode });

  const [refineOpen, setRefineOpen] = useState(false);
  const [showPivotReasons, setShowPivotReasons] = useState(false);
  const [showVibeSheet, setShowVibeSheet] = useState(false);
  const [toastTag, setToastTag] = useState<string | null>(null);
  const [showVerificationSheet, setShowVerificationSheet] = useState(false);
  const [showCreationFlow, setShowCreationFlow] = useState(false);
  const [liveToast, setLiveToast] = useState(false);
  const [showCompareModes, setShowCompareModes] = useState(false);
  const [pendingMode, setPendingMode] = useState<DomainMode | null>(null);
  const [modeMessage, setModeMessage] = useState<string | null>(null);
  const modeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [rejectionCount, setRejectionCount] = useState(0);
  const [rejectionHistory, setRejectionHistory] = useState<Array<{ venueId: string; reason: string; timestamp: number }>>([]);
  const [decisionHistory, setDecisionHistory] = useState<DecisionViewModel[]>([]);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [showOtherModes, setShowOtherModes] = useState(false);

  // ─── Reframing state ────────────────────────────────────────────────────────
  const [isReframing, setIsReframing] = useState(false);
  const [pivotLabel, setPivotLabel] = useState<string | undefined>(undefined);
  // When "Previous" is pressed we restore a past card without calling pivot().
  // This local override takes precedence over the live decision from useHade.
  const [previousOverride, setPreviousOverride] = useState<DecisionViewModel | null>(null);

  useEffect(() => {
    console.log("[HADE STATE]", {
      rejection_history_length: rejectionHistory.length,
      reasons: rejectionHistory.map((r) => r.reason),
    });
  }, [rejectionHistory]);

  // Clear mode transition state once the new decision lands.
  useEffect(() => {
    if (status === "ready") {
      setModeMessage(null);
      setPendingMode(null);
    }
  }, [status]);

  // Cancel pending mode timer on unmount.
  useEffect(() => {
    return () => {
      if (modeTimerRef.current) clearTimeout(modeTimerRef.current);
    };
  }, []);

  // Auto-dismiss the HADE Trace micro-toast after 2.5 s.
  useEffect(() => {
    if (!toastTag) return;
    const id = setTimeout(() => setToastTag(null), 2500);
    return () => clearTimeout(id);
  }, [toastTag]);

  // Auto-dismiss the "You're live" toast after 2.5 s.
  useEffect(() => {
    if (!liveToast) return;
    const id = setTimeout(() => setLiveToast(false), 2500);
    return () => clearTimeout(id);
  }, [liveToast]);

  const handleModeChange = useCallback(
    (newMode: DomainMode) => {
      if (modeTimerRef.current) clearTimeout(modeTimerRef.current);
      setPendingMode(newMode);
      setModeMessage("Reframing...");
      modeTimerRef.current = setTimeout(() => {
        setModeMessage(MODE_MESSAGES[newMode]);
        setMode(newMode);
        modeTimerRef.current = null;
      }, 400);
    },
    [setMode],
  );

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
    setShowPivotReasons((prev) => !prev);
  }, []);

  const handleSave = useCallback(() => {
    const target = previousOverride ?? decision;
    if (!target) return;
    console.log("[HADE] Save →", target.title);
  }, [decision, previousOverride]);

  const handleReject = useCallback(
    (reason: string) => {
      const venueId = decision?.id ?? "unknown";
      setRejectionHistory((prev) => [
        ...prev,
        { venueId, reason, timestamp: Date.now() },
      ]);
      setRejectionCount((count) => count + 1);
      setShowPivotReasons(false);

      if (!decision) return;

      const tags = toVibeTags(mapReasonToTags(reason));
      if (tags.length > 0) {
        emitVibeSignal(decision.id, tags, "negative");
      }

      console.log("[HADE] Reject triggered", { venueId: decision.id, reason });

      // Show reframing state for 300–600ms — feels deliberate, not instant.
      setIsReframing(true);
      setPivotLabel(`Adjusting for: ${reason}`);
      const delay = 300 + Math.random() * 300;
      setTimeout(() => {
        setIsReframing(false);
        setPivotLabel(undefined);
        pivot(reason);
      }, delay);
    },
    [decision, emitVibeSignal, pivot],
  );

  const handleDismiss = useCallback(() => {
    setShowVibeSheet(false);
  }, []);

  const handleSubmit = useCallback(
    (tags: string[], sentiment: "positive" | "negative" | "neutral") => {
      const venueId = visitRef.current?.venueId;
      if (venueId && tags.length > 0) {
        emitVibeSignal(venueId, tags as VibeTag[], sentiment, 0.9);
        setToastTag(tags[0] ?? null);
      }
      setShowVibeSheet(false);
    },
    [emitVibeSignal],
  );

  const handleJoin = useCallback(() => {
    const target = previousOverride ?? decision;
    if (!target) return;
    emitVibeSignal(target.id, ["worth_it"] as VibeTag[], "positive", 0.9);
    console.log("[HADE] Join →", target.title);
  }, [decision, previousOverride, emitVibeSignal]);

  const handleInterested = useCallback(() => {
    const target = previousOverride ?? decision;
    if (!target) return;
    emitVibeSignal(target.id, ["worth_it"] as VibeTag[], "positive", 0.5);
    console.log("[HADE] Interested →", target.title);
  }, [decision, previousOverride, emitVibeSignal]);

  const handleVibeText = useCallback((text: string) => {
    const target = previousOverride ?? decision;
    if (!target) return;
    const sentiment = /off|bad|wrong|miss|weird|slow|dead|empty/i.test(text) ? "negative" : "positive";
    const tag: VibeTag = sentiment === "negative" ? "skip_it" : "good_energy";
    emitVibeSignal(target.id, [tag], sentiment, 0.6);
    console.log("[HADE] Vibe →", { venueId: target.id, text, tag, sentiment });
  }, [decision, previousOverride, emitVibeSignal]);

  // "Add Vibe" — direct VibeSheet entry without the 15-min Go timer.
  // Populates visitRef from the currently displayed card so handleSubmit
  // always has a valid venueId even in zero-query / cold-start state.
  const handleRateSpot = useCallback(() => {
    const target = previousOverride ?? decision;
    if (!target) return;
    visitRef.current = {
      venueId:   target.id,
      venueName: target.title,
      pressedAt: Date.now(),
      isUGC:     target.is_ugc ?? false,
    };
    setShowVibeSheet(true);
  }, [decision, previousOverride]);

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
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col bg-background px-5 pt-6 pb-[260px]">
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

      {modeMessage && status === "loading" ? (
        <div className="flex flex-1 items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={modeMessage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="text-center text-base font-medium text-ink/50"
            >
              {modeMessage}
            </motion.p>
          </AnimatePresence>
        </div>
      ) : (
        (status === "loading" || (status !== "error" && !displayDecision)) && <LoadingState />
      )}

      {status === "ready" && displayDecision && (
        <>
          {/* ModeToggle lives above the card — domain navigation, not a CTA */}
          <ModeToggle
            mode={pendingMode ?? mode}
            onChange={handleModeChange}
            disabled={false}
          />

          <div className="mt-4">
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
                    mode={pendingMode ?? mode}
                    isReframing={isReframing}
                    pivotLabel={pivotLabel}
                    temporalState={displayDecision.temporal_state}
                    onJoin={handleJoin}
                    onInterested={handleInterested}
                    onAddVibe={handleVibeText}
                  />
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Start something ──────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setShowCreationFlow(true)}
            className="mt-4 w-full flex flex-col items-center gap-0.5 rounded-2xl bg-accent py-4 transition-opacity active:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="text-sm font-bold text-white">
              + Start something
            </span>
            <span className="text-[11px] text-white/60">Create a hangout nearby</span>
          </button>

          {/* "See other modes" — peek behind the system */}
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => setShowOtherModes((v) => !v)}
              className="flex items-center gap-1 rounded-full border border-line/50 bg-white/50 px-4 py-2 text-xs font-medium text-ink/45 transition-colors active:bg-white active:text-ink/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
            >
              {showOtherModes ? "Hide" : "See other modes"}
              <span aria-hidden="true" className="text-[10px]">
                {showOtherModes ? "↑" : "↓"}
              </span>
            </button>
          </div>

          <OtherModesPanel
            geo={adaptiveContext.geo}
            context={adaptiveContext}
            open={showOtherModes}
          />

          {process.env.NODE_ENV !== "production" && (
            <DebugOverlay decision={displayDecision} />
          )}
        </>
      )}

      {/* ── Pinned CTA bar — thumb-reach zone ──────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-10 mx-auto w-full max-w-[430px] border-t border-line/10 bg-background/90 px-5 pb-safe-floor pt-3 backdrop-blur-md">
        <div className="flex flex-col gap-2">

          {/* Utility row: Previous (contextual) + overflow */}
          <div className="flex items-center justify-between h-7">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={decisionHistory.length <= 1}
              className="flex items-center gap-1 text-xs text-ink/40 transition-colors active:text-ink/70 disabled:opacity-0 focus:outline-none focus-visible:text-ink/70"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => setOverflowOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm text-ink/35 transition-colors active:text-ink/60 focus:outline-none focus-visible:text-ink/60"
              aria-label="More options"
            >
              ···
            </button>
          </div>

          {/* Overflow panel — Compare Modes + Add Note */}
          {overflowOpen && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setShowCompareModes(true); setOverflowOpen(false); }}
                className="h-10 rounded-xl border border-line bg-white/60 px-3 text-xs font-medium text-ink/60 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                Compare Modes
              </button>
              <button
                type="button"
                onClick={() => { setShowCreationFlow(true); setOverflowOpen(false); }}
                className="h-10 rounded-xl border border-line bg-white/60 px-3 text-xs font-medium text-ink/60 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                Start Meetup
              </button>
            </div>
          )}

          {/* Pivot reasons — expands above primary on "Not this" tap */}
          {showPivotReasons && displayDecision && (
            <div className="grid grid-cols-2 gap-2">
              {pivotReasons.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => handleReject(reason)}
                  className="h-10 rounded-xl border border-line bg-white/60 px-3 text-xs font-medium text-ink/70 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
                >
                  {reason}
                </button>
              ))}
            </div>
          )}

          {/* PRIMARY — Go Now */}
          <button
            type="button"
            onClick={handleGo}
            disabled={!displayDecision}
            className="h-14 w-full rounded-2xl bg-blue-600 text-base font-bold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:opacity-40"
          >
            Go Now
          </button>

          {/* SECONDARY + TERTIARY */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRefineOpen(true)}
              disabled={!displayDecision}
              className="h-11 rounded-xl border border-line bg-white/60 text-sm font-semibold text-ink transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line disabled:opacity-40"
            >
              Refine
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!displayDecision}
              className="h-11 rounded-xl border border-line bg-white/60 text-sm font-medium text-ink/50 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line disabled:opacity-40"
            >
              Save
            </button>
          </div>

          {/* REJECTION — text-only, lowest visual weight */}
          <button
            type="button"
            onClick={handleNotThis}
            disabled={!displayDecision}
            className="w-full py-0.5 text-sm text-ink/35 transition-colors active:text-ink/60 focus:outline-none focus-visible:text-ink/60 disabled:opacity-0"
          >
            Not this
          </button>

        </div>
      </div>

      <ErrorBoundary name="CompareModesSheet" onReset={() => setShowCompareModes(false)}>
        <CompareModesSheet
          open={showCompareModes}
          geo={adaptiveContext.geo}
          context={adaptiveContext}
          onClose={() => setShowCompareModes(false)}
        />
      </ErrorBoundary>

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
                  <ActivityCreationView onCreate={() => {
                    setShowCreationFlow(false);
                    setLiveToast(true);
                    navigator.vibrate?.(50);
                  }} />
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

      {/* ── HADE Trace micro-toast ──────────────────────────────────────────── */}
      <AnimatePresence>
        {toastTag && (
          <motion.div
            key="vibe-toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] inset-x-0 mx-auto w-fit max-w-xs z-[60] rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink shadow-md pointer-events-none"
          >
            📡 Signal Enqueued: {formatVibeLabel(toastTag)} (+0.2 influence)
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── "You're live" confirmation toast ───────────────────────────────── */}
      <AnimatePresence>
        {liveToast && (
          <motion.div
            key="live-toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+200px)] inset-x-4 z-[60] mx-auto max-w-[390px] rounded-2xl bg-ink px-5 py-4 shadow-xl pointer-events-none"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8.5L6.5 12L13 5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">You&apos;re live</p>
                <p className="text-xs text-white/55">Others nearby can now join</p>
              </div>
            </div>
          </motion.div>
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
