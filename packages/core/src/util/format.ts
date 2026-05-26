export function formatDistance(meters: number): string {
  if (meters <= 50) return "Right here";
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatEta(minutes: number): string | undefined {
  if (minutes <= 0) return undefined;
  return `${minutes} min`;
}
