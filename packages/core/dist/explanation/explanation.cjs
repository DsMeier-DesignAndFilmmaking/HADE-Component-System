'use strict';

// src/explanation/explanation.ts
var TAG_LABELS = {
  good_energy: "\u{1F525} Good energy",
  chill: "\u{1F60C} Chill vibe",
  too_crowded: "\u26A0\uFE0F Crowded",
  overpriced: "\u{1F4B8} Overpriced",
  dead: "\u{1F610} Low energy"
};
function hoursAgo(dateString) {
  const dt = Date.parse(dateString);
  if (isNaN(dt)) return null;
  const msAgo = Date.now() - dt;
  return msAgo / (60 * 60 * 1e3);
}
function buildExplanation(node) {
  if (!node || typeof node.signal_count !== "number" || node.signal_count === 0) {
    return ["Based on general data"];
  }
  const weightEntries = Object.entries(node.weight_map ?? {});
  if (!weightEntries.length) {
    return ["Based on recent user activity"];
  }
  const sorted = weightEntries.slice().sort((a, b) => b[1] - a[1]);
  const positives = sorted.filter(([, v]) => v > 0).slice(0, 2);
  const negatives = sorted.filter(([, v]) => v < 0).slice(-1);
  const mapped = [...positives, ...negatives].map(([tag]) => TAG_LABELS[tag]).filter((v) => typeof v === "string");
  const output = [...mapped];
  if (typeof node.signal_count === "number" && node.signal_count > 5) {
    output.push("Based on recent user activity");
  }
  if (typeof node.last_updated === "string") {
    const hAgo = hoursAgo(node.last_updated);
    if (hAgo !== null && hAgo < 2) {
      output.push("Updated recently");
    }
  }
  return output.slice(0, 5);
}

exports.buildExplanation = buildExplanation;
//# sourceMappingURL=explanation.cjs.map
//# sourceMappingURL=explanation.cjs.map