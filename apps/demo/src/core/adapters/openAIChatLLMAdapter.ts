/**
 * OpenAI chat-completions {@link LLMAdapter}, wrapping the byte-identical
 * fetch logic that previously lived inline in
 * `src/app/api/hade/decide/route.ts:814-920 enhanceCopyWithLLM`.
 *
 * The route's `enhanceCopyWithLLM` still owns:
 *   • Prompt construction (venue/mode/intent context, current_copy echo)
 *   • `extractSafeCopyPatch` (anti-LLM-swap safety guard — needs decision.id)
 *   • Per-field char-cap validation (280 / 120 / 60 / 180)
 *   • Logging with reqId
 *
 * This adapter owns ONLY the OpenAI transport: same URL, headers, body shape,
 * and 1500 ms timeout (`COPY_ENHANCE_TIMEOUT_MS`) as the legacy code at
 * `src/app/api/hade/decide/route.ts:849-867`.
 *
 * Registered alongside the venue adapter via `registerDefaults.ts`.
 */

import "server-only";

import { legacyOpenAIAdapter, type LegacyCopyPatch } from "@hade/core/legacy";
import type { LLMAdapter } from "@hade/core";
import { serverEnv } from "@/lib/env/server";

const COPY_ENHANCE_TIMEOUT_MS = 1500;
const DEFAULT_MODEL = "gpt-4o-mini";

// Byte-identical to route.ts:824-833.
const SYSTEM_PROMPT =
  "You are a terse, evocative copy writer for a spontaneous-decision app.\n" +
  "Your only job: write contextually-grounded copy for an already-selected venue card.\n" +
  "RULES — you MUST follow all of them:\n" +
  "• Do NOT change the venue name, category, or invent facts not provided.\n" +
  "• rationale: 1–2 sentences (≤280 chars) referencing a specific context factor.\n" +
  "• why_now: ≤120 chars explaining what makes this right at this exact moment.\n" +
  "• why_this: ≤60 chars, a scannable micro-reason (≤12 words).\n" +
  "• decision_frame: 1 sentence (≤180 chars) framing this as a recommendation.\n" +
  "Respond ONLY with valid JSON containing these four keys. No markdown, no extra keys.";

export const OPENAI_CHAT_LLM_ADAPTER_ID = "openai_chat_legacy@0.0.0" as const;

export interface OpenAIChatAdapterDeps {
  /** Override for tests. Defaults to global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Override for tests. Defaults to `serverEnv.openAiApiKey`. */
  readonly apiKey?: string;
}

/**
 * Performs the OpenAI chat-completions fetch with byte-identical request shape
 * to the legacy inline code at `route.ts:849-867`. Returns a loose copy patch
 * (only string fields); per-field char caps are enforced in the route. Returns
 * `null` on any transport/parse failure so the caller falls back to
 * deterministic copy unchanged.
 */
async function callOpenAIChatCompletions(
  deps: OpenAIChatAdapterDeps,
  userPrompt: string,
  options?: { timeout_ms?: number; model?: string },
): Promise<LegacyCopyPatch | null> {
  const apiKey = deps.apiKey ?? serverEnv.openAiApiKey;
  if (!apiKey) return null;

  const fetchImpl = deps.fetchImpl ?? fetch;
  const model = options?.model ?? DEFAULT_MODEL;
  const timeoutMs = options?.timeout_ms ?? COPY_ENHANCE_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 260,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    } as RequestInit);
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let rawContent: string;
  try {
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    rawContent = data.choices?.[0]?.message?.content ?? "";
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  return {
    rationale: typeof obj.rationale === "string" ? obj.rationale : undefined,
    why_now: typeof obj.why_now === "string" ? obj.why_now : undefined,
    why_this: typeof obj.why_this === "string" ? obj.why_this : undefined,
    decision_frame: typeof obj.decision_frame === "string" ? obj.decision_frame : undefined,
  };
}

/**
 * Builds the default OpenAI chat LLM adapter. Injectable deps support unit
 * tests without network calls.
 */
export function createOpenAIChatLLMAdapter(deps: OpenAIChatAdapterDeps = {}): LLMAdapter {
  return legacyOpenAIAdapter({
    id: OPENAI_CHAT_LLM_ADAPTER_ID,
    enhanceCopy: (prompt, options) => callOpenAIChatCompletions(deps, prompt, options),
  });
}
