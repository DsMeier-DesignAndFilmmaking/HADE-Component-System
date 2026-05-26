import { LLMAdapter } from '@hade/core';

/**
 * @hade/adapters-openai — clean-room LLMAdapter for OpenAI chat completions.
 *
 * Replicates the inline `enhanceCopyWithLLM` from
 * `src/app/api/hade/decide/route.ts:814-920` byte-for-byte: same model, same
 * temperature, same max_tokens, same `response_format: { type: "json_object" }`,
 * same 1500 ms timeout, same char-cap validation (280/120/60/180), same
 * "null on any failure → caller falls back to deterministic copy" contract.
 *
 * The adapter parses the LLM JSON itself; per-field char caps are enforced
 * inside the adapter so the engine receives a pre-validated patch.
 *
 * The adapter does NOT validate that the LLM didn't change venue identity —
 * that's `extractSafeCopyPatch`'s job in the route, called AFTER `enhanceCopy`.
 */

declare const OPENAI_ADAPTER_ID: "openai@1.0.0";
interface OpenAIAdapterOptions {
    /** Falls back to `process.env.OPENAI_API_KEY` at first call; never read eagerly. */
    readonly apiKey?: string;
    /** Default `"gpt-4o-mini"`. */
    readonly model?: string;
    /** Default `0.7`. */
    readonly temperature?: number;
    /** Default `260`. */
    readonly maxTokens?: number;
    /** Default `1500` ms — matches `COPY_ENHANCE_TIMEOUT_MS`. */
    readonly timeoutMs?: number;
    /** Default `"https://api.openai.com/v1"`. Override for proxies / Azure OpenAI. */
    readonly baseUrl?: string;
    /** Override for tests / non-global fetch contexts. */
    readonly fetchImpl?: typeof fetch;
    /** Override the adapter id surfaced in logs. */
    readonly id?: string;
}
interface CopyPatch {
    rationale?: string;
    why_now?: string;
    why_this?: string;
    decision_frame?: string;
}
declare function openai(opts?: OpenAIAdapterOptions): LLMAdapter;
/**
 * Drops any field that:
 *   • is not a string
 *   • exceeds its per-field char cap (truncation produces broken copy)
 *
 * Returns only the surviving subset. Order matches the legacy code.
 */
declare function validatePatch(raw: Record<string, unknown>): CopyPatch;

export { type CopyPatch, OPENAI_ADAPTER_ID, type OpenAIAdapterOptions, openai, validatePatch };
