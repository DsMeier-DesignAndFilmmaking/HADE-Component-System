/** Soft score penalty applied when a candidate has already been shown this session. */
export const SURFACED_ONCE_PENALTY = -0.08 as const;
/** Stronger penalty when a candidate has been shown twice or more this session. */
export const SURFACED_TWICE_PENALTY = -0.14 as const;

/**
 * Returns the soft score penalty for a candidate based on how many times it
 * has already been surfaced in this session.  Always negative or zero —
 * never suppresses entirely (the caller clamps finalScore to [0, 1]).
 * Rejected candidates are hard-excluded before scoring and never reach this path.
 */
export function computeSurfacedPenalty(surfacedCount: number): number {
  if (surfacedCount >= 2) return SURFACED_TWICE_PENALTY;
  if (surfacedCount === 1) return SURFACED_ONCE_PENALTY;
  return 0;
}
