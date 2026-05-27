"use client";

/**
 * WellnessIntentSelector — the primary (and only) user input.
 *
 * Renders the 6 wellness intents as a wrapped chip group. Single-select.
 * Uses `aria-pressed` rather than `role="tablist"` because these are not
 * tabs — they're a filter that swaps the recommendation, not the panel.
 */

import {
  DEFAULT_INTENT,
  WELLNESS_INTENTS,
} from "@/lib/hade/wellness/intents";
import type { WellnessIntent } from "@/lib/hade/wellness/types";

interface Props {
  selected?: WellnessIntent;
  onSelect: (intent: WellnessIntent) => void;
  /**
   * When true, hides the outer heading + subtitle and the active-intent
   * description line. Used when embedded inside DecisionScreen where the
   * surrounding chrome already names the section. The standalone
   * /demo/wellness page uses the default (heading visible).
   */
  compact?: boolean;
}

export function WellnessIntentSelector({
  selected = DEFAULT_INTENT,
  onSelect,
  compact = false,
}: Props) {
  const activeMeta = WELLNESS_INTENTS.find((m) => m.id === selected);
  return (
    <section
      aria-label="What do you need right now?"
      className="flex flex-col gap-3"
    >
      {!compact ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-[14px] font-semibold text-ink">
            What do you need right now?
          </h2>
          <p className="text-[12px] text-ink/60">
            Pick the kind of reset you would actually take.
          </p>
        </div>
      ) : null}

      <div
        role="group"
        aria-label="Wellness intent options"
        className="flex flex-wrap gap-2"
      >
        {WELLNESS_INTENTS.map((meta) => {
          const isActive = meta.id === selected;
          return (
            <button
              key={meta.id}
              type="button"
              aria-pressed={isActive}
              title={meta.description}
              onClick={() => onSelect(meta.id)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                isActive
                  ? "bg-accent text-white shadow-soft"
                  : "border border-line bg-surface text-ink/80 hover:bg-accent/10 hover:text-ink",
              ].join(" ")}
            >
              <span aria-hidden="true">{meta.emoji}</span>
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>

      {!compact && activeMeta ? (
        <p
          className="text-[11px] italic leading-snug text-ink/55"
          aria-live="polite"
        >
          {activeMeta.description}
        </p>
      ) : null}
    </section>
  );
}
