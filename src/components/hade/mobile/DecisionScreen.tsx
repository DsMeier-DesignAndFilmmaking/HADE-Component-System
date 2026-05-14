"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { DomainMode } from "@/lib/hade/useHade";
import { AnimatePresence, motion } from "framer-motion";
import type { Intent, SpontaneousObject, VibeTag } from "@/types/hade";
import { createDecisionViewModelFromUGC, type DecisionViewModel } from "@/lib/hade/viewModel";
import { useHadeAdaptiveContext } from "@/lib/hade/hooks";
import { useHade } from "@/lib/hade/useHade";
import { getNavigationUrl } from "@/lib/hade/navigation";
import { recordNavigationTelemetry } from "@/lib/hade/navigationTelemetry";
import { getLensCandidateCategories, getLensProfile } from "@/lib/hade/lensProfiles";
import { resetMobileViewportAfterInput } from "@/lib/hade/mobileViewport";
import { computeTemporalState, getUGCPivotReasons } from "@/lib/hade/ugcCopy";
import { HeroDecisionCard } from "./HeroDecisionCard";
import { RefineSheet } from "./RefineSheet";
import { VibeSheet } from "./VibeSheet";
import { UgcVerificationSheet } from "./UgcVerificationSheet";
import { LoadingState } from "./LoadingState";
import { ErrorBoundary } from "./ErrorBoundary";
import { ActivityCreationView } from "./ActivityCreationView";
import { CompareModesSheet } from "./CompareModesSheet";
import { VoiceSheet } from "./VoiceSheet";
import type { VoiceIntent } from "@/lib/hade/voiceIntentParser";

type Urgency = "low" | "medium" | "high";
type PivotReason = "Too crowded" | "Wrong vibe" | "Too far" | "Overpriced";

const PIVOT_REASONS: PivotReason[] = [
  "Too crowded",
  "Wrong vibe",
  "Too far",
  "Overpriced",
];

function getCoordinateBlockReason(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null) return "missing_coordinates";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "non_finite_coordinates";
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "coordinates_out_of_range";
  if (lat === 0 && lng === 0) return "zero_zero_coordinates";
  return null;
}

