"use client";

/**
 * WellnessLensView — embedded wellness experience inside the main HADE demo.
 *
 * Mounted by DecisionScreen when the user selects the Wellness lens. Replaces
 * the regular HeroDecisionCard block (the backend `/api/hade/decide` result)
 * with the local wellness engine output: a compact intent row above the
 * existing WellnessDecisionCard.
 *
 * Why this lives in `mobile/` not `wellness/`:
 *   This component is specifically the mobile DecisionScreen's wellness slot.
 *   The reusable wellness primitives (selector, card, engine) remain in
 *   `src/components/hade/wellness/` and `src/lib/hade/wellness/`. This file
 *   is the integration seam — knowing about both worlds is intentional.
 */

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { WellnessDecisionCard } from "@/components/hade/wellness/WellnessDecisionCard";
import { WellnessIntentSelector } from "@/components/hade/wellness/WellnessIntentSelector";
import { adaptWellnessDecisionToCardModel } from "@/lib/hade/wellness/adaptWellnessDecision";
import { useWellnessEngine } from "@/lib/hade/wellness/useWellnessEngine";
import { getNavigationUrl } from "@/lib/hade/navigation";
import type { WellnessIntent } from "@/lib/hade/wellness/types";

interface WellnessLensViewProps {
  selectedIntent: WellnessIntent;
  onIntentChange: (intent: WellnessIntent) => void;
  /** Used for the small "Wellness Lens" header above the intent row. */
  lensIcon: string;
  lensLabel: string;
}

export function WellnessLensView({
  selectedIntent,
  onIntentChange,
  lensIcon,
  lensLabel,
}: WellnessLensViewProps) {
  const engine = useWellnessEngine({ selectedIntent });

  // Tracks which place in engine.places[] is the primary pick for the CTA.
  // Resets to 0 whenever the intent changes so "Not this" cycles within the
  // new pillar's results, not the previous one's.
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => { setActiveIndex(0); }, [selectedIntent, engine.activePillar]);

  // Adapter is invoked here purely to derive a short pillar-level subtitle
  // that matches the main demo's voice ("Mindfulness Reset · 0.3 mi").
  // Surfaced in the small header strip above the chips so the wellness slot
  // feels visually integrated with the rest of the main demo chrome.
  const cardModel = useMemo(
    () => adaptWellnessDecisionToCardModel(engine),
    [engine],
  );

  // Derived active place — safe even when the list hasn't loaded yet.
  const activePlace =
    engine.places.length > 0
      ? engine.places[activeIndex % engine.places.length]
      : null;

  const handleNotThis = () => {
    if (engine.places.length < 2) return;
    setActiveIndex((i) => (i + 1) % engine.places.length);
  };

  const handleOpenInMaps = () => {
    if (!activePlace) return;
    const url = getNavigationUrl(
      activePlace.coordinates.lat,
      activePlace.coordinates.lng,
      activePlace.name,
    );
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const showCTA = !engine.loading && activePlace !== null;

  return (
    <>
      <motion.div
        key="wellness-lens-view"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        // Extra bottom padding prevents the last card from hiding behind the fixed CTA bar.
        className={["flex flex-col gap-3", showCTA ? "pb-[88px]" : ""].join(" ")}
      >
        {/* Slim lens header — matches HADE chrome convention */}
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-line/45 bg-surface/55 px-3 py-2 shadow-soft">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold leading-tight text-ink/70">
              <span aria-hidden="true">{lensIcon}</span>
              <span className="truncate">{lensLabel} Lens</span>
            </p>
            <p className="mt-0.5 truncate text-[10px] leading-tight text-ink/65">
              What kind of reset do you need?
            </p>
          </div>
          <p className="shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-ink/65">
            {cardModel.subtitle}
          </p>
        </div>

        {/* Compact intent row — secondary contextual control, not a settings panel */}
        <WellnessIntentSelector
          compact
          selected={selectedIntent}
          onSelect={onIntentChange}
        />

        {/* Primary recommendation — wellness card with active place highlighted */}
        <WellnessDecisionCard engineResult={engine} activeIndex={activeIndex} />
      </motion.div>

      {/* ── Wellness CTA bar — pinned to thumb-reach zone ─────────────────── */}
      {/* Mirrors the structure of DecisionScreen's CTA bar so the two feel
          visually identical to the user. Mounted only when the wellness lens
          is active (this component is only rendered in that condition). */}
      {showCTA && (
        <div className="fixed bottom-0 left-0 right-0 z-10 mx-auto w-full max-w-[430px] border-t border-line/20 bg-background/88 px-4 pb-[max(12px,env(safe-area-inset-bottom,12px))] pt-2.5 shadow-[0_-12px_30px_rgba(11,13,18,0.05)] backdrop-blur-sm min-[390px]:px-5">
          <div className="flex flex-col gap-1.5">

            {/* PRIMARY — open active place in Maps */}
            <button
              type="button"
              onClick={handleOpenInMaps}
              className="flex min-h-[54px] w-full flex-col items-center justify-center rounded-2xl bg-accent px-4 text-white shadow-glowBlue transition-colors hover:bg-accent/90 active:bg-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <span className="text-[15px] font-bold leading-tight">
                {activePlace.name}
              </span>
              <span className="mt-0.5 text-[10px] font-medium leading-tight text-white">
                Opens Maps · {activePlace.distance}
              </span>
            </button>

            {/* SECONDARY — cycle to next place without a backend call */}
            <button
              type="button"
              onClick={handleNotThis}
              disabled={engine.places.length < 2}
              className="w-full py-0 text-[13px] text-ink/65 transition-colors active:text-ink/80 focus:outline-none focus-visible:text-ink/80 disabled:opacity-0"
            >
              Not this
            </button>

          </div>
        </div>
      )}
    </>
  );
}
