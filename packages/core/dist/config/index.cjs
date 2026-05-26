'use strict';

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
  clientId: "hade-client",
  config_hash: DEFAULT_CONFIG_HASH
};

// src/config/validateConfig.ts
var HadeConfigValidationError = class _HadeConfigValidationError extends Error {
  issues;
  constructor(issues) {
    super(`Invalid HadeConfig: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
    this.name = "HadeConfigValidationError";
    this.issues = issues;
    Object.setPrototypeOf(this, _HadeConfigValidationError.prototype);
  }
};
function validateConfig(config = {}) {
  const issues = [];
  const rawConfig = config;
  if (!isPlainObject(rawConfig)) {
    return [{ path: "config", message: "must be an object", value: config }];
  }
  const input = config;
  if (input.defaults !== void 0) {
    validatePlainObject(input.defaults, "defaults", issues);
    validatePositiveNumber(input.defaults.radius_meters, "defaults.radius_meters", issues);
    validateOptionalNonEmptyString(input.defaults.locale, "defaults.locale", issues);
    validateOptionalNonEmptyString(input.defaults.config_hash, "defaults.config_hash", issues);
  }
  if (input.metadata !== void 0) {
    validatePlainObject(input.metadata, "metadata", issues);
  }
  const bands = input.confidence?.bands;
  if (bands !== void 0) {
    validatePlainObject(bands, "confidence.bands", issues);
    validateUnitNumber(bands.high, "confidence.bands.high", issues);
    validateUnitNumber(bands.medium, "confidence.bands.medium", issues);
    validateNonNegativeNumber(
      bands.threshold_high_multiplier,
      "confidence.bands.threshold_high_multiplier",
      issues
    );
    validateNonNegativeNumber(
      bands.threshold_medium_multiplier,
      "confidence.bands.threshold_medium_multiplier",
      issues
    );
    validateOrderedOptional(
      bands.medium,
      bands.high,
      "confidence.bands.medium",
      "confidence.bands.high",
      issues
    );
  }
  const labels = input.confidence?.labels;
  if (labels !== void 0) {
    validatePlainObject(labels, "confidence.labels", issues);
    validateUnitNumber(labels.strong_pick, "confidence.labels.strong_pick", issues);
    validateUnitNumber(labels.good_fit, "confidence.labels.good_fit", issues);
    validateOrderedOptional(
      labels.good_fit,
      labels.strong_pick,
      "confidence.labels.good_fit",
      "confidence.labels.strong_pick",
      issues
    );
  }
  const node = input.confidence?.node;
  if (node !== void 0) {
    validatePlainObject(node, "confidence.node", issues);
    validateUnitNumber(node.default_score, "confidence.node.default_score", issues);
    validateUnitNumber(node.min_score, "confidence.node.min_score", issues);
    validateUnitNumber(node.max_score, "confidence.node.max_score", issues);
    validateOrderedOptional(
      node.min_score,
      node.max_score,
      "confidence.node.min_score",
      "confidence.node.max_score",
      issues
    );
    validatePositiveNumber(
      node.signal_count_full_strength,
      "confidence.node.signal_count_full_strength",
      issues
    );
    validateUnitNumber(node.signal_strength_min, "confidence.node.signal_strength_min", issues);
    validateUnitNumber(node.signal_strength_max, "confidence.node.signal_strength_max", issues);
    validateOrderedOptional(
      node.signal_strength_min,
      node.signal_strength_max,
      "confidence.node.signal_strength_min",
      "confidence.node.signal_strength_max",
      issues
    );
    validateUnitNumber(node.agreement_min, "confidence.node.agreement_min", issues);
    validateUnitNumber(node.agreement_max, "confidence.node.agreement_max", issues);
    validateOrderedOptional(
      node.agreement_min,
      node.agreement_max,
      "confidence.node.agreement_min",
      "confidence.node.agreement_max",
      issues
    );
    validateUnitNumber(node.trust_score, "confidence.node.trust_score", issues);
    validateUnitNumber(node.recency_default_score, "confidence.node.recency_default_score", issues);
    validatePositiveNumber(node.recency_fresh_ms, "confidence.node.recency_fresh_ms", issues);
    validatePositiveNumber(node.recency_recent_ms, "confidence.node.recency_recent_ms", issues);
    validatePositiveNumber(node.recency_day_ms, "confidence.node.recency_day_ms", issues);
    validateOrderedOptional(
      node.recency_fresh_ms,
      node.recency_recent_ms,
      "confidence.node.recency_fresh_ms",
      "confidence.node.recency_recent_ms",
      issues
    );
    validateOrderedOptional(
      node.recency_recent_ms,
      node.recency_day_ms,
      "confidence.node.recency_recent_ms",
      "confidence.node.recency_day_ms",
      issues
    );
    validateUnitNumber(node.recency_fresh_score, "confidence.node.recency_fresh_score", issues);
    validateUnitNumber(node.recency_recent_score, "confidence.node.recency_recent_score", issues);
    validateUnitNumber(node.recency_day_score, "confidence.node.recency_day_score", issues);
    validateUnitNumber(node.recency_stale_score, "confidence.node.recency_stale_score", issues);
  }
  const synthetic = input.confidence?.synthetic;
  if (synthetic !== void 0) {
    validatePlainObject(synthetic, "confidence.synthetic", issues);
    validateUnitNumber(synthetic.default_score, "confidence.synthetic.default_score", issues);
    validateUnitNumber(synthetic.min_score, "confidence.synthetic.min_score", issues);
    validateUnitNumber(synthetic.max_score, "confidence.synthetic.max_score", issues);
    validateOrderedOptional(
      synthetic.min_score,
      synthetic.max_score,
      "confidence.synthetic.min_score",
      "confidence.synthetic.max_score",
      issues
    );
    validateUnitNumber(synthetic.base_score, "confidence.synthetic.base_score", issues);
    validateUnitNumber(synthetic.score_weight, "confidence.synthetic.score_weight", issues);
  }
  if (input.timeouts !== void 0) {
    validatePlainObject(input.timeouts, "timeouts", issues);
    validatePositiveNumber(input.timeouts.adapter_ms, "timeouts.adapter_ms", issues);
    validatePositiveNumber(input.timeouts.geo_ms, "timeouts.geo_ms", issues);
  }
  const opportunity = input.weights?.opportunity;
  if (opportunity !== void 0) {
    validatePlainObject(opportunity, "weights.opportunity", issues);
    validateNonNegativeNumber(opportunity.proximity, "weights.opportunity.proximity", issues);
    validateNonNegativeNumber(opportunity.signal, "weights.opportunity.signal", issues);
    validateNonNegativeNumber(opportunity.intent, "weights.opportunity.intent", issues);
  }
  const confidence = input.weights?.confidence;
  if (confidence !== void 0) {
    validatePlainObject(confidence, "weights.confidence", issues);
    validateNonNegativeNumber(confidence.signal_strength, "weights.confidence.signal_strength", issues);
    validateNonNegativeNumber(confidence.agreement, "weights.confidence.agreement", issues);
    validateNonNegativeNumber(confidence.trust, "weights.confidence.trust", issues);
    validateNonNegativeNumber(confidence.recency, "weights.confidence.recency", issues);
  }
  if (input.scoring !== void 0) {
    validatePlainObject(input.scoring, "scoring", issues);
    validatePenalty(input.scoring.surfaced_once_penalty, "scoring.surfaced_once_penalty", issues);
    validatePenalty(input.scoring.surfaced_twice_penalty, "scoring.surfaced_twice_penalty", issues);
    if (input.scoring.profiles !== void 0) {
      validatePlainObject(input.scoring.profiles, "scoring.profiles", issues);
      for (const [profileId, profile] of Object.entries(input.scoring.profiles ?? {})) {
        validateScoringProfile(profile, `scoring.profiles.${profileId}`, issues);
      }
    }
    if (input.scoring.offline_overlay !== void 0) {
      validateScoringProfile(input.scoring.offline_overlay, "scoring.offline_overlay", issues);
    }
  }
  if (input.$schema_version !== void 0 && input.$schema_version !== "1.0") {
    issues.push({
      path: "$schema_version",
      message: 'unsupported schema version (expected "1.0")',
      value: input.$schema_version
    });
  }
  if (input.product !== void 0) {
    validatePlainObject(input.product, "product", issues);
    validateOptionalNonEmptyString(input.product?.id, "product.id", issues);
    validateOptionalNonEmptyString(input.product?.name, "product.name", issues);
    validateOptionalNonEmptyString(input.product?.domain, "product.domain", issues);
  }
  if (input.domains !== void 0) {
    validatePlainObject(input.domains, "domains", issues);
    for (const [domainId, domain] of Object.entries(input.domains ?? {})) {
      validateDomain(domain, `domains.${domainId}`, issues);
    }
  }
  if (input.active_domain !== void 0) {
    validateOptionalNonEmptyString(input.active_domain, "active_domain", issues);
    if (typeof input.active_domain === "string" && input.domains !== void 0 && isPlainObject(input.domains) && !(input.active_domain in input.domains)) {
      issues.push({
        path: "active_domain",
        message: `must reference a key in "domains" (got "${input.active_domain}", available: [${Object.keys(input.domains).join(", ")}])`,
        value: input.active_domain
      });
    }
  }
  if (input.copy !== void 0) {
    validatePlainObject(input.copy, "copy", issues);
    validateOptionalNonEmptyString(input.copy?.locale, "copy.locale", issues);
    if (input.copy?.tone !== void 0) {
      const validTones = ["casual", "professional", "playful", "luxury"];
      if (typeof input.copy.tone !== "string" || !validTones.includes(input.copy.tone)) {
        issues.push({
          path: "copy.tone",
          message: `must be one of ${validTones.join(" | ")}`,
          value: input.copy.tone
        });
      }
    }
    if (input.copy?.char_caps !== void 0) {
      validatePlainObject(input.copy.char_caps, "copy.char_caps", issues);
      validatePositiveNumber(input.copy.char_caps.rationale, "copy.char_caps.rationale", issues);
      validatePositiveNumber(input.copy.char_caps.why_now, "copy.char_caps.why_now", issues);
      validatePositiveNumber(input.copy.char_caps.why_this, "copy.char_caps.why_this", issues);
      validatePositiveNumber(input.copy.char_caps.decision_frame, "copy.char_caps.decision_frame", issues);
    }
    if (input.copy?.fallback_titles !== void 0 && !Array.isArray(input.copy.fallback_titles)) {
      issues.push({ path: "copy.fallback_titles", message: "must be an array", value: input.copy.fallback_titles });
    }
    if (input.copy?.overrides !== void 0) {
      validatePlainObject(input.copy.overrides, "copy.overrides", issues);
      if (isPlainObject(input.copy.overrides)) {
        for (const [key, value] of Object.entries(input.copy.overrides)) {
          if (typeof value !== "string") {
            issues.push({
              path: `copy.overrides.${key}`,
              message: "must be a string",
              value
            });
          }
        }
      }
    }
    validateOptionalNonEmptyString(input.copy?.overrides_ref, "copy.overrides_ref", issues);
  }
  if (input.mobility !== void 0) {
    validatePlainObject(input.mobility, "mobility", issues);
    validateNonNegativeNumber(input.mobility.walking_meters_per_minute, "mobility.walking_meters_per_minute", issues);
    validateNonNegativeNumber(input.mobility.driving_meters_per_minute, "mobility.driving_meters_per_minute", issues);
  }
  if (input.runtime !== void 0) {
    validatePlainObject(input.runtime, "runtime", issues);
    if (input.runtime.offline !== void 0) {
      validatePlainObject(input.runtime.offline, "runtime.offline", issues);
      if (input.runtime.offline.policy !== void 0) {
        const validPolicies = ["static", "cache", "reject"];
        if (typeof input.runtime.offline.policy !== "string" || !validPolicies.includes(input.runtime.offline.policy)) {
          issues.push({
            path: "runtime.offline.policy",
            message: `must be one of ${validPolicies.join(" | ")}`,
            value: input.runtime.offline.policy
          });
        }
      }
      validateOptionalNonEmptyString(input.runtime.offline.default_intent, "runtime.offline.default_intent", issues);
      validateOptionalNonEmptyString(input.runtime.offline.copy_id, "runtime.offline.copy_id", issues);
    }
    validatePositiveNumber(input.runtime.total_budget_ms, "runtime.total_budget_ms", issues);
  }
  if (input.adapters !== void 0) {
    validatePlainObject(input.adapters, "adapters", issues);
    for (const slot of ["venue", "llm", "cache", "geo"]) {
      const meta = input.adapters?.[slot];
      if (meta !== void 0) {
        validatePlainObject(meta, `adapters.${slot}`, issues);
        validateOptionalNonEmptyString(meta?.id, `adapters.${slot}.id`, issues);
      }
    }
  }
  return issues;
}
function validateScoringProfile(profile, path, issues) {
  if (!isPlainObject(profile)) {
    issues.push({ path, message: "must be an object", value: profile });
    return;
  }
  const p = profile;
  validateUnitNumber(p.proximity, `${path}.proximity`, issues);
  validateUnitNumber(p.signal, `${path}.signal`, issues);
  validateUnitNumber(p.intent, `${path}.intent`, issues);
  if (isFiniteNumber(p.proximity) && isFiniteNumber(p.signal) && isFiniteNumber(p.intent)) {
    const sum = p.proximity + p.signal + p.intent;
    if (Math.abs(sum - 1) > 0.01) {
      issues.push({
        path,
        message: `weights must sum to 1.0 \xB1 0.01 (got ${sum.toFixed(3)})`,
        value: p
      });
    }
  }
}
function validateDomain(domain, path, issues) {
  if (!isPlainObject(domain)) {
    issues.push({ path, message: "must be an object", value: domain });
    return;
  }
  const d = domain;
  validateOptionalNonEmptyString(d.id, `${path}.id`, issues);
  validateOptionalNonEmptyString(d.display_name, `${path}.display_name`, issues);
  if (d.default_intents !== void 0 && !Array.isArray(d.default_intents)) {
    issues.push({ path: `${path}.default_intents`, message: "must be an array", value: d.default_intents });
  }
  if (d.primary_signals !== void 0 && !Array.isArray(d.primary_signals)) {
    issues.push({ path: `${path}.primary_signals`, message: "must be an array", value: d.primary_signals });
  }
  validateNonNegativeNumber(d.default_radius_meters, `${path}.default_radius_meters`, issues);
  if (d.category_buckets !== void 0 && !Array.isArray(d.category_buckets)) {
    issues.push({ path: `${path}.category_buckets`, message: "must be an array", value: d.category_buckets });
  }
  validateOptionalNonEmptyString(d.scoring_profile, `${path}.scoring_profile`, issues);
  if (d.copy_overrides !== void 0) {
    validatePlainObject(d.copy_overrides, `${path}.copy_overrides`, issues);
  }
}
function assertValidConfig(config = {}) {
  const issues = validateConfig(config);
  if (issues.length > 0) {
    throw new HadeConfigValidationError(issues);
  }
}
function validatePlainObject(value, path, issues) {
  if (!isPlainObject(value)) {
    issues.push({ path, message: "must be an object", value });
  }
}
function validateOptionalNonEmptyString(value, path, issues) {
  if (value === void 0) return;
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: "must be a non-empty string", value });
  }
}
function validatePositiveNumber(value, path, issues) {
  if (value === void 0) return;
  if (!isFiniteNumber(value) || value <= 0) {
    issues.push({ path, message: "must be a positive number", value });
  }
}
function validateNonNegativeNumber(value, path, issues) {
  if (value === void 0) return;
  if (!isFiniteNumber(value) || value < 0) {
    issues.push({ path, message: "must be a non-negative number", value });
  }
}
function validateUnitNumber(value, path, issues) {
  if (value === void 0) return;
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    issues.push({ path, message: "must be between 0 and 1", value });
  }
}
function validatePenalty(value, path, issues) {
  if (value === void 0) return;
  if (!isFiniteNumber(value) || value > 0) {
    issues.push({ path, message: "must be a finite number less than or equal to 0", value });
  }
}
function validateOrderedOptional(lower, upper, lowerPath, upperPath, issues) {
  if (lower === void 0 || upper === void 0) return;
  if (!isFiniteNumber(lower) || !isFiniteNumber(upper)) return;
  if (lower > upper) {
    issues.push({
      path: `${lowerPath}/${upperPath}`,
      message: "must be ordered from low to high",
      value: [lower, upper]
    });
  }
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/config/migrations.ts
var MIGRATIONS = [
  /**
   * v0 → 1.0
   *
   * Detects: input is a plain object lacking `$schema_version`.
   *
   * Action: stamp `$schema_version: "1.0"` onto the input. The existing v0
   * fields (`defaults`, `confidence`, `timeouts`, `weights`, `scoring`,
   * `metadata`) keep their structure and pass through to validation
   * unchanged — the v1.0 schema is a strict superset.
   *
   * Specifically, NOT moving `defaults.radius_meters` into `domains.dining.default_radius_meters` —
   * the v1.0 schema keeps `defaults` as the global fallback layer applied
   * after per-domain settings. Legacy consumers still see their override take
   * effect via the same field path.
   */
  {
    from: "v0",
    to: "1.0",
    apply: (raw) => {
      if (!isPlainObject2(raw)) return raw;
      if (typeof raw.$schema_version === "string") return raw;
      return {
        ...raw,
        $schema_version: "1.0"
      };
    }
  }
  // Future: { from: "1.0", to: "1.1", apply: ... } for additive minor releases
  // Future: { from: "1.x", to: "2.0", apply: ... } for breaking major releases
];
function migrateConfig(raw) {
  let migrated = raw;
  for (const step of MIGRATIONS) {
    migrated = step.apply(migrated);
  }
  return migrated;
}
function isPlainObject2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/config/loadConfig.ts
function loadConfig(config = {}, options = {}) {
  const migrated = migrateConfig(config);
  assertValidConfig(migrated);
  const configHash = migrated.defaults?.config_hash ?? options.configHash ?? DEFAULT_HADE_CONFIG.config_hash;
  const userDomains = migrated.domains ?? {};
  const mergedDomainKeys = /* @__PURE__ */ new Set([
    ...Object.keys(DEFAULT_HADE_CONFIG.domains),
    ...Object.keys(userDomains)
  ]);
  const resolvedDomains = {};
  for (const id of mergedDomainKeys) {
    const builtin = DEFAULT_HADE_CONFIG.domains[id];
    const override = userDomains[id];
    if (builtin && override) {
      resolvedDomains[id] = {
        ...builtin,
        ...override,
        copy_overrides: { ...builtin.copy_overrides, ...override.copy_overrides }
      };
    } else if (builtin) {
      resolvedDomains[id] = builtin;
    } else if (override) {
      resolvedDomains[id] = {
        id: override.id ?? id,
        display_name: override.display_name ?? id,
        default_intents: override.default_intents ?? [],
        primary_signals: override.primary_signals ?? [],
        default_radius_meters: override.default_radius_meters ?? 800,
        category_buckets: override.category_buckets ?? [],
        scoring_profile: override.scoring_profile ?? "balanced",
        copy_overrides: override.copy_overrides ?? {}
      };
    }
  }
  const userProfiles = migrated.scoring?.profiles ?? {};
  const mergedProfiles = {
    ...DEFAULT_HADE_CONFIG.scoring.profiles,
    ...userProfiles
  };
  return {
    $schema_version: "1.0",
    product: migrated.product,
    defaults: {
      ...DEFAULT_HADE_CONFIG.defaults,
      ...migrated.defaults,
      config_hash: configHash
    },
    confidence: {
      bands: {
        ...DEFAULT_HADE_CONFIG.confidence.bands,
        ...migrated.confidence?.bands
      },
      labels: {
        ...DEFAULT_HADE_CONFIG.confidence.labels,
        ...migrated.confidence?.labels
      },
      node: {
        ...DEFAULT_HADE_CONFIG.confidence.node,
        ...migrated.confidence?.node
      },
      synthetic: {
        ...DEFAULT_HADE_CONFIG.confidence.synthetic,
        ...migrated.confidence?.synthetic
      }
    },
    timeouts: {
      ...DEFAULT_HADE_CONFIG.timeouts,
      ...migrated.timeouts
    },
    weights: {
      opportunity: {
        ...DEFAULT_HADE_CONFIG.weights.opportunity,
        ...migrated.weights?.opportunity
      },
      confidence: {
        ...DEFAULT_HADE_CONFIG.weights.confidence,
        ...migrated.weights?.confidence
      }
    },
    scoring: {
      surfaced_once_penalty: migrated.scoring?.surfaced_once_penalty ?? DEFAULT_HADE_CONFIG.scoring.surfaced_once_penalty,
      surfaced_twice_penalty: migrated.scoring?.surfaced_twice_penalty ?? DEFAULT_HADE_CONFIG.scoring.surfaced_twice_penalty,
      profiles: mergedProfiles,
      offline_overlay: migrated.scoring?.offline_overlay ?? DEFAULT_HADE_CONFIG.scoring.offline_overlay
    },
    domains: resolvedDomains,
    active_domain: resolveActiveDomain(migrated.active_domain, resolvedDomains),
    copy: {
      locale: migrated.copy?.locale ?? DEFAULT_HADE_CONFIG.copy.locale,
      tone: migrated.copy?.tone ?? DEFAULT_HADE_CONFIG.copy.tone,
      char_caps: {
        ...DEFAULT_HADE_CONFIG.copy.char_caps,
        ...migrated.copy?.char_caps
      },
      fallback_titles: migrated.copy?.fallback_titles ?? DEFAULT_HADE_CONFIG.copy.fallback_titles,
      // Phase G: inline copy overrides — merge with built-in defaults
      // (empty map). Vertical-specific overrides at
      // `domains[active_domain].copy_overrides` are applied later in
      // `resolveEffectiveCopy` (called from createHade) so the precedence
      // is: BUILTIN_COPY_KEYS ← copy.overrides ← domain.copy_overrides.
      overrides: {
        ...DEFAULT_HADE_CONFIG.copy.overrides,
        ...migrated.copy?.overrides
      },
      ...migrated.copy?.overrides_ref !== void 0 ? { overrides_ref: migrated.copy.overrides_ref } : {}
    },
    mobility: {
      ...DEFAULT_HADE_CONFIG.mobility,
      ...migrated.mobility
    },
    runtime: {
      offline: {
        ...DEFAULT_HADE_CONFIG.runtime.offline,
        ...migrated.runtime?.offline
      },
      total_budget_ms: migrated.runtime?.total_budget_ms ?? DEFAULT_HADE_CONFIG.runtime.total_budget_ms
    },
    adapters: migrated.adapters ?? DEFAULT_HADE_CONFIG.adapters,
    metadata: migrated.metadata ?? DEFAULT_HADE_CONFIG.metadata,
    clientId: options.clientId ?? DEFAULT_HADE_CONFIG.clientId,
    config_hash: configHash
  };
}
function resolveActiveDomain(candidate, domains) {
  const selected = candidate ?? DEFAULT_HADE_CONFIG.active_domain;
  if (selected in domains) return selected;
  throw new HadeConfigValidationError([
    {
      path: "active_domain",
      message: `must reference a key in "domains" (got "${selected}", available: [${Object.keys(domains).join(", ")}])`,
      value: selected
    }
  ]);
}
function resolveEffectiveCopy(config) {
  const globalOverrides = config.copy.overrides;
  const activeDomain = config.domains[config.active_domain];
  const domainOverrides = activeDomain?.copy_overrides ?? {};
  return { ...globalOverrides, ...domainOverrides };
}

exports.loadConfig = loadConfig;
exports.resolveEffectiveCopy = resolveEffectiveCopy;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map