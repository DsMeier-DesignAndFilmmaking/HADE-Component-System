/** Soft score penalty applied when a candidate has already been shown this session. */
declare const SURFACED_ONCE_PENALTY: number;
/** Stronger penalty when a candidate has been shown twice or more this session. */
declare const SURFACED_TWICE_PENALTY: number;
/**
 * Returns the soft score penalty for a candidate based on how many times it
 * has already been surfaced in this session.  Always negative or zero —
 * never suppresses entirely (the caller clamps finalScore to [0, 1]).
 * Rejected candidates are hard-excluded before scoring and never reach this path.
 */
declare function computeSurfacedPenalty(surfacedCount: number): number;

export { SURFACED_ONCE_PENALTY, SURFACED_TWICE_PENALTY, computeSurfacedPenalty };
