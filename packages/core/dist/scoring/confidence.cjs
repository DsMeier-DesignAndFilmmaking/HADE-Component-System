'use strict';

// src/config/vibeSentiment.ts
var VIBE_TAG_SENTIMENT = {
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
  too_far: "negative"
};

// src/config/defaults.ts
var DEFAULT_CONFIG_HASH = "sha256:unconfigured";
var BUILT_IN_SCORING_PROFILES = {
  balanced: { proximity: 0.4, signal: 0.35, intent: 0.25 },
  intent_heavy: { proximity: 0.25, signal: 0.25, intent: 0.5 },
  signal_heavy: { proximity: 0.25, signal: 0.5, intent: 0.25 },
  rating_heavy: { proximity: 0.1, signal: 0.45, intent: 0.45 },
  proximity_heavy: { proximity: 0.6, signal: 0.25, intent: 0.15 }
};
var BUILT_IN_DOMAINS = {
  dining: {
    id: "dining",
    display_name: "Dining",
    default_intents: ["eat", "drink"],
    primary_signals: ["UGC", "PRESENCE"],
    default_radius_meters: 2500,
    category_buckets: [["restaurant"], ["cafe"], ["bar"], ["meal_takeaway"]],
    scoring_profile: "balanced",
    copy_overrides: {}
  },
  social: {
    id: "social",
    display_name: "Social",
    default_intents: ["scene", "chill"],
    primary_signals: ["SOCIAL_RELAY", "EVENT"],
    default_radius_meters: 3500,
    category_buckets: [["bar"], ["night_club"], ["park"], ["event_venue"]],
    scoring_profile: "signal_heavy",
    copy_overrides: {}
  },
  travel: {
    id: "travel",
    display_name: "Travel",
    default_intents: ["explore", "anything"],
    primary_signals: ["AMBIENT", "ENVIRONMENTAL"],
    default_radius_meters: 4e3,
    category_buckets: [["tourist_attraction"], ["museum"], ["art_gallery"], ["landmark"]],
    scoring_profile: "intent_heavy",
    copy_overrides: {}
  },
  ecommerce: {
    id: "ecommerce",
    display_name: "Shopping",
    default_intents: ["browse", "buy", "compare"],
    primary_signals: ["BEHAVIORAL", "INTENT"],
    default_radius_meters: 0,
    category_buckets: [["electronics"], ["clothing"], ["home"], ["sale"]],
    scoring_profile: "rating_heavy",
    copy_overrides: {
      "action.take_me_there": "Add to cart",
      "action.refine": "Filter",
      "label.strong_pick": "Top match"
    }
  }
};
var DEFAULT_HADE_CONFIG = {
  defaults: {
    radius_meters: 800,
    locale: "en-US",
    config_hash: DEFAULT_CONFIG_HASH
  },
  confidence: {
    bands: {
      high: 0.7,
      medium: 0.4,
      threshold_high_multiplier: 0.5,
      threshold_medium_multiplier: 0.3
    },
    labels: {
      strong_pick: 0.65,
      good_fit: 0.4
    },
    node: {
      default_score: 0.5,
      min_score: 0.3,
      max_score: 0.95,
      signal_count_full_strength: 10,
      signal_strength_min: 0.3,
      signal_strength_max: 1,
      agreement_min: 0.4,
      agreement_max: 1,
      trust_score: 1,
      recency_default_score: 0.5,
      recency_fresh_ms: 2 * 60 * 60 * 1e3,
      recency_recent_ms: 6 * 60 * 60 * 1e3,
      recency_day_ms: 24 * 60 * 60 * 1e3,
      recency_fresh_score: 1,
      recency_recent_score: 0.85,
      recency_day_score: 0.7,
      recency_stale_score: 0.5
    },
    synthetic: {
      default_score: 0.5,
      min_score: 0.3,
      max_score: 0.95,
      base_score: 0.3,
      score_weight: 0.65
    }
  },
  timeouts: {
    adapter_ms: 8e3,
    geo_ms: 3e3
  },
  weights: {
    opportunity: {
      proximity: 0.4,
      signal: 0.35,
      intent: 0.25
    },
    confidence: {
      signal_strength: 1,
      agreement: 1,
      trust: 1,
      recency: 1
    }
  },
  scoring: {
    surfaced_once_penalty: -0.08,
    surfaced_twice_penalty: -0.14,
    profiles: BUILT_IN_SCORING_PROFILES,
    offline_overlay: { proximity: 0.6, signal: 0.4, intent: 0 }
  },
  domains: BUILT_IN_DOMAINS,
  active_domain: "dining",
  copy: {
    locale: "en-US",
    tone: "casual",
    char_caps: {
      rationale: 280,
      // route.ts:904
      why_now: 120,
      // route.ts:905
      why_this: 60,
      // route.ts:906
      decision_frame: 180
      // route.ts:907
    },
    fallback_titles: [
      // route.ts:129-133
      "Take a walk nearby",
      "Grab coffee nearby",
      "Explore this area"
    ],
    overrides: {}
  },
  mobility: {
    walking_meters_per_minute: 80,
    // route.ts:294, 1137
    driving_meters_per_minute: 500
  },
  runtime: {
    offline: {
      policy: "cache",
      default_intent: "chill",
      copy_id: "offline.cache_hit"
    },
    total_budget_ms: 12e3
  },
  adapters: {},
  metadata: {},
  $schema_version: "1.0",
  clientId: "hade-client",
  config_hash: DEFAULT_CONFIG_HASH
};

// src/scoring/confidence.ts
function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}
function computeConfidence(node, config = DEFAULT_HADE_CONFIG) {
  const confidenceConfig = config.confidence.node;
  const weights = config.weights.confidence;
  if (!node || typeof node.signal_count !== "number" || node.signal_count === 0) {
    return confidenceConfig.default_score;
  }
  const signalStrength = clamp(
    node.signal_count / confidenceConfig.signal_count_full_strength,
    confidenceConfig.signal_strength_min,
    confidenceConfig.signal_strength_max
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
    confidenceConfig.agreement_max
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
  const confidence = signalStrength ** weights.signal_strength * agreementScore ** weights.agreement * trustScore ** weights.trust * recencyScore ** weights.recency;
  return clamp(confidence, confidenceConfig.min_score, confidenceConfig.max_score);
}
function syntheticConfidence(finalScore, config = DEFAULT_HADE_CONFIG.confidence.synthetic) {
  if (!Number.isFinite(finalScore)) return config.default_score;
  return clamp(
    config.base_score + finalScore * config.score_weight,
    config.min_score,
    config.max_score
  );
}

exports.computeConfidence = computeConfidence;
exports.syntheticConfidence = syntheticConfidence;
//# sourceMappingURL=confidence.cjs.map
//# sourceMappingURL=confidence.cjs.map