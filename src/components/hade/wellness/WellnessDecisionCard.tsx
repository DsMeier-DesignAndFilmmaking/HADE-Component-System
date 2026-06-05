"use client";

/**
 * <WellnessDecisionCard engineResult={...} />
 *
 * Intent-first decision surface for the Wellness direction mode.
 *
 * The card no longer renders any ambient controls or a manual pillar
 * override. It receives a fully-resolved engine result and renders:
 *   1. Header — pillar emoji + label + rule provenance (intent or ambient)
 *   2. "Matched to your X intent" rationale subtext
 *   3. Contextual signal badges (intent-derived first, then ambient)
 *   4. Optional 1-line "Context suggests …" hint when ambient resolver
 *      disagrees with the intent-driven pillar (passive — never authoritative)
 *   5. Filtered place list (with framer-motion AnimatePresence)
 *   6. Negative-filter footer surfacing the rejected generic place names
 */

import { AnimatePresence, motion } from "framer-motion";
import { getIntentMeta } from "@/lib/hade/wellness/intents";
import type { UseWellnessEngineResult } from "@/lib/hade/wellness/useWellnessEngine";
import type { WellnessPlace } from "@/lib/hade/wellness/types";
import { PillBadge } from "./PillBadge";

interface WellnessDecisionCardProps {
  engineResult: UseWellnessEngineResult;
  /** Index of the place that should be highlighted as the primary pick. */
  activeIndex?: number;
}

const PILL_BASE =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase";

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-ink/70">
      <span aria-hidden="true">★</span>
      <span>{rating.toFixed(1)}</span>
    </span>
  );
}

function PlaceRow({
  place,
  isActive = false,
}: {
  place: WellnessPlace;
  isActive?: boolean;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={[
        "rounded-2xl border p-3 shadow-soft",
        isActive
          ? "border-accent/40 bg-accent/5 ring-1 ring-accent/25"
          : "border-line bg-surface",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-ink">
              {place.name}
            </h3>
            <span className={`${PILL_BASE} bg-accent/10 text-accentReadable`}>
              {place.validationTag}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-ink/70">
            {place.contextualWhy} ({place.distance})
          </p>
        </div>
        <div className="flex shrink-0 items-center text-right">
          {/* Distance already appears inline in the rationale; keep only the rating here. */}
          <StarRating rating={place.rating} />
        </div>
      </div>
    </motion.li>
  );
}

function LoadingSkeleton() {
  return (
    <ul
      className="flex flex-col gap-2"
      aria-label="Loading wellness results"
    >
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-[68px] animate-pulse rounded-2xl border border-line bg-accent/5"
        />
      ))}
    </ul>
  );
}

export function WellnessDecisionCard({
  engineResult,
  activeIndex = 0,
}: WellnessDecisionCardProps) {
  const {
    selectedIntent,
    resolved,
    contextHint,
    activePillar,
    places,
    rejectedCount,
    loading,
    badges,
  } = engineResult;

  const intentMeta = selectedIntent ? getIntentMeta(selectedIntent) : undefined;
  const visiblePlace = places.length > 0 ? places[activeIndex % places.length] : null;
  const contextDiffers = contextHint.pillar !== resolved.pillar;

  return (
    <article
      aria-label="Wellness recommendation"
      className="relative flex flex-col gap-4 rounded-[24px] border border-line/45 bg-surface p-4 shadow-soft min-[390px]:p-5"
    >
      {/* Header */}
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`${PILL_BASE} bg-accent/10 text-accentReadable`}
            aria-label="Direction mode"
          >
            Wellness
          </span>
          <span
            className="text-[11px] font-medium text-ink/65"
          >
            {resolved.source === "intent" ? "You asked for" : "Why now"} ·{" "}
            {resolved.matchedRuleLabel}
          </span>
        </div>
        {intentMeta ? (
          <p className="text-[13px] leading-snug text-ink/70">
            Picked for your{" "}
            <span className="font-semibold text-ink">{intentMeta.label}</span>{" "}
            mood: {intentMeta.rationale}
          </p>
        ) : (
          <p className="text-[13px] leading-snug text-ink/70">
            {resolved.matchedRuleLabel}.
          </p>
        )}
      </header>

      {/* Contextual signal badges */}
      {badges.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Why this feels relevant"
        >
          {badges.map((b) => (
            <PillBadge key={b.label} badge={b} />
          ))}
        </div>
      ) : null}

      {/* Passive context-suggestion line (only if ambient resolver disagrees) */}
      {contextDiffers && intentMeta ? (
        <p
          className="text-[11px] italic leading-snug text-ink/65"
          aria-label="Other useful context"
        >
          The moment also points toward {contextHint.pillar.toLowerCase()}, but your choice leads.
        </p>
      ) : null}

      {/* Place list */}
      <section
        aria-label={`${activePillar} venues nearby`}
        className="flex flex-col gap-2"
      >
        {loading ? (
          <LoadingSkeleton />
        ) : !visiblePlace ? (
          <p className="rounded-2xl border border-dashed border-line bg-accent/5 p-4 text-center text-[13px] text-ink/60">
            I could not find a nearby {activePillar.toLowerCase()} option that felt specific enough.
          </p>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={visiblePlace.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <ul>
                <PlaceRow place={visiblePlace} isActive />
              </ul>
            </motion.div>
          </AnimatePresence>
        )}
      </section>

      {/* Negative-filter visibility footer */}
      {!loading && rejectedCount > 0 ? (
        <footer
          className="rounded-xl border border-line bg-accent/5 px-3 py-2 text-[11px] leading-snug text-ink/60"
          aria-label="Why some results were left out"
        >
          <span className="font-semibold text-ink/80">
            Left out {rejectedCount} vague{" "}
            {rejectedCount === 1 ? "result" : "results"}
          </span>{" "}
          so this stays focused on real {activePillar.toLowerCase()} options.
        </footer>
      ) : null}
    </article>
  );
}
