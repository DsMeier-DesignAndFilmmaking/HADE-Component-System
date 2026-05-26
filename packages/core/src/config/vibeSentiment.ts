/**
 * Vibe tag sentiment map for confidence scoring (subset of full Hade VibeTag union).
 * Kept in core so scoring stays framework-free.
 */
export const VIBE_TAG_SENTIMENT: Record<string, "positive" | "negative"> = {
  too_crowded: "negative",
  perfect_vibe: "positive",
  overpriced: "negative",
  hidden_gem: "positive",
  loud: "negative",
  quiet: "positive",
  good_energy: "positive",
  dead: "negative",
  worth_it: "positive",
  skip_it: "negative",
  too_far: "negative",
};
