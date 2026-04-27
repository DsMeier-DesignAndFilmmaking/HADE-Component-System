"use client";

import { useMemo } from "react";
import { computeTemporalState, TEMPORAL_COPY } from "@/lib/hade/ugcCopy";

interface UGCCardMeta {
  expires_at?:   string;
  created_at:    string;
  distance_copy: string;
  vibe_chips:    string[];
}

interface HeroDecisionCardProps {
  title:        string;
  category:     string;
  neighborhood?: string;
  reasons:      string[];
  isFallback?:  boolean;
  ugcMeta?:     UGCCardMeta;
}

const CATEGORY_EMOJI: Record<string, string> = {
  restaurant:   "🍽️",
  bar:          "🍸",
  bar_and_grill:"🍸",
  cocktail_bar: "🍸",
  wine_bar:     "🍷",
  cafe:         "☕",
  coffee:       "☕",
  coffee_shop:  "☕",
  gastropub:    "🍺",
  brewery:      "🍺",
  pub:          "🍺",
  deli:         "🥪",
  bakery:       "🥐",
  pizza:        "🍕",
  club:         "🎵",
  night_club:   "🎵",
  lounge:       "🛋️",
  food_truck:   "🚚",
  ice_cream:    "🍦",
};

function formatCategory(raw: string): string {
  return raw.replace(/_/g, " ");
}

export function HeroDecisionCard({
  title,
  category,
  neighborhood,
  reasons,
  isFallback = false,
  ugcMeta,
}: HeroDecisionCardProps) {
  const temporal = useMemo(
    () => ugcMeta ? computeTemporalState(ugcMeta.expires_at, ugcMeta.created_at) : null,
    [ugcMeta],
  );

  if (ugcMeta && temporal) {
    const temporalCopy = temporal !== "suppressed" ? TEMPORAL_COPY[temporal] : null;
    const chips = ugcMeta.vibe_chips.length > 0
      ? ugcMeta.vibe_chips
      : ["community"];

    return (
      <section className="relative flex flex-col rounded-3xl bg-surface p-6 shadow-soft">
        {isFallback && (
          <span className="absolute top-3 right-4 rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-ink/40">
            Limited Mode
          </span>
        )}

        {/* Title row with ◎ glyph */}
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold leading-tight text-ink flex-1">
            {title}
          </h1>
          <span className="mt-1 shrink-0 text-base text-ink/40" aria-hidden="true">◎</span>
        </div>

        {/* Distance · temporal line */}
        <p className="mt-1.5 text-sm text-ink/60">
          {[ugcMeta.distance_copy, temporalCopy].filter(Boolean).join(" · ")}
        </p>

        {/* Vibe chips — community locked first */}
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip, i) => {
            const isLocked = i === 0 && chip === "community";
            return (
              <span
                key={chip}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
                  isLocked
                    ? "border-accent/30 bg-accentSoft/60 text-accent/60"
                    : "border-line bg-surface text-ink/60"
                }`}
              >
                {chip.replace(/_/g, " ")}
              </span>
            );
          })}
        </div>
      </section>
    );
  }

  // ── Standard Google Place card ─────────────────────────────────────────────
  const key = category.toLowerCase();
  const emoji = CATEGORY_EMOJI[key] ?? "📍";
  const label = formatCategory(category);
  const contextParts = [`${emoji} ${label}`];
  if (neighborhood && !/[\d,]/.test(neighborhood)) contextParts.push(neighborhood);

  return (
    <section className="relative flex flex-col rounded-3xl bg-surface p-6 shadow-soft">
      {isFallback && (
        <span className="absolute top-3 right-4 rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-ink/40">
          Limited Mode
        </span>
      )}
      <h1 className="text-2xl font-semibold leading-tight text-ink">
        {title}
      </h1>

      <p className="mt-1.5 text-sm text-ink/60">
        {contextParts.join(" · ")}
      </p>

      <ul className="mt-5 space-y-1.5">
        {reasons.map((reason) => (
          <li key={reason} className="flex gap-2 text-base leading-snug text-ink">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
