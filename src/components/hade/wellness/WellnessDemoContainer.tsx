"use client";

/**
 * WellnessDemoContainer — intent-first demo wrapper.
 *
 * Owns the single piece of user-visible state: `selectedIntent`. Renders
 * the intent selector and the decision card. Ambient context is invisible:
 * it's derived inside the engine hook and shown only as a small passive
 * context line below the chips.
 */

import { useState } from "react";
import { DEFAULT_INTENT } from "@/lib/hade/wellness/intents";
import type { WellnessIntent } from "@/lib/hade/wellness/types";
import { useWellnessEngine } from "@/lib/hade/wellness/useWellnessEngine";
import { WellnessDecisionCard } from "./WellnessDecisionCard";
import { WellnessIntentSelector } from "./WellnessIntentSelector";

export function WellnessDemoContainer() {
  const [selectedIntent, setSelectedIntent] =
    useState<WellnessIntent>(DEFAULT_INTENT);
  const engine = useWellnessEngine({ selectedIntent });

  // Capitalize the day-of-week + time-of-day for the passive context line.
  const { dayOfWeek, timeOfDay } = engine.ambientSignals;
  const contextLine = `Reading the moment · ${dayOfWeek} · ${timeOfDay}`;

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/65">
          Wellness direction
        </span>
        <h1 className="text-[24px] font-semibold leading-tight text-ink">
          Wellness
        </h1>
        <p className="text-[13px] leading-snug text-ink/60">
          Choose the reset you would actually say yes to.
        </p>
      </header>

      <WellnessIntentSelector
        selected={selectedIntent}
        onSelect={setSelectedIntent}
      />

      <p
        className="text-[11px] uppercase tracking-[0.14em] text-ink/60"
        aria-label="Detected ambient context"
      >
        {contextLine}
      </p>

      <WellnessDecisionCard engineResult={engine} />
    </div>
  );
}
