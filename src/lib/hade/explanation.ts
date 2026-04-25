type LocationNode = {
  signal_count: number;
  weight_map: Record<string, number>;
  last_updated: string;
};

const TAG_LABELS: Record<string, string> = {
  good_energy: "🔥 Good energy",
  chill: "😌 Chill vibe",
  too_crowded: "⚠️ Crowded",
  overpriced: "💸 Overpriced",
  dead: "😐 Low energy"
};

function hoursAgo(dateString: string): number | null {
  const dt = Date.parse(dateString);
  if (isNaN(dt)) return null;
  const msAgo = Date.now() - dt;
  return msAgo / (60 * 60 * 1000);
}

export function buildExplanation(node?: LocationNode): string[] {
  if (!node || typeof node.signal_count !== "number" || node.signal_count === 0) {
    return ["Based on general data"];
  }

  const weightEntries = Object.entries(node.weight_map ?? {});
  if (!weightEntries.length) {
    // fallback in event of missing weight_map, but signal_count > 0
    return ["Based on recent user activity"];
  }

  // Sort by value descending
  const sorted = weightEntries.slice().sort((a, b) => b[1] - a[1]);

  // Top 2 positive tags (value > 0)
  const positives = sorted.filter(([k, v]) => v > 0).slice(0, 2);

  // Bottom 1 negative tag (value < 0, lowest value)
  const negatives = sorted.filter(([k, v]) => v < 0).slice(-1);

  // Map tag keys to labels
  const mapped = [...positives, ...negatives]
    .map(([tag]) => TAG_LABELS[tag])
    .filter((v): v is string => typeof v === "string");

  // Add context
  const output: string[] = [...mapped];

  if (typeof node.signal_count === "number" && node.signal_count > 5) {
    output.push("Based on recent user activity");
  }

  if (typeof node.last_updated === "string") {
    const hAgo = hoursAgo(node.last_updated);
    if (hAgo !== null && hAgo < 2) {
      output.push("Updated recently");
    }
  }

  // Limit output to 5 items max
  return output.slice(0, 5);
}