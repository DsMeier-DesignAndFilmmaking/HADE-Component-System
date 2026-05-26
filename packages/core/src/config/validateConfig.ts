import type { HadeConfig } from "./schema.js";

export interface HadeConfigValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly value?: unknown;
}

export class HadeConfigValidationError extends Error {
  readonly issues: readonly HadeConfigValidationIssue[];

  constructor(issues: readonly HadeConfigValidationIssue[]) {
    super(`Invalid HadeConfig: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
    this.name = "HadeConfigValidationError";
    this.issues = issues;
    Object.setPrototypeOf(this, HadeConfigValidationError.prototype);
  }
}

export function validateConfig(config: HadeConfig = {}): HadeConfigValidationIssue[] {
  const issues: HadeConfigValidationIssue[] = [];
  const rawConfig: unknown = config;

  if (!isPlainObject(rawConfig)) {
    return [{ path: "config", message: "must be an object", value: config }];
  }
  const input = config;

  if (input.defaults !== undefined) {
    validatePlainObject(input.defaults, "defaults", issues);
    validatePositiveNumber(input.defaults.radius_meters, "defaults.radius_meters", issues);
    validateOptionalNonEmptyString(input.defaults.locale, "defaults.locale", issues);
    validateOptionalNonEmptyString(input.defaults.config_hash, "defaults.config_hash", issues);
  }

  if (input.metadata !== undefined) {
    validatePlainObject(input.metadata, "metadata", issues);
  }

  const bands = input.confidence?.bands;
  if (bands !== undefined) {
    validatePlainObject(bands, "confidence.bands", issues);
    validateUnitNumber(bands.high, "confidence.bands.high", issues);
    validateUnitNumber(bands.medium, "confidence.bands.medium", issues);
    validateNonNegativeNumber(
      bands.threshold_high_multiplier,
      "confidence.bands.threshold_high_multiplier",
      issues,
    );
    validateNonNegativeNumber(
      bands.threshold_medium_multiplier,
      "confidence.bands.threshold_medium_multiplier",
      issues,
    );
    validateOrderedOptional(
      bands.medium,
      bands.high,
      "confidence.bands.medium",
      "confidence.bands.high",
      issues,
    );
  }

  const labels = input.confidence?.labels;
  if (labels !== undefined) {
    validatePlainObject(labels, "confidence.labels", issues);
    validateUnitNumber(labels.strong_pick, "confidence.labels.strong_pick", issues);
    validateUnitNumber(labels.good_fit, "confidence.labels.good_fit", issues);
    validateOrderedOptional(
      labels.good_fit,
      labels.strong_pick,
      "confidence.labels.good_fit",
      "confidence.labels.strong_pick",
      issues,
    );
  }

  const node = input.confidence?.node;
  if (node !== undefined) {
    validatePlainObject(node, "confidence.node", issues);
    validateUnitNumber(node.default_score, "confidence.node.default_score", issues);
    validateUnitNumber(node.min_score, "confidence.node.min_score", issues);
    validateUnitNumber(node.max_score, "confidence.node.max_score", issues);
    validateOrderedOptional(
      node.min_score,
      node.max_score,
      "confidence.node.min_score",
      "confidence.node.max_score",
      issues,
    );
    validatePositiveNumber(
      node.signal_count_full_strength,
      "confidence.node.signal_count_full_strength",
      issues,
    );
    validateUnitNumber(node.signal_strength_min, "confidence.node.signal_strength_min", issues);
    validateUnitNumber(node.signal_strength_max, "confidence.node.signal_strength_max", issues);
    validateOrderedOptional(
      node.signal_strength_min,
      node.signal_strength_max,
      "confidence.node.signal_strength_min",
      "confidence.node.signal_strength_max",
      issues,
    );
    validateUnitNumber(node.agreement_min, "confidence.node.agreement_min", issues);
    validateUnitNumber(node.agreement_max, "confidence.node.agreement_max", issues);
    validateOrderedOptional(
      node.agreement_min,
      node.agreement_max,
      "confidence.node.agreement_min",
      "confidence.node.agreement_max",
      issues,
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
      issues,
    );
    validateOrderedOptional(
      node.recency_recent_ms,
      node.recency_day_ms,
      "confidence.node.recency_recent_ms",
      "confidence.node.recency_day_ms",
      issues,
    );
    validateUnitNumber(node.recency_fresh_score, "confidence.node.recency_fresh_score", issues);
    validateUnitNumber(node.recency_recent_score, "confidence.node.recency_recent_score", issues);
    validateUnitNumber(node.recency_day_score, "confidence.node.recency_day_score", issues);
    validateUnitNumber(node.recency_stale_score, "confidence.node.recency_stale_score", issues);
  }

  const synthetic = input.confidence?.synthetic;
  if (synthetic !== undefined) {
    validatePlainObject(synthetic, "confidence.synthetic", issues);
    validateUnitNumber(synthetic.default_score, "confidence.synthetic.default_score", issues);
    validateUnitNumber(synthetic.min_score, "confidence.synthetic.min_score", issues);
    validateUnitNumber(synthetic.max_score, "confidence.synthetic.max_score", issues);
    validateOrderedOptional(
      synthetic.min_score,
      synthetic.max_score,
      "confidence.synthetic.min_score",
      "confidence.synthetic.max_score",
      issues,
    );
    validateUnitNumber(synthetic.base_score, "confidence.synthetic.base_score", issues);
    validateUnitNumber(synthetic.score_weight, "confidence.synthetic.score_weight", issues);
  }

  if (input.timeouts !== undefined) {
    validatePlainObject(input.timeouts, "timeouts", issues);
    validatePositiveNumber(input.timeouts.adapter_ms, "timeouts.adapter_ms", issues);
    validatePositiveNumber(input.timeouts.geo_ms, "timeouts.geo_ms", issues);
  }

  const opportunity = input.weights?.opportunity;
  if (opportunity !== undefined) {
    validatePlainObject(opportunity, "weights.opportunity", issues);
    validateNonNegativeNumber(opportunity.proximity, "weights.opportunity.proximity", issues);
    validateNonNegativeNumber(opportunity.signal, "weights.opportunity.signal", issues);
    validateNonNegativeNumber(opportunity.intent, "weights.opportunity.intent", issues);
  }

  const confidence = input.weights?.confidence;
  if (confidence !== undefined) {
    validatePlainObject(confidence, "weights.confidence", issues);
    validateNonNegativeNumber(confidence.signal_strength, "weights.confidence.signal_strength", issues);
    validateNonNegativeNumber(confidence.agreement, "weights.confidence.agreement", issues);
    validateNonNegativeNumber(confidence.trust, "weights.confidence.trust", issues);
    validateNonNegativeNumber(confidence.recency, "weights.confidence.recency", issues);
  }

  if (input.scoring !== undefined) {
    validatePlainObject(input.scoring, "scoring", issues);
    validatePenalty(input.scoring.surfaced_once_penalty, "scoring.surfaced_once_penalty", issues);
    validatePenalty(input.scoring.surfaced_twice_penalty, "scoring.surfaced_twice_penalty", issues);

    // Phase F: named scoring profiles + offline overlay
    if (input.scoring.profiles !== undefined) {
      validatePlainObject(input.scoring.profiles, "scoring.profiles", issues);
      for (const [profileId, profile] of Object.entries(input.scoring.profiles ?? {})) {
        validateScoringProfile(profile, `scoring.profiles.${profileId}`, issues);
      }
    }
    if (input.scoring.offline_overlay !== undefined) {
      validateScoringProfile(input.scoring.offline_overlay, "scoring.offline_overlay", issues);
    }
  }

  // Phase F: $schema_version
  if (input.$schema_version !== undefined && input.$schema_version !== "1.0") {
    issues.push({
      path: "$schema_version",
      message: 'unsupported schema version (expected "1.0")',
      value: input.$schema_version,
    });
  }

  // Phase F: product metadata
  if (input.product !== undefined) {
    validatePlainObject(input.product, "product", issues);
    validateOptionalNonEmptyString(input.product?.id, "product.id", issues);
    validateOptionalNonEmptyString(input.product?.name, "product.name", issues);
    validateOptionalNonEmptyString(input.product?.domain, "product.domain", issues);
  }

  // Phase F: open vertical map
  if (input.domains !== undefined) {
    validatePlainObject(input.domains, "domains", issues);
    for (const [domainId, domain] of Object.entries(input.domains ?? {})) {
      validateDomain(domain, `domains.${domainId}`, issues);
    }
  }

  if (input.active_domain !== undefined) {
    validateOptionalNonEmptyString(input.active_domain, "active_domain", issues);
    // Cross-field check: active_domain must reference a key in domains (when both supplied).
    if (
      typeof input.active_domain === "string" &&
      input.domains !== undefined &&
      isPlainObject(input.domains) &&
      !(input.active_domain in input.domains)
    ) {
      issues.push({
        path: "active_domain",
        message: `must reference a key in "domains" (got "${input.active_domain}", available: [${Object.keys(input.domains).join(", ")}])`,
        value: input.active_domain,
      });
    }
  }

  // Phase F: copy block
  if (input.copy !== undefined) {
    validatePlainObject(input.copy, "copy", issues);
    validateOptionalNonEmptyString(input.copy?.locale, "copy.locale", issues);
    if (input.copy?.tone !== undefined) {
      const validTones = ["casual", "professional", "playful", "luxury"];
      if (typeof input.copy.tone !== "string" || !validTones.includes(input.copy.tone)) {
        issues.push({
          path: "copy.tone",
          message: `must be one of ${validTones.join(" | ")}`,
          value: input.copy.tone,
        });
      }
    }
    if (input.copy?.char_caps !== undefined) {
      validatePlainObject(input.copy.char_caps, "copy.char_caps", issues);
      validatePositiveNumber(input.copy.char_caps.rationale, "copy.char_caps.rationale", issues);
      validatePositiveNumber(input.copy.char_caps.why_now, "copy.char_caps.why_now", issues);
      validatePositiveNumber(input.copy.char_caps.why_this, "copy.char_caps.why_this", issues);
      validatePositiveNumber(input.copy.char_caps.decision_frame, "copy.char_caps.decision_frame", issues);
    }
    if (input.copy?.fallback_titles !== undefined && !Array.isArray(input.copy.fallback_titles)) {
      issues.push({ path: "copy.fallback_titles", message: "must be an array", value: input.copy.fallback_titles });
    }
    // Phase G: inline copy overrides (string → string map).
    if (input.copy?.overrides !== undefined) {
      validatePlainObject(input.copy.overrides, "copy.overrides", issues);
      if (isPlainObject(input.copy.overrides)) {
        for (const [key, value] of Object.entries(input.copy.overrides)) {
          if (typeof value !== "string") {
            issues.push({
              path: `copy.overrides.${key}`,
              message: "must be a string",
              value,
            });
          }
        }
      }
    }
    validateOptionalNonEmptyString(input.copy?.overrides_ref, "copy.overrides_ref", issues);
  }

  // Phase F: mobility block — 0 allowed (digital verticals)
  if (input.mobility !== undefined) {
    validatePlainObject(input.mobility, "mobility", issues);
    validateNonNegativeNumber(input.mobility.walking_meters_per_minute, "mobility.walking_meters_per_minute", issues);
    validateNonNegativeNumber(input.mobility.driving_meters_per_minute, "mobility.driving_meters_per_minute", issues);
  }

  // Phase F: runtime block
  if (input.runtime !== undefined) {
    validatePlainObject(input.runtime, "runtime", issues);
    if (input.runtime.offline !== undefined) {
      validatePlainObject(input.runtime.offline, "runtime.offline", issues);
      if (input.runtime.offline.policy !== undefined) {
        const validPolicies = ["static", "cache", "reject"];
        if (
          typeof input.runtime.offline.policy !== "string" ||
          !validPolicies.includes(input.runtime.offline.policy)
        ) {
          issues.push({
            path: "runtime.offline.policy",
            message: `must be one of ${validPolicies.join(" | ")}`,
            value: input.runtime.offline.policy,
          });
        }
      }
      validateOptionalNonEmptyString(input.runtime.offline.default_intent, "runtime.offline.default_intent", issues);
      validateOptionalNonEmptyString(input.runtime.offline.copy_id, "runtime.offline.copy_id", issues);
    }
    validatePositiveNumber(input.runtime.total_budget_ms, "runtime.total_budget_ms", issues);
  }

  // Phase F: adapter metadata
  if (input.adapters !== undefined) {
    validatePlainObject(input.adapters, "adapters", issues);
    for (const slot of ["venue", "llm", "cache", "geo"] as const) {
      const meta = input.adapters?.[slot];
      if (meta !== undefined) {
        validatePlainObject(meta, `adapters.${slot}`, issues);
        validateOptionalNonEmptyString(meta?.id, `adapters.${slot}.id`, issues);
      }
    }
  }

  return issues;
}

function validateScoringProfile(
  profile: unknown,
  path: string,
  issues: HadeConfigValidationIssue[],
): void {
  if (!isPlainObject(profile)) {
    issues.push({ path, message: "must be an object", value: profile });
    return;
  }
  const p = profile as { proximity?: unknown; signal?: unknown; intent?: unknown };
  validateUnitNumber(p.proximity, `${path}.proximity`, issues);
  validateUnitNumber(p.signal, `${path}.signal`, issues);
  validateUnitNumber(p.intent, `${path}.intent`, issues);

  // Weights must sum to 1.0 ± 0.01 — silent renormalization changes ranking,
  // so we throw loudly per the approved plan's OQ2.
  if (
    isFiniteNumber(p.proximity) &&
    isFiniteNumber(p.signal) &&
    isFiniteNumber(p.intent)
  ) {
    const sum = p.proximity + p.signal + p.intent;
    if (Math.abs(sum - 1.0) > 0.01) {
      issues.push({
        path,
        message: `weights must sum to 1.0 ± 0.01 (got ${sum.toFixed(3)})`,
        value: p,
      });
    }
  }
}

function validateDomain(
  domain: unknown,
  path: string,
  issues: HadeConfigValidationIssue[],
): void {
  if (!isPlainObject(domain)) {
    issues.push({ path, message: "must be an object", value: domain });
    return;
  }
  const d = domain as {
    id?: unknown;
    display_name?: unknown;
    default_intents?: unknown;
    primary_signals?: unknown;
    default_radius_meters?: unknown;
    category_buckets?: unknown;
    scoring_profile?: unknown;
    copy_overrides?: unknown;
  };
  validateOptionalNonEmptyString(d.id, `${path}.id`, issues);
  validateOptionalNonEmptyString(d.display_name, `${path}.display_name`, issues);
  if (d.default_intents !== undefined && !Array.isArray(d.default_intents)) {
    issues.push({ path: `${path}.default_intents`, message: "must be an array", value: d.default_intents });
  }
  if (d.primary_signals !== undefined && !Array.isArray(d.primary_signals)) {
    issues.push({ path: `${path}.primary_signals`, message: "must be an array", value: d.primary_signals });
  }
  // 0 is valid (digital verticals) — use non-negative not positive.
  validateNonNegativeNumber(d.default_radius_meters, `${path}.default_radius_meters`, issues);
  if (d.category_buckets !== undefined && !Array.isArray(d.category_buckets)) {
    issues.push({ path: `${path}.category_buckets`, message: "must be an array", value: d.category_buckets });
  }
  validateOptionalNonEmptyString(d.scoring_profile, `${path}.scoring_profile`, issues);
  if (d.copy_overrides !== undefined) {
    validatePlainObject(d.copy_overrides, `${path}.copy_overrides`, issues);
  }
}

export function assertValidConfig(config: HadeConfig = {}): void {
  const issues = validateConfig(config);
  if (issues.length > 0) {
    throw new HadeConfigValidationError(issues);
  }
}

function validatePlainObject(
  value: unknown,
  path: string,
  issues: HadeConfigValidationIssue[],
): void {
  if (!isPlainObject(value)) {
    issues.push({ path, message: "must be an object", value });
  }
}

function validateOptionalNonEmptyString(
  value: unknown,
  path: string,
  issues: HadeConfigValidationIssue[],
): void {
  if (value === undefined) return;
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: "must be a non-empty string", value });
  }
}

function validatePositiveNumber(
  value: unknown,
  path: string,
  issues: HadeConfigValidationIssue[],
): void {
  if (value === undefined) return;
  if (!isFiniteNumber(value) || value <= 0) {
    issues.push({ path, message: "must be a positive number", value });
  }
}

function validateNonNegativeNumber(
  value: unknown,
  path: string,
  issues: HadeConfigValidationIssue[],
): void {
  if (value === undefined) return;
  if (!isFiniteNumber(value) || value < 0) {
    issues.push({ path, message: "must be a non-negative number", value });
  }
}

function validateUnitNumber(
  value: unknown,
  path: string,
  issues: HadeConfigValidationIssue[],
): void {
  if (value === undefined) return;
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    issues.push({ path, message: "must be between 0 and 1", value });
  }
}

function validatePenalty(
  value: unknown,
  path: string,
  issues: HadeConfigValidationIssue[],
): void {
  if (value === undefined) return;
  if (!isFiniteNumber(value) || value > 0) {
    issues.push({ path, message: "must be a finite number less than or equal to 0", value });
  }
}

function validateOrderedOptional(
  lower: unknown,
  upper: unknown,
  lowerPath: string,
  upperPath: string,
  issues: HadeConfigValidationIssue[],
): void {
  if (lower === undefined || upper === undefined) return;
  if (!isFiniteNumber(lower) || !isFiniteNumber(upper)) return;
  if (lower > upper) {
    issues.push({
      path: `${lowerPath}/${upperPath}`,
      message: "must be ordered from low to high",
      value: [lower, upper],
    });
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
