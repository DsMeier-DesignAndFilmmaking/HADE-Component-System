"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Intent, VibeTag } from "@/types/hade";
import { useHadeAdaptiveContext } from "@/lib/hade/hooks";
import { useHade } from "@/lib/hade/useHade";
import { HeroDecisionCard } from "./HeroDecisionCard";
import { PrimaryAction } from "./PrimaryAction";
import { SecondaryActions } from "./SecondaryActions";
import { RefineSheet } from "./RefineSheet";
import { VibeSheet } from "./VibeSheet";
import { LoadingState } from "./LoadingState";

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

interface DecisionScreenProps {
  scenarioId?: string | null;
}

export function DecisionScreen({ scenarioId }: DecisionScreenProps) {
  const { emitVibeSignal, pivot } = useHadeAdaptiveContext();
  const {
    decision,
    reasoning,
    status,
    error,
    regenerate,
    refine,
  } = useHade({ scenarioId });

  const [refineOpen, setRefineOpen] = useState(false);
  const [showPivotReasons, setShowPivotReasons] = useState(false);
  const [showVibeSheet, setShowVibeSheet] = useState(false);

  const visitRef = useRef<{
    venueId: string;
    venueName: string;
    pressedAt: number;
    timerId?: NodeJS.Timeout;
  } | null>(null);

  // Cancel any pending post-visit timer on unmount / navigation
  useEffect(() => {
    return () => {
      if (visitRef.current?.timerId) {
        clearTimeout(visitRef.current.timerId);
      }
    };
  }, []);

  const handleGo = useCallback(() => {
    if (!decision) return;
    console.log("[HADE] Take me there →", decision.title);

    // Cancel any prior timer so only one sheet can be scheduled per session
    if (visitRef.current?.timerId) {
      clearTimeout(visitRef.current.timerId);
    }

    visitRef.current = {
      venueId: decision.id,
      venueName: decision.title,
      pressedAt: Date.now(),
    };

    visitRef.current.timerId = setTimeout(() => {
      setShowVibeSheet(true);
    }, 15 * 60 * 1000);
  }, [decision]);

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

  const handleReject = useCallback(
    (reason: PivotReason) => {
      if (!decision) return;

      const tags = toVibeTags(mapReasonToTags(reason));
      if (tags.length > 0) {
        emitVibeSignal(decision.id, tags, "negative");
      }

      console.log("[HADE] Reject triggered", { venueId: decision.id, reason });

      // pivot() accumulates rejection history, flushes the signal queue,
      // and re-calls decide() — fixes cumulative history across multiple rejections.
      pivot(reason);
      setShowPivotReasons(false);
    },
    [decision, emitVibeSignal, pivot],
  );

  // Dismiss without emitting — spec: no signal, no API call
  const handleDismiss = useCallback(() => {
    setShowVibeSheet(false);
  }, []);

  // VibeSheet handles fetch + emitVibeSignal internally; parent just closes
  const handleSubmit = useCallback(
    (_tags: string[], _sentiment: "positive" | "negative" | "neutral") => {
      setShowVibeSheet(false);
    },
    [],
  );

  if (status === "error") {
    return (
      <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-4 bg-background px-5">
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
    );
  }

  if (status !== "ready" || !decision) {
    return <LoadingState />;
  }

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col bg-background px-5 pt-6 pb-safe-floor">
      <AnimatePresence mode="wait">
        <motion.div
          key={decision.id}
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -32, opacity: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <HeroDecisionCard
            title={decision.title}
            category={decision.category}
            neighborhood={decision.neighborhood}
            reasons={reasoning}
          />
        </motion.div>
      </AnimatePresence>

      {/* Pinned Action Container */}
<div className="fixed bottom-0 left-0 right-0 z-10 mx-auto w-full max-w-[430px] border-t border-line/10 bg-background/80 px-5 pb-safe-floor pt-4 backdrop-blur-md">
  <div className="flex flex-col gap-4">
    {showPivotReasons ? (
      <div className="grid grid-cols-2 gap-2">
        {PIVOT_REASONS.map((reason) => (
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
    ) : null}
    
    <PrimaryAction onPress={handleGo} disabled={status !== "ready"} />
    
    <SecondaryActions
      onAlternatives={handleNotThis}
      onRefine={() => setRefineOpen(true)}
      disabled={status !== "ready"}
    />
  </div>
</div>

      <RefineSheet
        open={refineOpen}
        onClose={() => setRefineOpen(false)}
        onConfirm={handleRefineConfirm}
      />

      <AnimatePresence>
        {showVibeSheet && visitRef.current && (
          <VibeSheet
            venueId={visitRef.current.venueId}
            venueName={visitRef.current.venueName}
            onDismiss={handleDismiss}
            onSubmit={handleSubmit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
