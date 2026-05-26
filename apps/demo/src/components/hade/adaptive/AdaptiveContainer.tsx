"use client";

import type { HadeConfig } from "@/types/hade";
import { useAdaptive, HadeAdaptiveContext } from "@/lib/hade/hooks";

interface AdaptiveContainerProps {
  config?: HadeConfig;
  children: React.ReactNode;
}

/**
 * Provides adaptive HADE state to all descendant components.
 * Wrap any section that needs context-aware behavior in this container.
 *
 * @example
 * <AdaptiveContainer config={{ default_intent: "eat" }}>
 *   <SignalBadge type="PRESENCE" animated />
 *   <DecisionDiagram interactive />
 * </AdaptiveContainer>
 */
export function AdaptiveContainer({ config = {}, children }: AdaptiveContainerProps) {
  const state = useAdaptive(config);

  return (
    <HadeAdaptiveContext.Provider value={state}>
      {children}
    </HadeAdaptiveContext.Provider>
  );
}
