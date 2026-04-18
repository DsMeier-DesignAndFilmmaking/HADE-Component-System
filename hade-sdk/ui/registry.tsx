"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";

interface HadeUIRegistry {
  register: (slot: "decision-card" | "primary-cta" | "reasoning-list") => () => void;
}

const HadeUIRegistryContext = createContext<HadeUIRegistry | null>(null);

export function HadeUIRegistryProvider({ children }: { children: ReactNode }) {
  const counts = useRef<Record<string, number>>({});

  const value = useMemo<HadeUIRegistry>(
    () => ({
      register(slot) {
        counts.current[slot] = (counts.current[slot] ?? 0) + 1;
        if (counts.current[slot] > 1) {
          throw new Error(`HADE UI only allows one ${slot} per SingleScreenFrame.`);
        }

        return () => {
          counts.current[slot] = Math.max((counts.current[slot] ?? 1) - 1, 0);
        };
      },
    }),
    [],
  );

  return <HadeUIRegistryContext.Provider value={value}>{children}</HadeUIRegistryContext.Provider>;
}

export function useHadeUISlot(slot: "decision-card" | "primary-cta" | "reasoning-list") {
  const registry = useContext(HadeUIRegistryContext);

  useEffect(() => {
    if (!registry) {
      throw new Error("HADE UI components must be rendered inside <SingleScreenFrame>.");
    }

    return registry.register(slot);
  }, [registry, slot]);
}
