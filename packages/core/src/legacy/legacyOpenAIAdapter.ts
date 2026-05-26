/**
 * legacyOpenAIAdapter — byte-identical legacy shim.
 *
 * Wraps the existing inline copy-enhancement function (`enhanceCopyWithLLM`
 * at `src/app/api/hade/decide/route.ts:814-920`) as an {@link LLMAdapter}.
 * Lets the route adopt the adapter API with zero behavior delta — the same
 * OpenAI fetch, the same `extractSafeCopyPatch` validation, the same char
 * caps — by passing the existing function in as a dep.
 *
 * Removable in v2.0 once the route is fully migrated to the clean-room
 * `openai()` adapter from `@hade/adapters-openai`.
 */

import type { LLMAdapter } from "../types/adapters.js";

/** Loose patch shape — matches the existing `enhanceCopyWithLLM` return. */
export interface LegacyCopyPatch {
  rationale?: string;
  why_now?: string;
  why_this?: string;
  decision_frame?: string;
}

export interface LegacyOpenAIAdapterDeps {
  /**
   * The existing in-tree `enhanceCopyWithLLM`-shaped function. Takes a single
   * pre-rendered prompt string; returns a copy patch or null. Adapter passes
   * the prompt through verbatim — no normalization, no re-validation.
   */
  readonly enhanceCopy: (
    prompt: string,
    options?: { timeout_ms?: number; model?: string },
  ) => Promise<LegacyCopyPatch | null>;
  /** Adapter id surfaced in logs. Defaults to `"openai_legacy@0.0.0"`. */
  readonly id?: string;
}

export function legacyOpenAIAdapter(deps: LegacyOpenAIAdapterDeps): LLMAdapter {
  const id = deps.id ?? "openai_legacy@0.0.0";
  return {
    id,
    async enhanceCopy(prompt, options) {
      return deps.enhanceCopy(prompt, options);
    },
  };
}