function getPlatformLabel(): string {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

type LensId = "food" | "retail" | "mobility" | "entertainment" | "social" | "wellness";

const LENS_OPTIONS: Array<{
  id: LensId;
  mode: DomainMode;
  icon: string;
  label: string;
  context: string;
  frame: string;
  transitionCopy: string;
}> = [
  {
    id: "food",
    mode: "dining",
    icon: "🍽",
    label: "Food & Dining",
    context: "Reduce decision fatigue nearby",
    frame: "Low-friction nearby food decision.",
    transitionCopy: "Optimizing for simplicity nearby",
  },
  {
    id: "retail",
    mode: "dining",
    icon: "🛍",
    label: "Retail & Shopping",
    context: "Inspiration over endless searching",
    frame: "A spontaneous browse worth stepping into.",
    transitionCopy: "Looking for something worth discovering",
  },
  {
    id: "mobility",
    mode: "travel",
    icon: "🚇",
    label: "Urban Mobility",
    context: "What makes sense right here, right now",
    frame: "The easiest useful move from where you are.",
    transitionCopy: "Reading movement and density nearby",
  },
  {
    id: "entertainment",
    mode: "social",
    icon: "🎭",
    label: "Entertainment",
    context: "Something worth doing tonight",
    frame: "Something nearby worth doing tonight.",
    transitionCopy: "Looking for something happening now",
  },
  {
    id: "social",
    mode: "social",
    icon: "👥",
    label: "Social Interaction",
    context: "Low-friction spontaneous connection",
    frame: "A low-pressure place where interaction is possible.",
    transitionCopy: "Finding socially compatible energy",
  },
  {
    id: "wellness",
    mode: "travel",
    icon: "🌿",
    label: "Wellness",
    context: "Context-aware nudges and resets",
    frame: "A reset that fits your current energy and location.",
    transitionCopy: "Optimizing for a healthier next move",
  },
];

const DEFAULT_LENS_BY_MODE: Record<DomainMode, LensId> = {
  dining: "food",
  social: "social",
  travel: "mobility",
};

type LensOption = (typeof LENS_OPTIONS)[number];

function IndustryLensSheet({
  open,
  activeLensId,
  onClose,
  onSelect,
}: {
  open: boolean;
  activeLensId: LensId;
  onClose: () => void;
  onSelect: (lens: LensOption) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/24 px-3 backdrop-blur-[1px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Choose industry direction"
            className="mb-[max(8px,env(safe-area-inset-bottom,8px))] w-full max-w-[430px] rounded-[22px] border border-line/70 bg-surface px-3 pb-3 pt-2.5 shadow-panel"
            initial={{ y: 36, opacity: 0.96 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 36, opacity: 0 }}
            transition={{ type: "spring", damping: 34, stiffness: 360 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-center pb-2">
              <span className="h-1 w-8 rounded-full bg-ink/14" aria-hidden="true" />
            </div>

            <div className="mb-2.5 flex items-center justify-between px-1">
              <div>
                <h2 className="text-[13px] font-semibold leading-tight text-ink">
                  Other directions
                </h2>
                <p className="mt-0.5 text-[10px] leading-tight text-ink/38">
                  Choose the lens HADE should read from.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-7 rounded-full px-2.5 text-[11px] font-medium text-ink/42 transition-colors active:text-ink/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                Close
              </button>
            </div>

            <div className="grid gap-1.5">
              {LENS_OPTIONS.map((lens) => {
                const isActive = activeLensId === lens.id;

                return (
                  <button
                    key={lens.id}
                    type="button"
                    onClick={() => onSelect(lens)}
                    aria-pressed={isActive}
                    className={`flex min-h-[54px] items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-line ${
                      isActive
                        ? "border-ink/15 bg-white text-ink shadow-soft"
                        : "border-line/50 bg-white/45 text-ink/64"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] transition-colors ${
                        isActive ? "bg-ink text-white" : "bg-ink/[0.045]"
                      }`}
                      aria-hidden="true"
                    >
                      {lens.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold leading-tight">
                        {lens.label}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-snug text-ink/42">
                        {lens.context}
                      </span>
                    </span>
                    {isActive && (
                     <span className="rounded-full bg-green-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-green-600">
                     Active
                   </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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

function buildVoiceCandidateCategories(lensId: LensId, exclude: string[]): string[] | undefined {
  const base = getLensCandidateCategories(lensId);
  const filtered = (base as readonly string[]).filter((cat) => !exclude.includes(cat));
  return filtered.length > 0 ? filtered : undefined;
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
  const defaultMode: DomainMode = initialMode ?? "travel";
  const defaultLensId = DEFAULT_LENS_BY_MODE[defaultMode];
  const defaultLensProfile = getLensProfile(defaultLensId);
  const { emitVibeSignal, pivot, context: adaptiveContext } = useHadeAdaptiveContext();
  const {
    decision,
    status,
    error,
    mode,
    setMode,
    regenerate,
    refine,
  } = useHade({
    scenarioId,
    initialMode: defaultMode,
    initialCandidateCategories: defaultLensProfile.candidateCategories,
  });

  const [refineOpen, setRefineOpen] = useState(false);
  const [showPivotReasons, setShowPivotReasons] = useState(false);
  const [showVibeSheet, setShowVibeSheet] = useState(false);
  const [showLensSheet, setShowLensSheet] = useState(false);
  const [toastTag, setToastTag] = useState<string | null>(null);
  const [showVerificationSheet, setShowVerificationSheet] = useState(false);
  const [showCreationFlow, setShowCreationFlow] = useState(false);
  const [liveToast, setLiveToast] = useState(false);
  const [showCompareModes, setShowCompareModes] = useState(false);
  const [activeLensId, setActiveLensId] = useState<LensId>(
    defaultLensId,
  );
  const [lensTransitioning, setLensTransitioning] = useState(false);
  const lensTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createdRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createdHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creationBackdropPointerRef = useRef<{ x: number; y: number } | null>(null);
  const decisionCardRef = useRef<HTMLDivElement | null>(null);

  const [rejectionCount, setRejectionCount] = useState(0);
  const [rejectionHistory, setRejectionHistory] = useState<Array<{ venueId: string; reason: string; timestamp: number }>>([]);
  const [decisionHistory, setDecisionHistory] = useState<DecisionViewModel[]>([]);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [createdCardHighlight, setCreatedCardHighlight] = useState(false);

  const closeCreationFlow = useCallback(() => {
    resetMobileViewportAfterInput();
    setShowCreationFlow(false);
  }, []);

  function handleCreationBackdropPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      creationBackdropPointerRef.current = null;
      return;
    }

    creationBackdropPointerRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handleCreationBackdropPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = creationBackdropPointerRef.current;
    creationBackdropPointerRef.current = null;
    if (!start || event.target !== event.currentTarget) return;

    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 10) return;

    closeCreationFlow();
  }

  function handleCreationOverlayKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    closeCreationFlow();
  }

  // ─── Reframing state ────────────────────────────────────────────────────────
  const [isReframing, setIsReframing] = useState(false);
  const [pivotLabel, setPivotLabel] = useState<string | undefined>(undefined);
  // When "Previous" is pressed we restore a past card without calling pivot().
  // This local override takes precedence over the live decision from useHade.
  const [previousOverride, setPreviousOverride] = useState<DecisionViewModel | null>(null);
  const [createdDecisionOverride, setCreatedDecisionOverride] = useState<DecisionViewModel | null>(null);

  const clearCreatedDecisionConfirmation = useCallback((reason: string) => {
    if (createdRevealTimerRef.current) {
      clearTimeout(createdRevealTimerRef.current);
      createdRevealTimerRef.current = null;
    }
    if (createdHighlightTimerRef.current) {
      clearTimeout(createdHighlightTimerRef.current);
      createdHighlightTimerRef.current = null;
    }
    setCreatedCardHighlight(false);
    setCreatedDecisionOverride((current) => {
      if (current && process.env.NODE_ENV !== "production") {
        console.log("[HADE UGC CONFIRMATION CLEARED]", { reason });
      }
      return null;
    });
  }, []);

  useEffect(() => {
    console.log("[HADE STATE]", {
      rejection_history_length: rejectionHistory.length,
      reasons: rejectionHistory.map((r) => r.reason),
    });
  }, [rejectionHistory]);

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

  useEffect(() => {
    if (status === "ready") setLensTransitioning(false);
  }, [status]);

  useEffect(() => {
    return () => {
      if (lensTransitionTimerRef.current) clearTimeout(lensTransitionTimerRef.current);
      if (createdRevealTimerRef.current) clearTimeout(createdRevealTimerRef.current);
      if (createdHighlightTimerRef.current) clearTimeout(createdHighlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!createdDecisionOverride) return;

    const scrollFrame = requestAnimationFrame(() => {
      decisionCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    });

    return () => cancelAnimationFrame(scrollFrame);
  }, [createdDecisionOverride]);

  // Push each new decision onto the history stack so "Previous" can navigate back.
  // We track by id so rapid re-renders don't push duplicates.
  // Also clear any previous-override whenever a genuinely new decision arrives.
  const lastPushedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!decision) return;
    if (decision.id === lastPushedIdRef.current) return;
    lastPushedIdRef.current = decision.id;
    setPreviousOverride(null); // new live decision — drop the override
    clearCreatedDecisionConfirmation("fresh_decision");
    setDecisionHistory((prev) => [...prev, decision]);
  }, [clearCreatedDecisionConfirmation, decision]);

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
      clearCreatedDecisionConfirmation("previous");
      setPreviousOverride(target);
      return next;
    });
  }, [clearCreatedDecisionConfirmation]);

  const handleLensSelect = useCallback(
    (lens: LensOption) => {
      setShowLensSheet(false);
      if (lens.id === activeLensId) return;
      if (lensTransitionTimerRef.current) clearTimeout(lensTransitionTimerRef.current);
      setActiveLensId(lens.id);
      setLensTransitioning(true);
      setPreviousOverride(null);
      clearCreatedDecisionConfirmation("lens_change");
      setShowPivotReasons(false);
      setOverflowOpen(false);
      const candidateCategories = getLensCandidateCategories(lens.id);
      if (process.env.NODE_ENV !== "production") {
        console.log("[HADE LENS PAYLOAD]", {
          activeLensId: lens.id,
          mode: lens.mode,
          candidate_categories: candidateCategories,
        });
      }
      setMode(lens.mode, { candidate_categories: candidateCategories });
      lensTransitionTimerRef.current = setTimeout(() => {
        setLensTransitioning(false);
        lensTransitionTimerRef.current = null;
      }, 1400);
    },
    [activeLensId, clearCreatedDecisionConfirmation, setMode],
  );

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
    const target = previousOverride ?? createdDecisionOverride ?? decision;
    if (!target?.ugc_meta) return;
    const { expires_at, created_at } = target.ugc_meta;

    const interval = setInterval(() => {
      const state = computeTemporalState(expires_at, created_at);
      if (state === "suppressed") {
        if (createdDecisionOverride?.id === target.id) {
          clearCreatedDecisionConfirmation("ugc_expired");
        } else {
          regenerate();
        }
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [clearCreatedDecisionConfirmation, createdDecisionOverride, decision, previousOverride, regenerate]);

  const handleGo = useCallback(() => {
    const target = previousOverride ?? createdDecisionOverride ?? decision;
    if (!target) return;
    console.log("[HADE] Take me there →", target.title);

    if (visitRef.current?.timerId) {
      clearTimeout(visitRef.current.timerId);
    }

    const lat = target.object.location?.lat;
    const lng = target.object.location?.lng;
    const blockReason = getCoordinateBlockReason(lat, lng);
    const platform = getPlatformLabel();

    if (blockReason) {
      console.warn("[HADE NAV HANDOFF]", {
        status: "blocked",
        reason: blockReason,
        platform,
        venueId: target.id,
        title: target.title,
        lat,
        lng,
      });
      return;
    }

    const navLat = lat as number;
    const navLng = lng as number;
    const url = getNavigationUrl(navLat, navLng, target.title);
    console.log("[HADE NAV URL]", {
      platform,
      venueId: target.id,
      title: target.title,
      lat: navLat,
      lng: navLng,
      url,
    });

    const isUGC = target.is_ugc;
    visitRef.current = {
      venueId:   target.id,
      venueName: target.title,
      pressedAt: Date.now(),
      isUGC,
    };

    recordNavigationTelemetry({
      objectId: target.id,
      title: target.title,
      lat: navLat,
      lng: navLng,
      url,
      platform,
      coordinatesValid: true,
    });

    console.log("[HADE NAV HANDOFF]", {
      status: "opening",
      method: "window.open(_self)",
      platform,
      venueId: target.id,
      url,
    });
    window.open(url, "_self");
  }, [createdDecisionOverride, decision, previousOverride]);

  const handleRefineConfirm = useCallback(
    async ({ intent, urgency }: { intent: Intent | null; urgency: Urgency }) => {
      setRefineOpen(false);
      clearCreatedDecisionConfirmation("refine");
      await refine({ intent, urgency });
    },
    [clearCreatedDecisionConfirmation, refine],
  );

  const handleVoiceApply = useCallback(
    async (parsed: VoiceIntent) => {
      setVoiceSheetOpen(false);
      clearCreatedDecisionConfirmation("voice_refine");
      await refine({
        intent: parsed.intent ?? null,
        urgency: parsed.urgency ?? "medium",
        state: parsed.state,
        constraints: parsed.constraints,
        candidate_categories: parsed.candidate_categories_exclude?.length
          ? buildVoiceCandidateCategories(activeLensId, parsed.candidate_categories_exclude)
          : undefined,
      });
    },
    [clearCreatedDecisionConfirmation, refine, activeLensId],
  );

  const handleNotThis = useCallback(() => {
    setShowPivotReasons((prev) => !prev);
  }, []);

  const handleSave = useCallback(() => {
    const target = previousOverride ?? createdDecisionOverride ?? decision;
    if (!target) return;
    console.log("[HADE] Save →", target.title);
  }, [createdDecisionOverride, decision, previousOverride]);

  const handleReject = useCallback(
    (reason: string) => {
      const target = previousOverride ?? createdDecisionOverride ?? decision;
      const venueId = target?.id ?? "unknown";
      setRejectionHistory((prev) => [
        ...prev,
        { venueId, reason, timestamp: Date.now() },
      ]);
      setRejectionCount((count) => count + 1);
      setShowPivotReasons(false);

      if (!target) return;

      const tags = toVibeTags(mapReasonToTags(reason));
      if (tags.length > 0) {
        emitVibeSignal(target.id, tags, "negative");
      }

      console.log("[HADE] Reject triggered", { venueId: target.id, reason });
      const pivotTarget = {
        id: target.id,
        venue_name: target.title,
        is_fallback: target.is_fallback,
      };
      setPreviousOverride(null);
      clearCreatedDecisionConfirmation("not_this");

      // Show reframing state for 300–600ms — feels deliberate, not instant.
      setIsReframing(true);
      setPivotLabel(`Adjusting for: ${reason}`);
      const delay = 300 + Math.random() * 300;
      setTimeout(() => {
        setIsReframing(false);
        setPivotLabel(undefined);
        pivot(reason, pivotTarget);
      }, delay);
    },
    [clearCreatedDecisionConfirmation, createdDecisionOverride, decision, emitVibeSignal, pivot, previousOverride],
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
    const target = previousOverride ?? createdDecisionOverride ?? decision;
    if (!target) return;
    emitVibeSignal(target.id, ["worth_it"] as VibeTag[], "positive", 0.9);
    console.log("[HADE] Join →", target.title);
  }, [createdDecisionOverride, decision, previousOverride, emitVibeSignal]);

  const handleInterested = useCallback(() => {
    const target = previousOverride ?? createdDecisionOverride ?? decision;
    if (!target) return;
    emitVibeSignal(target.id, ["worth_it"] as VibeTag[], "positive", 0.5);
    console.log("[HADE] Interested →", target.title);
  }, [createdDecisionOverride, decision, previousOverride, emitVibeSignal]);

  const handleVibeText = useCallback((text: string) => {
    const target = previousOverride ?? createdDecisionOverride ?? decision;
    if (!target) return;
    const sentiment = /off|bad|wrong|miss|weird|slow|dead|empty/i.test(text) ? "negative" : "positive";
    const tag: VibeTag = sentiment === "negative" ? "skip_it" : "good_energy";
    emitVibeSignal(target.id, [tag], sentiment, 0.6);
    console.log("[HADE] Vibe →", { venueId: target.id, text, tag, sentiment });
  }, [createdDecisionOverride, decision, previousOverride, emitVibeSignal]);

  // "Add Vibe" — direct VibeSheet entry without the 15-min Go timer.
  // Populates visitRef from the currently displayed card so handleSubmit
  // always has a valid venueId even in zero-query / cold-start state.
  const handleRateSpot = useCallback(() => {
    const target = previousOverride ?? createdDecisionOverride ?? decision;
    if (!target) return;
    visitRef.current = {
      venueId:   target.id,
      venueName: target.title,
      pressedAt: Date.now(),
      isUGC:     target.is_ugc ?? false,
    };
    setShowVibeSheet(true);
  }, [createdDecisionOverride, decision, previousOverride]);

  const handleCreatedActivitySaved = useCallback(
    (createdActivity: SpontaneousObject) => {
      const nextDecision = createDecisionViewModelFromUGC(createdActivity);
      if (!nextDecision) return;

      if (createdRevealTimerRef.current) {
        clearTimeout(createdRevealTimerRef.current);
        createdRevealTimerRef.current = null;
      }
      if (createdHighlightTimerRef.current) {
        clearTimeout(createdHighlightTimerRef.current);
        createdHighlightTimerRef.current = null;
      }

      closeCreationFlow();
      setPreviousOverride(null);
      setShowPivotReasons(false);
      setOverflowOpen(false);
      lastPushedIdRef.current = nextDecision.id;
      setDecisionHistory((prev) =>
        prev.some((item) => item.id === nextDecision.id) ? prev : [...prev, nextDecision],
      );
      setLiveToast(true);
      navigator.vibrate?.(50);

      createdRevealTimerRef.current = setTimeout(() => {
        createdRevealTimerRef.current = null;
        requestAnimationFrame(() => {
          setCreatedDecisionOverride(nextDecision);
          setCreatedCardHighlight(true);
          createdHighlightTimerRef.current = setTimeout(() => {
            createdHighlightTimerRef.current = null;
            setCreatedCardHighlight(false);
          }, 1200);
        });
      }, 240);

      if (process.env.NODE_ENV !== "production") {
        console.log("[HADE UGC CREATED DISPLAYED]", {
          title: nextDecision.title,
          source: nextDecision.object.source ?? "user",
          lens: activeLensId,
          mode,
        });
      }
    },
    [activeLensId, closeCreationFlow, mode],
  );

  // UgcVerificationSheet handlers
  const handleVerificationClose = useCallback(() => {
    setShowVerificationSheet(false);
  }, []);

  const handleVerificationConfirmed = useCallback(() => {
    setShowVerificationSheet(false);
    setShowVibeSheet(true);
  }, []);

  // The card to display — temporary local overrides sit above the live engine result.
  // Once a new live decision arrives, those overrides are cleared automatically.
  const displayDecision = previousOverride ?? createdDecisionOverride ?? decision;
  const activeLens = LENS_OPTIONS.find((lens) => lens.id === activeLensId) ?? LENS_OPTIONS[0];

  // Derived pivot reasons list — UGC-specific when applicable
  const pivotReasons: string[] = displayDecision?.is_ugc && displayDecision.ugc_meta
    ? getUGCPivotReasons(displayDecision.ugc_meta.created_at)
    : PIVOT_REASONS;

  if (displayDecision) {
    console.log("[HADE UI DECISION]", displayDecision.id, displayDecision.title);
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col bg-background px-4 pb-[168px] pt-4 min-[390px]:px-5 min-[390px]:pt-5">
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

      {!displayDecision && status !== "error" && <LoadingState />}

      {status !== "error" && displayDecision && (
        <>
          <div>
            <AnimatePresence mode="wait">
              <motion.div
                ref={decisionCardRef}
                key={displayDecision.id}
                initial={{ x: previousOverride ? -32 : 32, opacity: 0 }}
                animate={{
                  x: 0,
                  opacity: 1,
                  boxShadow:
                    createdCardHighlight && createdDecisionOverride?.id === displayDecision.id
                      ? "0 0 0 2px rgba(16, 185, 129, 0.18), 0 12px 32px rgba(16, 185, 129, 0.10)"
                      : "0 0 0 0 rgba(16, 185, 129, 0)",
                }}
                exit={{ x: previousOverride ? 32 : -32, opacity: 0 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className="scroll-mt-3 rounded-[22px]"
              >
                <ErrorBoundary name="HeroDecisionCard">
                  <HeroDecisionCard
                    object={displayDecision.object}
                    mode={mode}
                    contextLabel={activeLens.context}
                    lensIcon={activeLens.icon}
                    lensLabel={activeLens.label}
                    lensFrame={activeLens.frame}
                    isFallback={displayDecision.is_fallback}
                    isReframing={isReframing || lensTransitioning}
                    pivotLabel={lensTransitioning ? activeLens.transitionCopy : pivotLabel}
                    temporalState={displayDecision.temporal_state}
                    confirmationState={
                      createdDecisionOverride?.id === displayDecision.id ? "created" : undefined
                    }
                    onAddVibe={handleVibeText}
                  />
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-line/45 bg-white/38 px-3 py-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold leading-tight text-ink/68">
                <span aria-hidden="true">{activeLens.icon}</span>
                <span className="truncate">{activeLens.label}</span>
              </p>
              <p className="mt-0.5 truncate text-[10px] leading-tight text-ink/38">
                {activeLens.context}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowLensSheet(true)}
              className="shrink-0 rounded-full border border-line/55 bg-surface/70 px-3 py-1.5 text-[11px] font-semibold text-ink/52 transition-all active:scale-[0.97] active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
            >
              View Other directions
            </button>
          </div>

          {/* ── Start something ──────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setShowCreationFlow(true)}
            className="mt-3 flex w-full flex-col items-center gap-0.5 rounded-xl bg-white py-2.5 transition-opacity active:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="text-[13px] font-bold text-blue">
              + Add something
            </span>
            <span className="text-[10px] text-black/55">Create a hangout nearby</span>
          </button>

          {process.env.NODE_ENV !== "production" && (
            <DebugOverlay decision={displayDecision} />
          )}
        </>
      )}

      {/* ── Pinned CTA bar — thumb-reach zone ──────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-10 mx-auto w-full max-w-[430px] border-t border-line/10 bg-background/78 px-4 pb-[max(12px,env(safe-area-inset-bottom,12px))] pt-2.5 backdrop-blur-sm min-[390px]:px-5">
        <div className="flex flex-col gap-1.5">

          {/* Utility row: Previous (contextual) + overflow */}
          <div className="flex h-6 items-center justify-between">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={decisionHistory.length <= 1}
              className="flex items-center gap-1 text-[11px] text-ink/40 transition-colors active:text-ink/70 disabled:opacity-0 focus:outline-none focus-visible:text-ink/70"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => setOverflowOpen((v) => !v)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-ink/35 transition-colors active:text-ink/60 focus:outline-none focus-visible:text-ink/60"
              aria-label="More options"
            >
              ···
            </button>
          </div>

          {/* Overflow panel — Refine + Compare Modes + Start Meetup */}
          {overflowOpen && (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => { setRefineOpen(true); setOverflowOpen(false); }}
                disabled={!displayDecision}
                className="h-9 rounded-xl border border-line bg-white/60 px-3 text-[11px] font-medium text-ink/60 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line disabled:opacity-40"
              >
                Refine
              </button>
              <button
                type="button"
                onClick={() => { setShowCompareModes(true); setOverflowOpen(false); }}
                className="h-9 rounded-xl border border-line bg-white/60 px-3 text-[11px] font-medium text-ink/60 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                Compare Modes
              </button>
              <button
                type="button"
                onClick={() => { setShowCreationFlow(true); setOverflowOpen(false); }}
                className="h-9 rounded-xl border border-line bg-white/60 px-3 text-[11px] font-medium text-ink/60 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                Start Meetup
              </button>
              <button
                type="button"
                onClick={() => { setVoiceSheetOpen(true); setOverflowOpen(false); }}
                disabled={!displayDecision}
                className="h-9 rounded-xl border border-line bg-white/60 px-3 text-[11px] font-medium text-ink/60 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line disabled:opacity-40"
                aria-label="Voice input"
              >
                Voice Input
              </button>
            </div>
          )}

          {/* Pivot reasons — expands above primary on "Not this" tap */}
          {showPivotReasons && displayDecision && (
            <div className="grid grid-cols-2 gap-1.5">
              {pivotReasons.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => handleReject(reason)}
                  className="h-9 rounded-xl border border-line bg-white/60 px-3 text-[11px] font-medium text-ink/70 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
                >
                  {reason}
                </button>
              ))}
            </div>
          )}

          {/* PRIMARY — navigation handoff */}
          <button
            type="button"
            onClick={handleGo}
            disabled={!displayDecision}
            className="h-12 w-full rounded-2xl bg-blue-600 text-[15px] font-bold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:opacity-40"
          >
            Navigate
          </button>

          {/* REJECTION — text-only, lowest visual weight */}
          <button
            type="button"
            onClick={handleNotThis}
            disabled={!displayDecision}
            className="w-full py-0 text-[13px] text-ink/35 transition-colors active:text-ink/60 focus:outline-none focus-visible:text-ink/60 disabled:opacity-0"
          >
            Not this
          </button>

        </div>
      </div>

      <IndustryLensSheet
        open={showLensSheet}
        activeLensId={activeLensId}
        onClose={() => setShowLensSheet(false)}
        onSelect={handleLensSelect}
      />

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

      <ErrorBoundary name="VoiceSheet" onReset={() => setVoiceSheetOpen(false)}>
        <VoiceSheet
          open={voiceSheetOpen}
          onClose={() => setVoiceSheetOpen(false)}
          onApply={handleVoiceApply}
        />
      </ErrorBoundary>

      <AnimatePresence>
        {showCreationFlow && (
          <motion.div
            className="fixed inset-0 z-30 flex h-[100dvh] w-full max-w-[100vw] items-end overflow-x-hidden bg-black/25 px-3 pb-[max(10px,env(safe-area-inset-bottom,10px))]"
            onPointerDown={handleCreationBackdropPointerDown}
            onPointerUp={handleCreationBackdropPointerUp}
            onKeyDown={handleCreationOverlayKeyDown}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="mx-auto mb-2 flex max-h-[90dvh] w-full max-w-[min(430px,100vw)] flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ErrorBoundary name="ActivityCreationView" onReset={closeCreationFlow}>
                <div className="relative w-full max-w-full">
                  <button
                    type="button"
                    onClick={closeCreationFlow}
                    className="absolute right-3 top-3 z-10 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-ink/60"
                  >
                    Close
                  </button>
                  <ActivityCreationView onCreate={handleCreatedActivitySaved} />
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
            className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,0px)+152px)] inset-x-0 z-[60] mx-auto w-fit max-w-xs rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-ink shadow-md"
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
            className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,0px)+152px)] inset-x-4 z-[60] mx-auto max-w-[390px] rounded-2xl bg-ink px-4 py-3 shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
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
