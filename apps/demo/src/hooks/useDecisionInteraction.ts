"use client";

import { useState } from "react";
import type { DecideResponse } from "@/types/hade";

type ViewMode = "primary" | "grounded";

interface UseDecisionInteractionOptions {
  onRefresh: () => void;
}

interface UseDecisionInteractionResult {
  viewMode: ViewMode;
  isGrounded: boolean;
  recoveryLabel: string;
  handleNotThis: (data: DecideResponse) => void;
  handleRefine: (data: DecideResponse) => void;
}

export function useDecisionInteraction(
  opts: UseDecisionInteractionOptions,
): UseDecisionInteractionResult {
  const [viewMode, setViewMode] = useState<ViewMode>("primary");

  function handleNotThis(data: DecideResponse) {
    if (data.fallback_places && data.fallback_places.length > 0) {
      setViewMode("grounded");
    } else {
      opts.onRefresh();
    }
  }

  function handleRefine(data: DecideResponse) {
    opts.onRefresh();
    // category is available via data.decision.category for callers that need it
    void data.decision.category;
  }

  return {
    viewMode,
    isGrounded: viewMode === "grounded",
    recoveryLabel: "Try something else nearby",
    handleNotThis,
    handleRefine,
  };
}
