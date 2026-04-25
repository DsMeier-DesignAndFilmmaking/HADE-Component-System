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
  const weightValues = Object.values(node.weight_map ?? {});
  if (weightValues.length === 0) {
    return 0.5;
  }

  const max = Math.max(...weightValues);
  const min = Math.min(...weightValues);

  let agreementScore = max - min;
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