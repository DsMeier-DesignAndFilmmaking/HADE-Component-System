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
  dead: "😐 Low energy",
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
    return ["Based on recent user activity"];
  }

  const sorted = weightEntries.slice().sort((a, b) => b[1] - a[1]);
  const positives = sorted.filter(([, v]) => v > 0).slice(0, 2);
  const negatives = sorted.filter(([, v]) => v < 0).slice(-1);

  const mapped = [...positives, ...negatives]
    .map(([tag]) => TAG_LABELS[tag])
    .filter((v): v is string => typeof v === "string");

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

  return output.slice(0, 5);
}
