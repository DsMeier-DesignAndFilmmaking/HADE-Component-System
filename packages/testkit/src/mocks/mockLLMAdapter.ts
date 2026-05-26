import type { LLMAdapter } from "@hade/core";

export type LLMEnhanceResult = {
  rationale?: string;
  why_now?: string;
  why_this?: string;
  decision_frame?: string;
};

export interface MockLLMAdapterOptions {
  readonly id?: string;
  /**
   * Canned responses, consumed in order. Once exhausted, subsequent calls
   * return `null` (matching `noopLLM` behavior). Pass `null` as an entry to
   * simulate a per-call null response without exhausting the queue.
   */
  readonly responses?: ReadonlyArray<LLMEnhanceResult | null>;
  readonly alwaysFail?: boolean | Error;
}

export interface MockLLMAdapterCall {
  readonly prompt: string;
  readonly options: { timeout_ms?: number; model?: string } | undefined;
}

export interface MockLLMAdapter extends LLMAdapter {
  readonly calls: ReadonlyArray<MockLLMAdapterCall>;
  reset(): void;
}

/**
 * Scripted LLMAdapter. Records every prompt and consumes a canned response
 * queue. Useful for verifying prompt construction without hitting OpenAI.
 *
 * @example
 *   const llm = mockLLMAdapter({
 *     responses: [{ rationale: "great pick", why_now: "lunch time" }],
 *   });
 *   await client.decide({ ... });
 *   expect(llm.calls[0].prompt).toContain("dining");
 */
export function mockLLMAdapter(options: MockLLMAdapterOptions = {}): MockLLMAdapter {
  const id = options.id ?? "mock_llm@1.0.0";
  const responses = options.responses ?? [];
  const calls: MockLLMAdapterCall[] = [];
  let cursor = 0;

  return {
    id,
    calls,
    reset(): void {
      calls.length = 0;
      cursor = 0;
    },
    async enhanceCopy(prompt, opts): Promise<LLMEnhanceResult | null> {
      calls.push({ prompt, options: opts });
      if (options.alwaysFail) {
        if (options.alwaysFail instanceof Error) throw options.alwaysFail;
        throw new Error(`${id}: mock adapter configured to always fail`);
      }
      if (cursor >= responses.length) return null;
      const response = responses[cursor]!;
      cursor++;
      return response;
    },
  };
}
