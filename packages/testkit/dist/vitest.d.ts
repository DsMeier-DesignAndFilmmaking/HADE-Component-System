import { ConfidenceBand } from '@hade/core';

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
