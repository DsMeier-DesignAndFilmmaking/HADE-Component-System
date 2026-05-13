import { VIBE_TAG_SENTIMENT } from "@/types/hade";

type LocationNode = {
  signal_count: number;
  weight_map: Record<string, number>;
  last_updated: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function computeConfidence(node?: LocationNode): number {
  if (!node || typeof node.signal_count !== 'number' || node.signal_count === 0) {
    return 0.5;
  }

  // Signal strength
  const signalStrength = clamp(node.signal_count / 10, 0.3, 1.0);

  // Agreement score
  const weightEntries = Object.entries(node.weight_map ?? {});
  const weightValues = weightEntries.map(([tag, value]) => {
    const boundedValue = clamp(value, 0, 1);
    const sentiment = VIBE_TAG_SENTIMENT[tag];
    return sentiment === "negative" ? 1 - boundedValue : boundedValue;
  });
  if (weightValues.length === 0) {
    return 0.5;
  }

  const max = Math.max(...weightValues);
  const min = Math.min(...weightValues);

  const spread = max - min;
  let agreementScore = 1 - spread;
  agreementScore = clamp(agreementScore, 0.4, 1.0);

  // Trust score (constant)
  const trustScore = 1.0;

  // Recency score
  let recencyScore = 0.5;
  if (typeof node.last_updated === 'string') {
    const lastTime = Date.parse(node.last_updated);
    if (!isNaN(lastTime)) {
      const ageMs = Date.now() - lastTime;
      if (ageMs < 2 * 60 * 60 * 1000) {
        recencyScore = 1.0;
      } else if (ageMs < 6 * 60 * 60 * 1000) {
        recencyScore = 0.85;
      } else if (ageMs < 24 * 60 * 60 * 1000) {
        recencyScore = 0.7;
      } else {
        recencyScore = 0.5;
      }
    }
  }

  let confidence = signalStrength * agreementScore * trustScore * recencyScore;
  return clamp(confidence, 0.3, 0.95);
}

/**
 * Maps a synthetic ranking score (0–1) to a confidence value (0.30–0.95).
 * Used when no LocationNode is available — derives confidence from the
 * composite finalScore produced by the ranking engine rather than UGC signals.
 * A finalScore of ~0.54 is equivalent to the prior hardcoded constant (0.65).
 */
export function syntheticConfidence(finalScore: number): number {
  if (!Number.isFinite(finalScore)) return 0.5;
  return clamp(0.3 + finalScore * 0.65, 0.3, 0.95);
}
