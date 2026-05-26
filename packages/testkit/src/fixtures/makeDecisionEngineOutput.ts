import type { DecisionEngineOutput } from "@hade/core";
import { fromHadeDecision } from "@hade/core";
import { makeDecision } from "./makeDecision.js";

/**
 * Builds a fully-assembled {@link DecisionEngineOutput} with sensible defaults.
 * Routes through `fromHadeDecision` so every field — including derived ones
 * like `confidence.band`, `ux_state`, `copy_tokens.keys` — is computed
 * consistently with the real engine.
 *
 * @param decisionOverrides — patches the input decision before assembly
 * @param outputOverrides   — patches the assembled output (deep-merged)
 */
export function makeDecisionEngineOutput(
  decisionOverrides: Partial<Parameters<typeof makeDecision>[0]> = {},
  outputOverrides: Partial<DecisionEngineOutput> = {},
): DecisionEngineOutput {
  const decision = makeDecision(decisionOverrides);
  const base = fromHadeDecision(decision, {
    request_id: outputOverrides.request_id ?? "req_test",
    generated_at_ms: outputOverrides.generated_at_ms ?? 1_700_000_000_000,
    locale: "en-US",
    config_hash: "sha256:test",
  });
  return { ...base, ...outputOverrides };
}
