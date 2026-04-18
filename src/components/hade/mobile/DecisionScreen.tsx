"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Intent } from "@/types/hade";
import { useHade } from "@/lib/hade/useHade";
import { HeroDecisionCard } from "./HeroDecisionCard";
import { PrimaryAction } from "./PrimaryAction";
import { SecondaryActions } from "./SecondaryActions";
import { RefineSheet } from "./RefineSheet";
import { LoadingState } from "./LoadingState";

type Urgency = "low" | "medium" | "high";

interface DecisionScreenProps {
  scenarioId?: string | null;
}

export function DecisionScreen({ scenarioId }: DecisionScreenProps) {
  const {
    decision,
    reasoning,
    status,
    error,
    regenerate,
    refine,
  } = useHade({ scenarioId });

  const [refineOpen, setRefineOpen] = useState(false);

  const handleGo = useCallback(() => {
    if (!decision) return;
    console.log("[HADE] Take me there →", decision.title);
  }, [decision]);

  const handleRefineConfirm = useCallback(
    async ({ intent, urgency }: { intent: Intent | null; urgency: Urgency }) => {
      setRefineOpen(false);
      await refine({ intent, urgency });
    },
    [refine],
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
    <div className="flex h-[100dvh] w-full flex-col bg-background px-5 pt-6 pb-safe-floor">
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

      <div className="mt-auto flex flex-col gap-4 pt-4">
        <PrimaryAction onPress={handleGo} disabled={status !== "ready"} />
        <SecondaryActions
          onAlternatives={regenerate}
          onRefine={() => setRefineOpen(true)}
          disabled={status !== "ready"}
        />
      </div>

      <RefineSheet
        open={refineOpen}
        onClose={() => setRefineOpen(false)}
        onConfirm={handleRefineConfirm}
      />
    </div>
  );
}
