"use client";

import { useState } from "react";
import type { HadeSDKConfig, HadeSDKDecision } from "../core";
import { useHade } from "./useHade";
import { DecisionCard } from "./DecisionCard";
import { PrimaryCTAButton } from "./PrimaryCTAButton";
import { ReasoningList } from "./ReasoningList";
import { RefineSheet } from "./RefineSheet";
import { SecondaryActions } from "./SecondaryActions";

interface DecisionViewProps {
  config?: HadeSDKConfig;
  onGo?: (decision: HadeSDKDecision | null) => void;
}

export function DecisionView({ config, onGo = () => undefined }: DecisionViewProps) {
  const hade = useHade(config);
  const { decision, reasoning, status, regenerate, refine } = hade;
  const [isRefineOpen, setIsRefineOpen] = useState(false);

  return (
    <main className="hade-web-root">
      <section className="hade-web-shell">
        <DecisionCard decision={decision} status={status} />
        <ReasoningList reasoning={reasoning} />
        <div className="hade-web-actions">
          <PrimaryCTAButton onGo={() => onGo(decision)} />
          <SecondaryActions
            onRegenerate={() => {
              void regenerate();
            }}
            onRefine={() => setIsRefineOpen(true)}
          />
        </div>
      </section>
      <RefineSheet
        open={isRefineOpen}
        onClose={() => setIsRefineOpen(false)}
        onSelect={(input) => {
          setIsRefineOpen(false);
          void refine(input);
        }}
      />
    </main>
  );
}
