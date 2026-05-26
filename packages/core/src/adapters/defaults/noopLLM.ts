/**
 * noopLLM — an LLMAdapter that always returns null.
 *
 * Used as the bundle default when no real LLM provider is wired. The engine
 * falls back to its deterministic copy templates (see
 * `src/lib/hade/engine.ts:384 generateRationale`), preserving the no-OpenAI-key
 * path that already works today.
 */

import type { LLMAdapter } from "../../types/adapters.js";

export interface NoopLLMOptions {
  readonly id?: string;
}

export function noopLLM(options: NoopLLMOptions = {}): LLMAdapter {
  const id = options.id ?? "noop_llm@1.0.0";
  return {
    id,
    async enhanceCopy(): Promise<null> {
      return null;
    },
  };
}
