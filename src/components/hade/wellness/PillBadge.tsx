"use client";

import type { PillBadge as PillBadgeData } from "@/lib/hade/wellness/types";

interface PillBadgeProps {
  badge: PillBadgeData;
}

/**
 * Stateless contextual signal badge.
 *
 * Emoji is decorative (`aria-hidden`); the textual label remains the
 * accessible representation. Class string is owned by the badge mapper
 * so styling stays signal-aware.
 */
export function PillBadge({ badge }: PillBadgeProps) {
  return (
    <span className={badge.className}>
      <span aria-hidden="true">{badge.emoji}</span>
      <span>{badge.label}</span>
    </span>
  );
}
