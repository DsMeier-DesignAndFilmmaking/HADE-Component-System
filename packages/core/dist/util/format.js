// src/util/format.ts
function formatDistance(meters) {
  if (meters <= 50) return "Right here";
  if (meters < 1e3) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1e3).toFixed(1)}km`;
}
function formatEta(minutes) {
  if (minutes <= 0) return void 0;
  return `${minutes} min`;
}

export { formatDistance, formatEta };
//# sourceMappingURL=format.js.map
//# sourceMappingURL=format.js.map