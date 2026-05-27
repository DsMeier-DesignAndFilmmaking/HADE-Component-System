"use client";

import { PILLARS, PILLAR_CONFIG } from "@/lib/hade/wellness/pillars";
import type { WellnessPillar } from "@/lib/hade/wellness/types";

interface PillarFilterStripProps {
  active: WellnessPillar;
  resolved: WellnessPillar;
  onSelect: (pillar: WellnessPillar) => void;
}

/**
 * 4-pillar chip toggle strip.
 *
 * - Active chip uses bg-accent / text-white.
 * - Resolver-suggested chip (when different from active) shows a subtle dot.
 * - `role="tablist"` + `aria-pressed` on each chip for assistive tech.
 */
export function PillarFilterStrip({
  active,
  resolved,
  onSelect,
}: PillarFilterStripProps) {
  return (
    <div
      role="tablist"
      aria-label="Wellness pillar filter"
      className="-mx-1 flex w-full snap-x snap-mandatory items-center gap-2 overflow-x-auto px-1 pb-1"
    >
      {PILLARS.map((pillar) => {
        const isActive = pillar === active;
        const isSuggested = !isActive && pillar === resolved;
        const cfg = PILLAR_CONFIG[pillar];
        return (
          <button
            key={pillar}
            type="button"
            role="tab"
            aria-pressed={isActive}
            aria-label={`Filter by ${pillar}`}
            onClick={() => onSelect(pillar)}
            className={[
              "relative inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full px-3 py-1.5",
              "text-[12px] font-semibold transition-colors",
              isActive
                ? "bg-accent text-white shadow-soft"
                : "border border-line bg-surface text-ink/70 hover:bg-accent/5 hover:text-ink",
            ].join(" ")}
          >
            <span aria-hidden="true">{cfg.chipEmoji}</span>
            <span>{pillar}</span>
            {isSuggested ? (
              <span
                aria-label="Suggested by current signals"
                className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-accent"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
