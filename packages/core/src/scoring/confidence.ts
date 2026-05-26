import { VIBE_TAG_SENTIMENT } from "../config/vibeSentiment.js";
import { DEFAULT_HADE_CONFIG } from "../config/defaults.js";
import type { ResolvedHadeConfig } from "../config/schema.js";

type LocationNode = {
  signal_count: number;
  weight_map: Record<string, number>;
  last_updated: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function computeConfidence(
  node?: LocationNode,
  config: Pick<ResolvedHadeConfig, "confidence" | "weights"> = DEFAULT_HADE_CONFIG,
): number {
  const confidenceConfig = config.confidence.node;
  const weights = config.weights.confidence;

  if (!node || typeof node.signal_count !== "number" || node.signal_count === 0) {
    return confidenceConfig.default_score;
  }

  const signalStrength = clamp(
    node.signal_count / confidenceConfig.signal_count_full_strength,
    confidenceConfig.signal_strength_min,
    confidenceConfig.signal_strength_max,
  );

  const weightEntries = Object.entries(node.weight_map ?? {});
  const weightValues = weightEntries.map(([tag, value]) => {
    const boundedValue = clamp(value, 0, 1);
    const sentiment = VIBE_TAG_SENTIMENT[tag];
    return sentiment === "negative" ? 1 - boundedValue : boundedValue;
  });
  if (weightValues.length === 0) {
    return confidenceConfig.default_score;
  }

  const max = Math.max(...weightValues);
  const min = Math.min(...weightValues);

  const spread = max - min;
  let agreementScore = 1 - spread;
  agreementScore = clamp(
    agreementScore,
    confidenceConfig.agreement_min,
    confidenceConfig.agreement_max,
  );

  const trustScore = confidenceConfig.trust_score;

  let recencyScore = confidenceConfig.recency_default_score;
  if (typeof node.last_updated === "string") {
    const lastTime = Date.parse(node.last_updated);
    if (!isNaN(lastTime)) {
      const ageMs = Date.now() - lastTime;
      if (ageMs < confidenceConfig.recency_fresh_ms) {
        recencyScore = confidenceConfig.recency_fresh_score;
      } else if (ageMs < confidenceConfig.recency_recent_ms) {
        recencyScore = confidenceConfig.recency_recent_score;
      } else if (ageMs < confidenceConfig.recency_day_ms) {
        recencyScore = confidenceConfig.recency_day_score;
      } else {
        recencyScore = confidenceConfig.recency_stale_score;
      }
    }
  }

  const confidence =
    signalStrength ** weights.signal_strength *
    agreementScore ** weights.agreement *
    trustScore ** weights.trust *
    recencyScore ** weights.recency;
  return clamp(confidence, confidenceConfig.min_score, confidenceConfig.max_score);
}

/**
 * Maps a synthetic ranking score (0–1) to a confidence value (0.30–0.95).
 */
export function syntheticConfidence(
  finalScore: number,
  config: ResolvedHadeConfig["confidence"]["synthetic"] = DEFAULT_HADE_CONFIG.confidence.synthetic,
): number {
  if (!Number.isFinite(finalScore)) return config.default_score;
  return clamp(
    config.base_score + finalScore * config.score_weight,
    config.min_score,
    config.max_score,
  );
}
