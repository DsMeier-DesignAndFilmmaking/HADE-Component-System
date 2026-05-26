'use strict';

// src/config/defaults.ts
var DEFAULT_HADE_CONFIG = {
  scoring: {
    surfaced_once_penalty: -0.08,
    surfaced_twice_penalty: -0.14}};

// src/scoring/surfacedPenalty.ts
var SURFACED_ONCE_PENALTY = DEFAULT_HADE_CONFIG.scoring.surfaced_once_penalty;
var SURFACED_TWICE_PENALTY = DEFAULT_HADE_CONFIG.scoring.surfaced_twice_penalty;
function computeSurfacedPenalty(surfacedCount) {
  if (surfacedCount >= 2) return SURFACED_TWICE_PENALTY;
  if (surfacedCount === 1) return SURFACED_ONCE_PENALTY;
  return 0;
}

exports.SURFACED_ONCE_PENALTY = SURFACED_ONCE_PENALTY;
exports.SURFACED_TWICE_PENALTY = SURFACED_TWICE_PENALTY;
exports.computeSurfacedPenalty = computeSurfacedPenalty;
//# sourceMappingURL=surfacedPenalty.cjs.map
//# sourceMappingURL=surfacedPenalty.cjs.map