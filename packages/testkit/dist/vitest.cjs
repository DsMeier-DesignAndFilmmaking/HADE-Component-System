'use strict';

var vitest = require('vitest');

// src/assertions/vitest.ts
function isObject(v) {
  return typeof v === "object" && v !== null;
}
function isDecisionEngineOutput(v) {
  if (!isObject(v)) return false;
  return typeof v.output_version === "string" && typeof v.request_id === "string" && typeof v.source === "string" && isObject(v.decision) && isObject(v.confidence) && isObject(v.rationale) && isObject(v.copy_tokens) && isObject(v.action_tokens) && isObject(v.layout_tokens) && isObject(v.theme_tokens) && isObject(v.ux_state) && isObject(v.analytics);
}
vitest.expect.extend({
  toBeValidDecisionEngineOutput(received) {
    const pass = isDecisionEngineOutput(received);
    return {
      pass,
      message: () => pass ? `expected value NOT to be a valid DecisionEngineOutput` : `expected value to be a valid DecisionEngineOutput (missing required fields)`
    };
  },
  toHaveConfidenceBand(received, expected) {
    if (!isDecisionEngineOutput(received)) {
      return {
        pass: false,
        message: () => `expected a DecisionEngineOutput, got ${typeof received}`
      };
    }
    const actual = received.confidence.band;
    return {
      pass: actual === expected,
      message: () => actual === expected ? `expected confidence.band NOT to be ${expected}` : `expected confidence.band to be ${expected}, got ${actual}`
    };
  },
  toBeFallback(received, reason) {
    if (!isDecisionEngineOutput(received)) {
      return {
        pass: false,
        message: () => `expected a DecisionEngineOutput, got ${typeof received}`
      };
    }
    if (!received.is_fallback) {
      return {
        pass: false,
        message: () => `expected output to be a fallback (is_fallback=true)`
      };
    }
    if (reason && received.fallback_meta?.reason !== reason) {
      return {
        pass: false,
        message: () => `expected fallback_meta.reason to be "${reason}", got "${received.fallback_meta?.reason ?? "undefined"}"`
      };
    }
    return { pass: true, message: () => `expected output NOT to be a fallback` };
  }
});
//# sourceMappingURL=vitest.cjs.map
//# sourceMappingURL=vitest.cjs.map