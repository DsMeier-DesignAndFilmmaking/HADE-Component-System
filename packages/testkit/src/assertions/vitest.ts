/**
 * Vitest matchers for {@link DecisionEngineOutput}.
 *
 * IMPORTANT: this module imports `vitest`, which is declared as an OPTIONAL
 * peer dep. Consumers using Jest or uvu can use the rest of `@hade/testkit`
 * without installing vitest — they just won't import from this sub-path.
 *
 * Wiring:
 *   // vitest.setup.ts
 *   import "@hade/testkit/vitest";
 *
 * Then in tests:
 *   expect(output).toBeValidDecisionEngineOutput();
 *   expect(output).toHaveConfidenceBand("high");
 *   expect(output).toBeFallback("places_timeout");
 */
import type { DecisionEngineOutput, ConfidenceBand } from "@hade/core";
// expect is imported only for `expect.extend` — vitest is an optional peer.
import { expect } from "vitest";

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isDecisionEngineOutput(v: unknown): v is DecisionEngineOutput {
  if (!isObject(v)) return false;
  return (
    typeof v.output_version === "string" &&
    typeof v.request_id === "string" &&
    typeof v.source === "string" &&
    isObject(v.decision) &&
    isObject(v.confidence) &&
    isObject(v.rationale) &&
    isObject(v.copy_tokens) &&
    isObject(v.action_tokens) &&
    isObject(v.layout_tokens) &&
    isObject(v.theme_tokens) &&
    isObject(v.ux_state) &&
    isObject(v.analytics)
  );
}

expect.extend({
  toBeValidDecisionEngineOutput(received: unknown): MatcherResult {
    const pass = isDecisionEngineOutput(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected value NOT to be a valid DecisionEngineOutput`
          : `expected value to be a valid DecisionEngineOutput (missing required fields)`,
    };
  },

  toHaveConfidenceBand(received: unknown, expected: ConfidenceBand): MatcherResult {
    if (!isDecisionEngineOutput(received)) {
      return {
        pass: false,
        message: () => `expected a DecisionEngineOutput, got ${typeof received}`,
      };
    }
    const actual = received.confidence.band;
    return {
      pass: actual === expected,
      message: () =>
        actual === expected
          ? `expected confidence.band NOT to be ${expected}`
          : `expected confidence.band to be ${expected}, got ${actual}`,
    };
  },

  toBeFallback(received: unknown, reason?: string): MatcherResult {
    if (!isDecisionEngineOutput(received)) {
      return {
        pass: false,
        message: () => `expected a DecisionEngineOutput, got ${typeof received}`,
      };
    }
    if (!received.is_fallback) {
      return {
        pass: false,
        message: () => `expected output to be a fallback (is_fallback=true)`,
      };
    }
    if (reason && received.fallback_meta?.reason !== reason) {
      return {
        pass: false,
        message: () =>
          `expected fallback_meta.reason to be "${reason}", got "${received.fallback_meta?.reason ?? "undefined"}"`,
      };
    }
    return { pass: true, message: () => `expected output NOT to be a fallback` };
  },
});

// Vitest's Assertion / AsymmetricMatchersContaining live in @vitest/expect and
// are re-exported through vitest. We declare against the source module so the
// `<T = any>` parameter shape matches exactly (TS2428 fires if it doesn't).
// Must match @vitest/expect's signature exactly (T defaults to `any`, not
// `unknown`, or TS2428 fires).
declare module "@vitest/expect" {
  interface Assertion<T = any> {
    toBeValidDecisionEngineOutput(): T;
    toHaveConfidenceBand(band: ConfidenceBand): T;
    toBeFallback(reason?: string): T;
  }
  interface AsymmetricMatchersContaining {
    toBeValidDecisionEngineOutput(): unknown;
    toHaveConfidenceBand(band: ConfidenceBand): unknown;
    toBeFallback(reason?: string): unknown;
  }
}
